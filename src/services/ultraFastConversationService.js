/**
 * Ultra-Fast Conversation Service
 * Provides real-time conversation optimization for natural speech flow
 */

const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');

class UltraFastConversationService extends EventEmitter {
  constructor() {
    super();
    this.conversationSessions = new Map();
    
    // Ultra-fast settings for natural conversation
    this.silenceDetectionMs = parseInt(process.env.SILENCE_DETECTION_THRESHOLD) || 800;
    this.streamingLatencyTarget = parseInt(process.env.STREAMING_LATENCY_TARGET) || 50;
    this.interimResultsEnabled = process.env.STT_INTERIM_RESULTS === 'true';
    this.voiceActivityThreshold = 0.01; // Very sensitive voice detection
    
    logger.info('[UltraFastConversation] Service initialized with ultra-fast settings', {
      silenceDetection: this.silenceDetectionMs + 'ms',
      latencyTarget: this.streamingLatencyTarget + 'ms',
      interimResults: this.interimResultsEnabled
    });
  }

  /**
   * Initialize ultra-fast conversation session
   */
  initializeSession(callId, options = {}) {
    const session = {
      callId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      silenceStart: null,
      isProcessing: false,
      isListening: true,
      audioChunks: [],
      partialTranscription: '',
      responseLatencies: [],
      conversationTurns: 0,
      
      // Ultra-fast settings
      silenceThreshold: options.silenceThreshold || this.silenceDetectionMs,
      voiceActivityDetected: false,
      lastVoiceActivity: null,
      
      // Audio quality metrics
      audioLevel: 0,
      avgAudioLevel: 0,
      noiseLevel: 0,
      
      // Performance tracking
      avgResponseTime: 0,
      fastestResponse: Infinity,
      slowestResponse: 0
    };

    this.conversationSessions.set(callId, session);
    
    logger.info('[UltraFastConversation] Session initialized', {
      callId,
      silenceThreshold: session.silenceThreshold + 'ms'
    });

    return session;
  }

  /**
   * Process real-time audio chunk with ultra-fast voice activity detection
   */
  processAudioChunk(callId, audioChunk) {
    const session = this.conversationSessions.get(callId);
    if (!session || !session.isListening) return;

    const now = Date.now();
    session.lastActivity = now;

    // Calculate audio level for real-time voice activity detection
    const audioLevel = this.calculateAudioLevel(audioChunk);
    session.audioLevel = audioLevel;
    
    // Update rolling average for noise floor detection
    session.avgAudioLevel = (session.avgAudioLevel * 0.9) + (audioLevel * 0.1);
    
    // Dynamic voice activity threshold based on ambient noise
    const adaptiveThreshold = Math.max(this.voiceActivityThreshold, session.avgAudioLevel * 2);
    
    // Voice activity detection
    if (audioLevel > adaptiveThreshold) {
      if (!session.voiceActivityDetected) {
        session.voiceActivityDetected = true;
        session.lastVoiceActivity = now;
        session.silenceStart = null;
        
        // Emit voice activity start event
        this.emit('voiceActivityStart', { callId, audioLevel, threshold: adaptiveThreshold });
        
        logger.debug('[UltraFastConversation] Voice activity detected', {
          callId,
          audioLevel: audioLevel.toFixed(4),
          threshold: adaptiveThreshold.toFixed(4)
        });
      }
      
      // Store audio chunk for processing
      session.audioChunks.push({
        data: audioChunk,
        timestamp: now,
        audioLevel
      });
      
    } else {
      // Silence detected
      if (session.voiceActivityDetected && !session.silenceStart) {
        session.silenceStart = now;
        logger.debug('[UltraFastConversation] Silence start detected', { callId });
      }
      
      // Check if silence duration meets threshold for processing
      if (session.silenceStart && !session.isProcessing) {
        const silenceDuration = now - session.silenceStart;
        
        if (silenceDuration >= session.silenceThreshold && session.audioChunks.length > 0) {
          this.triggerUltraFastProcessing(callId);
        }
      }
    }
  }

  /**
   * Calculate normalized audio level
   */
  calculateAudioLevel(audioChunk) {
    if (!audioChunk || audioChunk.length === 0) return 0;
    
    let sum = 0;
    let peak = 0;
    
    for (let i = 0; i < audioChunk.length; i++) {
      const sample = Math.abs(this.mulawToLinear(audioChunk[i]));
      sum += sample;
      peak = Math.max(peak, sample);
    }
    
    // Return RMS with peak detection for better voice activity detection
    const rms = Math.sqrt(sum / audioChunk.length) / 32768;
    const peakNormalized = peak / 32768;
    
    // Combine RMS and peak for more sensitive voice detection
    return (rms * 0.7) + (peakNormalized * 0.3);
  }

