/**
 * Fast Conversation Optimizer Service
 * Optimizes conversation flow for natural, real-time interactions
 */

class FastConversationOptimizer {
  constructor() {
    this.conversationState = new Map();
    this.silenceThreshold = parseInt(process.env.SILENCE_DETECTION_THRESHOLD) || 1500; // 1.5 seconds
    this.fastMode = process.env.FAST_CONVERSATION_MODE === 'true';
  }

  /**
   * Initialize conversation state for a call
   */
  initializeCall(callId) {
    this.conversationState.set(callId, {
      lastAudioChunk: Date.now(),
      silenceStart: null,
      isProcessing: false,
      conversationTurn: 0,
      avgResponseTime: 3000, // Track average response time for optimization
      responseTimes: []
    });
  }

  /**
   * Process incoming audio chunk for faster silence detection
   */
  processAudioChunk(callId, audioChunk) {
    const state = this.conversationState.get(callId);
    if (!state) return;

    const now = Date.now();
    const audioLevel = this.calculateAudioLevel(audioChunk);
    
    // Fast silence detection - threshold for human speech
    const silenceThreshold = 0.02; // Adjust based on audio levels
    
    if (audioLevel < silenceThreshold) {
      if (!state.silenceStart) {
        state.silenceStart = now;
      }
      
      // Check if silence duration meets threshold for faster processing
      const silenceDuration = now - state.silenceStart;
      if (silenceDuration >= this.silenceThreshold && !state.isProcessing) {
        this.triggerFastProcessing(callId);
      }
    } else {
      // Reset silence detection on audio activity
      state.silenceStart = null;
      state.lastAudioChunk = now;
    }
  }

  /**
   * Calculate audio level for silence detection
   */
  calculateAudioLevel(audioChunk) {
    if (!audioChunk || audioChunk.length === 0) return 0;
    
    let sum = 0;
    for (let i = 0; i < audioChunk.length; i++) {
      // Convert μ-law to linear for level calculation
      const linear = this.mulawToLinear(audioChunk[i]);
      sum += Math.abs(linear);
    }
    
    return sum / audioChunk.length / 32768; // Normalize to 0-1 range
  }

  /**
   * Convert μ-law sample to linear PCM
   */
  mulawToLinear(mulaw) {
    const sign = (mulaw & 0x80) ? -1 : 1;
    const exponent = (mulaw & 0x70) >> 4;
    const mantissa = mulaw & 0x0F;
    
    let sample = mantissa << (exponent + 3);
    if (exponent > 0) sample += (1 << (exponent + 7));
    
    return sign * (sample - 128);
  }

  /**
   * Trigger fast processing when silence is detected
   */
  triggerFastProcessing(callId) {
    const state = this.conversationState.get(callId);
    if (!state || state.isProcessing) return;

    state.isProcessing = true;
    const startTime = Date.now();

    // Emit fast processing event
    this.emit('fastProcessingTriggered', {
      callId,
      silenceDuration: Date.now() - state.silenceStart,
      conversationTurn: state.conversationTurn
    });

    // Track response time for optimization
    state.responseTimes.push(startTime);
    if (state.responseTimes.length > 10) {
      state.responseTimes.shift(); // Keep last 10 response times
    }
  }

  /**
   * Mark processing as complete and calculate metrics
   */
  completeProcessing(callId) {
    const state = this.conversationState.get(callId);
    if (!state) return;

    const processingTime = Date.now() - state.responseTimes[state.responseTimes.length - 1];
    state.avgResponseTime = this.calculateAverageResponseTime(state.responseTimes);
    state.isProcessing = false;
    state.conversationTurn++;

    return {
      processingTime,
      avgResponseTime: state.avgResponseTime,
      turn: state.conversationTurn
    };
  }

  /**
   * Calculate average response time for optimization
   */
  calculateAverageResponseTime(responseTimes) {
    if (responseTimes.length === 0) return 3000;
    
    const now = Date.now();
    const durations = responseTimes.map(startTime => now - startTime).slice(-5); // Last 5
    return durations.reduce((sum, time) => sum + time, 0) / durations.length;
  }

  /**
   * Get optimized parameters based on conversation performance
   */
  getOptimizedParameters(callId) {
    const state = this.conversationState.get(callId);
    if (!state) {
      return {
        silenceThreshold: this.silenceThreshold,
        chunkSize: 80,
        maxTokens: 120
      };
    }

    // Adaptive optimization based on performance
    const adaptiveParams = {
      silenceThreshold: this.silenceThreshold,
      chunkSize: 80,
      maxTokens: 120
    };

    // If responses are consistently fast, reduce silence threshold for even faster flow
    if (state.avgResponseTime < 2000) {
      adaptiveParams.silenceThreshold = Math.max(1000, this.silenceThreshold - 300);
      adaptiveParams.chunkSize = 60; // Even smaller chunks
    }

    // If responses are slow, increase threshold to avoid cutting off user
    if (state.avgResponseTime > 4000) {
      adaptiveParams.silenceThreshold = Math.min(2500, this.silenceThreshold + 500);
      adaptiveParams.maxTokens = 100; // Shorter responses
    }

    return adaptiveParams;
  }

  /**
   * Clean up conversation state
   */
  cleanup(callId) {
    this.conversationState.delete(callId);
  }

  /**
   * Get conversation metrics for monitoring
   */
  getMetrics(callId) {
    const state = this.conversationState.get(callId);
    if (!state) return null;

    return {
      avgResponseTime: state.avgResponseTime,
      conversationTurn: state.conversationTurn,
      isProcessing: state.isProcessing,
      lastActivity: state.lastAudioChunk
    };
  }
}

// Event emitter functionality
const EventEmitter = require('events');
class OptimizedFastConversationService extends EventEmitter {
  constructor() {
    super();
    this.optimizer = new FastConversationOptimizer();
  }

  // Delegate methods to optimizer
  initializeCall(callId) {
    return this.optimizer.initializeCall(callId);
  }

  processAudioChunk(callId, audioChunk) {
    return this.optimizer.processAudioChunk(callId, audioChunk);
  }

  triggerFastProcessing(callId) {
    return this.optimizer.triggerFastProcessing(callId);
  }

  completeProcessing(callId) {
    return this.optimizer.completeProcessing(callId);
  }

  getOptimizedParameters(callId) {
    return this.optimizer.getOptimizedParameters(callId);
  }

  cleanup(callId) {
    return this.optimizer.cleanup(callId);
  }

  getMetrics(callId) {
    return this.optimizer.getMetrics(callId);
  }
}

// Create singleton instance
const fastConversationOptimizer = new OptimizedFastConversationService();

module.exports = fastConversationOptimizer;
