/**
 * Real-time Audio Streaming Manager for Credit Card Sales AI Agent
 * Handles bidirectional audio streaming with 2-second max latency
 */

const { Readable } = require('stream');
const { EventEmitter } = require('events');
const { Buffer } = require('buffer');
const { interruptionHandler } = require('./interruption-handler');
const { logger } = require('../utils/logger');

class RealTimeAudioManager extends EventEmitter {
  constructor() {
    super();
    this.activeStreams = new Map();
    this.bufferSize = 1024 * 16; // 16KB buffer for lower latency
    this.streamLatency = 2000; // 2-second target latency
    this.maxBufferAge = 3000; // Maximum buffer age in ms
    this.processingQueues = new Map();
  }

  /**
   * Initialize a new audio stream for a call
   * @param {string} callId - Call identifier
   * @returns {Object} - Stream object
   */
  createStream(callId) {
    if (this.activeStreams.has(callId)) {
      return this.activeStreams.get(callId);
    }

    logger.info(`Creating real-time audio stream for call ${callId} with 2-second latency`);

    // Create input stream (audio from customer)
    const inputStream = new Readable({
      objectMode: true,
      read() {} // No-op as we push data manually
    });

    // Create output stream (audio to customer)
    const outputStream = new Readable({
      objectMode: false,
      read() {} // No-op as we push data manually
    });

    // Create processing queue
    this.processingQueues.set(callId, []);

    // Create stream object
    const streamObj = {
      id: callId,
      input: inputStream,
      output: outputStream,
      buffers: [],
      lastProcessedTime: Date.now(),
      active: true,
      speaking: false,
      latency: this.streamLatency,
      interruptionDetected: false
    };

    // Store stream
    this.activeStreams.set(callId, streamObj);

    // Set up input stream processing with low latency
    inputStream.on('data', (data) => {
      this._processAudioChunk(callId, data);
    });

    inputStream.on('end', () => {
      logger.info(`Input stream ended for call ${callId}`);
      this._cleanup(callId);
    });

    inputStream.on('error', (error) => {
      logger.error(`Error in input stream for call ${callId}:`, error);
      this._cleanup(callId);
    });

    // Initialize metrics
    this._initializeMetrics(callId);

    return streamObj;
  }

  /**
   * Process audio chunk from input stream
   * @param {string} callId - Call identifier
   * @param {Buffer} chunk - Audio chunk
   * @private
   */
  _processAudioChunk(callId, chunk) {
    const stream = this.activeStreams.get(callId);
    if (!stream || !stream.active) return;

    // Add to buffer with timestamp
    stream.buffers.push({
      data: chunk,
      timestamp: Date.now()
    });

    // Clean up old buffers
    this._cleanupOldBuffers(callId);

    // Add to processing queue with priority
    const queue = this.processingQueues.get(callId) || [];
    queue.push({
      type: 'input',
      data: chunk,
      timestamp: Date.now(),
      priority: 1 // High priority for input processing
    });
    this.processingQueues.set(callId, queue);

    // Process queue
    this._processQueue(callId);
  }

  /**
   * Clean up old buffers to prevent memory leaks
   * @param {string} callId - Call identifier
   * @private
   */
  _cleanupOldBuffers(callId) {
    const stream = this.activeStreams.get(callId);
    if (!stream) return;

    const now = Date.now();
    stream.buffers = stream.buffers.filter(buffer => {
      return now - buffer.timestamp < this.maxBufferAge;
    });
  }

  /**
   * Process audio processing queue
   * @param {string} callId - Call identifier
   * @private
   */
  _processQueue(callId) {
    const queue = this.processingQueues.get(callId);
    if (!queue || queue.length === 0) return;

    // Sort by priority (higher number = higher priority)
    queue.sort((a, b) => b.priority - a.priority);

    // Take the highest priority item
    const item = queue.shift();
    this.processingQueues.set(callId, queue);

    // Process based on type
    switch (item.type) {
      case 'input':
        // Emit data for processing by other services
        this.emit('audio', {
          callId,
          data: item.data,
          timestamp: item.timestamp
        });
        break;
      case 'output':
        // Send directly to output stream
        const stream = this.activeStreams.get(callId);
        if (stream && stream.active) {
          stream.output.push(item.data);
        }
        break;
      default:
        logger.warn(`Unknown queue item type for call ${callId}: ${item.type}`);
    }

    // If there are more items in the queue, process next item
    if (queue.length > 0) {
      // Use setImmediate for non-blocking processing
      setImmediate(() => this._processQueue(callId));
    }
  }