  /**
   * Convert μ-law to linear PCM for audio level calculation
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
   * Trigger ultra-fast speech processing
   */
  async triggerUltraFastProcessing(callId) {
    const session = this.conversationSessions.get(callId);
    if (!session || session.isProcessing) return;

    session.isProcessing = true;
    session.voiceActivityDetected = false;
    const startTime = Date.now();

    logger.info('[UltraFastConversation] Triggering ultra-fast processing', {
      callId,
      audioChunks: session.audioChunks.length,
      silenceDuration: startTime - session.silenceStart + 'ms'
    });

    // Emit processing event for upstream handling
    this.emit('ultraFastProcessing', {
      callId,
      audioChunks: session.audioChunks,
      session: session,
      startTime
    });

    // Track conversation metrics
    session.conversationTurns++;
    
    // Clear audio buffer for next turn
    session.audioChunks = [];
    session.silenceStart = null;
  }

  /**
   * Complete processing and calculate metrics
   */
  completeProcessing(callId, transcription = '') {
    const session = this.conversationSessions.get(callId);
    if (!session) return null;

    const processingTime = Date.now() - session.silenceStart;
    session.isProcessing = false;

    // Update response time metrics
    session.responseLatencies.push(processingTime);
    if (session.responseLatencies.length > 10) {
      session.responseLatencies.shift(); // Keep last 10
    }

    session.avgResponseTime = session.responseLatencies.reduce((a, b) => a + b, 0) / session.responseLatencies.length;
    session.fastestResponse = Math.min(session.fastestResponse, processingTime);
    session.slowestResponse = Math.max(session.slowestResponse, processingTime);

    const metrics = {
      callId,
      processingTime,
      avgResponseTime: session.avgResponseTime,
      fastestResponse: session.fastestResponse,
      slowestResponse: session.slowestResponse,
      conversationTurns: session.conversationTurns,
      transcription: transcription,
      isUltraFast: processingTime <= this.streamingLatencyTarget * 2
    };

    logger.info('[UltraFastConversation] Processing completed', metrics);
    
    return metrics;
  }

  /**
   * Get optimized parameters for conversation flow
   */
  getOptimizedParameters(callId) {
    const session = this.conversationSessions.get(callId);
    if (!session) {
      return this.getDefaultParameters();
    }

    // Adaptive parameters based on conversation performance
    const avgLatency = session.avgResponseTime || 1000;
    
    return {
      silenceThreshold: Math.max(500, Math.min(1200, avgLatency * 0.5)),
      chunkSize: avgLatency < 1000 ? 320 : 640,
      maxTokens: avgLatency < 800 ? 80 : 120,
      streamingEnabled: true,
      voiceActivityThreshold: session.avgAudioLevel * 1.5,
      interimResults: true,
      fastMode: avgLatency < 1500
    };
  }

  /**
   * Get default ultra-fast parameters
   */
  getDefaultParameters() {
    return {
      silenceThreshold: this.silenceDetectionMs,
      chunkSize: 320,
      maxTokens: 80,
      streamingEnabled: true,
      voiceActivityThreshold: this.voiceActivityThreshold,
      interimResults: this.interimResultsEnabled,
      fastMode: true
    };
  }

  /**
   * Get session metrics
   */
  getSessionMetrics(callId) {
    const session = this.conversationSessions.get(callId);
    if (!session) return null;

    return {
      callId,
      sessionDuration: Date.now() - session.startTime,
      conversationTurns: session.conversationTurns,
      avgResponseTime: session.avgResponseTime,
      fastestResponse: session.fastestResponse,
      slowestResponse: session.slowestResponse,
      avgAudioLevel: session.avgAudioLevel,
      lastActivity: session.lastActivity,
      isProcessing: session.isProcessing,
      isListening: session.isListening
    };
  }

  /**
   * Clean up session
   */
  cleanupSession(callId) {
    const session = this.conversationSessions.get(callId);
    if (session) {
      const metrics = this.getSessionMetrics(callId);
      logger.info('[UltraFastConversation] Session cleanup', metrics);
      this.conversationSessions.delete(callId);
      return metrics;
    }
    return null;
  }

  /**
   * Enable/disable listening for a session
   */
  setListening(callId, isListening) {
    const session = this.conversationSessions.get(callId);
    if (session) {
      session.isListening = isListening;
      if (!isListening) {
        session.audioChunks = [];
        session.voiceActivityDetected = false;
        session.silenceStart = null;
      }
      logger.debug('[UltraFastConversation] Listening state changed', {
        callId,
        isListening
      });
    }
  }
}

// Create singleton instance
const ultraFastConversationService = new UltraFastConversationService();

module.exports = ultraFastConversationService;
