/**
 * Bidirectional Streaming Service
 * 
 * Handles real-time audio streaming between Twilio and the AI voice agent
 * without relying on MP3 files for reduced latency in credit card sales calls
 */

const { Buffer } = require('buffer');
const { logger } = require('../utils/logger');
const { interruptionHandler } = require('./interruption-handler');
const voiceActivityDetectionService = require('./voiceActivityDetectionService');

class BidirectionalStreamingService {
  constructor() {
    this.activeStreams = new Map();
    this.streamBuffers = new Map();
    this.messageQueue = new Map();
    this.streamLatency = 1800; // Target latency of ~1.8 seconds (below the 2-second requirement)
    this.isProcessing = new Map();
    this.metrics = new Map();
  }

  /**
   * Initialize a new bidirectional stream
   * @param {string} callId - The call identifier
   * @param {WebSocket} ws - The WebSocket connection
   */
  initializeStream(callId, ws) {
    if (this.activeStreams.has(callId)) {
      logger.warn(`Stream for call ${callId} already exists, replacing`);
    }

    logger.info(`Initializing bidirectional stream for call ${callId}`);
    
    this.activeStreams.set(callId, {
      callId,
      ws,
      startTime: Date.now(),
      isActive: true,
      currentSequence: 0
    });
    
    this.streamBuffers.set(callId, []);
    this.messageQueue.set(callId, []);
    this.isProcessing.set(callId, false);
    
    // Initialize metrics
    this.metrics.set(callId, {
      audioChunksReceived: 0,
      audioChunksSent: 0,
      totalLatency: 0,
      latencyMeasurements: 0,
      interruptionsDetected: 0,
      lastUserSpeakingTime: null
    });
    
    // Initialize interruption handler for this call
    interruptionHandler.initializeCall(callId);

    return this.activeStreams.get(callId);
  }

  /**
   * Process incoming audio chunk from Twilio
   * @param {string} callId - The call identifier
   * @param {Buffer} audioChunk - The audio data
   */
  processIncomingAudio(callId, audioChunk) {
    const stream = this.activeStreams.get(callId);
    if (!stream || !stream.isActive) return;
    
    // Update metrics
    const metrics = this.metrics.get(callId);
    metrics.audioChunksReceived++;
    
    // Check for voice activity
    const isUserSpeaking = voiceActivityDetectionService.detectVoiceActivity(audioChunk);
    
    if (isUserSpeaking) {
      metrics.lastUserSpeakingTime = Date.now();
    }
    
    // Store in buffer with timestamp
    const buffer = this.streamBuffers.get(callId) || [];
    buffer.push({
      data: audioChunk,
      timestamp: Date.now(),
      isUserSpeaking
    });
    
    // Keep buffer at reasonable size
    const MAX_BUFFER_SIZE = 50;
    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer.shift();
    }
    
    this.streamBuffers.set(callId, buffer);
    
    // Check for interruptions
    this._checkForInterruptions(callId, audioChunk, isUserSpeaking);
    
    // Emit audio data for processing
    return {
      audioData: audioChunk,
      isUserSpeaking
    };
  }

  /**
   * Check for interruptions in the audio stream
   * @param {string} callId - The call identifier
   * @param {Buffer} audioChunk - The audio data
   * @param {boolean} isUserSpeaking - Whether the user is speaking
   * @private
   */
  _checkForInterruptions(callId, audioChunk, isUserSpeaking) {
    // Use the interruption handler to check for interruptions
    const interruptionDetected = interruptionHandler.processAudioSegment(
      callId,
      { 
        chunk: audioChunk,
        timestamp: Date.now()
      },
      isUserSpeaking
    );
    
    if (interruptionDetected) {
      // Update metrics
      const metrics = this.metrics.get(callId);
      metrics.interruptionsDetected++;
      
      logger.info(`Interruption detected in call ${callId}, pausing AI speech`);
      
      // Emit interruption event that can be handled by the call coordinator
      return true;
    }
    
    return false;
  }
  
  /**
   * Send audio data to the customer via WebSocket
   * @param {string} callId - The call identifier
   * @param {Buffer} audioData - The audio data to send
   * @param {boolean} isInterruptible - Whether this audio can be interrupted
   */
  sendAudioToCustomer(callId, audioData, isInterruptible = true) {
    const stream = this.activeStreams.get(callId);
    if (!stream || !stream.isActive) return false;
    
    // Mark that AI is speaking
    interruptionHandler.updateAiSpeakingStatus(callId, true);
    
    try {
      // Create media message in Twilio format
      const message = {
        event: 'media',
        streamSid: callId,
        media: {
          payload: audioData.toString('base64')
        }
      };
      
      // Send to WebSocket
      stream.ws.send(JSON.stringify(message));
      
      // Update metrics
      const metrics = this.metrics.get(callId);
      metrics.audioChunksSent++;
      
      return true;
    } catch (error) {
      logger.error(`Error sending audio to customer for call ${callId}:`, error);
      return false;
    }
  }
  
  /**
   * Finalize streaming and release resources
   * @param {string} callId - The call identifier
   */
  finalizeStream(callId) {
    const stream = this.activeStreams.get(callId);
    if (!stream) return;
    
    logger.info(`Finalizing bidirectional stream for call ${callId}`);
    
    // Mark that AI is not speaking
    interruptionHandler.updateAiSpeakingStatus(callId, false);
    
    // Clean up interruption handler
    interruptionHandler.cleanupCall(callId);
    
    // Clean up stream resources
    this.activeStreams.set(callId, {...stream, isActive: false});
    
    // Clear buffers
    this.streamBuffers.delete(callId);
    this.messageQueue.delete(callId);
    this.isProcessing.delete(callId);
    
    // Get final metrics
    const metrics = this.metrics.get(callId);
    const avgLatency = metrics.latencyMeasurements > 0 
      ? metrics.totalLatency / metrics.latencyMeasurements 
      : 0;
    
    logger.info(`Stream metrics for call ${callId}:`, {
      audioChunksReceived: metrics.audioChunksReceived,
      audioChunksSent: metrics.audioChunksSent,
      averageLatency: `${avgLatency.toFixed(2)}ms`,
      interruptionsDetected: metrics.interruptionsDetected,
      callDuration: `${((Date.now() - stream.startTime) / 1000).toFixed(2)}s`
    });
    
    // Clean up metrics
    this.metrics.delete(callId);
    
    return {
      callDuration: Date.now() - stream.startTime,
      interruptionsDetected: metrics.interruptionsDetected,
      avgLatency
    };
  }
  
  /**
   * Get stream statistics for a call
   * @param {string} callId - The call identifier
   * @returns {Object} - Stream statistics
   */
  getStreamStatistics(callId) {
    const stream = this.activeStreams.get(callId);
    if (!stream) return null;
    
    const metrics = this.metrics.get(callId);
    const interruptionStats = interruptionHandler.getStatistics(callId);
    
    return {
      callDuration: Date.now() - stream.startTime,
      audioChunksReceived: metrics.audioChunksReceived,
      audioChunksSent: metrics.audioChunksSent,
      interruptionsDetected: metrics.interruptionsDetected,
      interruptionStats,
      isActive: stream.isActive,
      lastUserSpeakingTime: metrics.lastUserSpeakingTime
    };
  }
}

// Create singleton instance
const bidirectionalStreamingService = new BidirectionalStreamingService();
module.exports = { bidirectionalStreamingService };