  /**
   * Push audio to output stream
   * @param {string} callId - Call identifier
   * @param {Buffer} audioChunk - Audio chunk
   * @returns {boolean} - Success
   */
  pushAudioOutput(callId, audioChunk) {
    const stream = this.activeStreams.get(callId);
    if (!stream || !stream.active) return false;

    // Check for interruption before sending
    if (stream.interruptionDetected) {
      logger.info(`Skipping audio output due to interruption for call ${callId}`);
      return false;
    }

    // Set stream as speaking
    stream.speaking = true;

    // Add to processing queue with priority
    const queue = this.processingQueues.get(callId) || [];
    queue.push({
      type: 'output',
      data: audioChunk,
      timestamp: Date.now(),
      priority: 0 // Lower priority than input
    });
    this.processingQueues.set(callId, queue);

    // Process queue
    this._processQueue(callId);

    return true;
  }

  /**
   * Handle interruption
   * @param {string} callId - Call identifier
   */
  handleInterruption(callId) {
    const stream = this.activeStreams.get(callId);
    if (!stream) return;

    stream.interruptionDetected = true;
    stream.speaking = false;

    // Clear processing queue
    this.processingQueues.set(callId, []);

    // Emit interruption event
    this.emit('interruption', { callId });

    // Reset interruption after delay
    setTimeout(() => {
      if (stream && stream.active) {
        stream.interruptionDetected = false;
      }
    }, 2000); // 2-second reset
  }

  /**
   * Initialize metrics for stream performance monitoring
   * @param {string} callId - Call identifier 
   * @private
   */
  _initializeMetrics(callId) {
    const metrics = {
      bufferSize: 0,
      processedChunks: 0,
      totalLatency: 0,
      peakLatency: 0,
      startTime: Date.now()
    };

    // Update metrics periodically
    const interval = setInterval(() => {
      const stream = this.activeStreams.get(callId);
      if (!stream || !stream.active) {
        clearInterval(interval);
        return;
      }

      metrics.bufferSize = stream.buffers.length;
      
      // Calculate current latency
      const buffers = stream.buffers;
      if (buffers.length > 0) {
        const oldestBuffer = buffers[0];
        const latency = Date.now() - oldestBuffer.timestamp;
        
        metrics.totalLatency += latency;
        metrics.processedChunks++;
        
        if (latency > metrics.peakLatency) {
          metrics.peakLatency = latency;
        }
        
        // Log if latency exceeds target
        if (latency > this.streamLatency) {
          logger.warn(`Latency exceeding target for call ${callId}: ${latency}ms`);
        }
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Clean up resources for a call
   * @param {string} callId - Call identifier
   * @private
   */
  _cleanup(callId) {
    const stream = this.activeStreams.get(callId);
    if (!stream) return;

    stream.active = false;
    stream.buffers = [];
    
    try {
      stream.input.destroy();
      stream.output.push(null); // End the stream
    } catch (error) {
      logger.error(`Error destroying streams for call ${callId}:`, error);
    }

    this.activeStreams.delete(callId);
    this.processingQueues.delete(callId);
    
    logger.info(`Cleaned up real-time audio stream for call ${callId}`);
  }

  /**
   * Destroy stream
   * @param {string} callId - Call identifier
   */
  destroyStream(callId) {
    this._cleanup(callId);
  }

  /**
   * Get active streams count
   * @returns {number} - Number of active streams
   */
  getActiveStreamsCount() {
    return this.activeStreams.size;
  }

  /**
   * Check if stream is active
   * @param {string} callId - Call identifier
   * @returns {boolean} - Whether stream is active
   */
  isStreamActive(callId) {
    const stream = this.activeStreams.get(callId);
    return stream ? stream.active : false;
  }
}

// Create singleton instance
const realTimeAudioManager = new RealTimeAudioManager();
module.exports = { realTimeAudioManager };
