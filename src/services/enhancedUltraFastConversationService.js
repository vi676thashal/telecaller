/**
 * Enhanced Ultra-Fast Conversation Service
 * Optimized specifically for Google STT with enhanced accuracy and speed
 */

const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');
const enhancedGoogleSpeechService = require('./enhancedGoogleSpeechService');
const audioStreamService = require('./audioStreamService');
const voiceProviderService = require('./voiceProviderService');
const openaiService = require('./openaiService');

class EnhancedUltraFastConversationService extends EventEmitter {
  constructor() {
    super();
    this.conversationSessions = new Map();
    this.activeStreams = new Map();
    
    // Ultra-fast optimized settings for Google STT
    this.config = {
      // Ultra-fast silence detection (reduced from 1.5s to 0.7s)
      silenceDetectionMs: 700,
      
      // Real-time streaming targets
      streamingLatencyTarget: 40,  // Target 40ms latency
      maxResponseDelay: 2000,      // Maximum 2s total response time
      
      // Enhanced audio processing
      audioChunkSize: 160,         // 10ms chunks for ultra-smooth processing
      audioSampleRate: 8000,       // Optimized for phone calls
      audioEncoding: 'MULAW',
      
      // Google STT optimizations
      enableInterimResults: true,
      enableVoiceActivityDetection: true,
      voiceActivityThreshold: 0.008, // Very sensitive for quick detection
      
      // Conversation flow optimizations
      enableOverlapDetection: true,
      allowSpeechInterruption: true,
      fastResponseThreshold: 0.85,  // Confidence threshold for quick responses
      
      // Language and accuracy enhancements
      primaryLanguage: 'en-US',
      secondaryLanguage: 'hi-IN',
      enableLanguageDetection: true,
      enableContextualBoosting: true,
      
      // Performance monitoring
      enablePerformanceLogging: true,
      targetTranscriptionTime: 300,   // Target 300ms for transcription
      targetTTSTime: 500,             // Target 500ms for TTS generation
      targetStreamingTime: 100        // Target 100ms for audio streaming
    };
    
    // Performance metrics tracking
    this.metrics = {
      totalSessions: 0,
      avgTranscriptionTime: 0,
      avgResponseTime: 0,
      avgTTSTime: 0,
      successRate: 0,
      interruptionRate: 0
    };
    
    logger.info('[EnhancedUltraFast] Service initialized with Google STT optimizations', {
      silenceDetection: this.config.silenceDetectionMs + 'ms',
      latencyTarget: this.config.streamingLatencyTarget + 'ms',
      chunkSize: this.config.audioChunkSize + ' bytes',
      enableInterim: this.config.enableInterimResults
    });
  }

  /**
   * Create ultra-fast conversation session with Google STT optimization
   */
  async createSession(sessionId, options = {}) {
    try {
      const sessionConfig = {
        ...this.config,
        ...options,
        sessionId,
        startTime: Date.now(),
        
        // Google STT specific configuration
        speechConfig: {
          encoding: this.config.audioEncoding,
          sampleRateHertz: this.config.audioSampleRate,
          languageCode: options.language || this.config.primaryLanguage,
          alternativeLanguageCodes: [this.config.secondaryLanguage],
          model: 'latest_short',
          useEnhanced: true,
          enableAutomaticPunctuation: true,
          enableVoiceActivityEvents: true,
          profanityFilter: false
        },
        
        // Streaming optimization
        streamingConfig: {
          enableVoiceActivityEvents: true,
          voiceActivityTimeout: {
            speechStartTimeout: { seconds: 1 },
            speechEndTimeout: { nanos: this.config.silenceDetectionMs * 1000000 }
          }
        },
        
        // Conversation state
        isListening: false,
        isSpeaking: false,
        lastActivity: Date.now(),
        interimResults: [],
        finalResults: [],
        
        // Performance tracking
        metrics: {
          transcriptionTimes: [],
          responseTimes: [],
          ttsTimes: [],
          streamingTimes: [],
          totalRequests: 0,
          successfulRequests: 0
        }
      };
      
      this.conversationSessions.set(sessionId, sessionConfig);
      this.metrics.totalSessions++;
      
      logger.info(`[EnhancedUltraFast] Created session ${sessionId}`, {
        language: sessionConfig.speechConfig.languageCode,
        silenceThreshold: this.config.silenceDetectionMs,
        enableVAD: sessionConfig.speechConfig.enableVoiceActivityEvents
      });
      
      this.emit('sessionCreated', { sessionId, config: sessionConfig });
      return sessionConfig;
      
    } catch (error) {
      logger.error(`[EnhancedUltraFast] Error creating session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Process audio with ultra-fast Google STT transcription
   */
  async processAudio(sessionId, audioBuffer, options = {}) {
    const startTime = Date.now();
    const session = this.conversationSessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      session.metrics.totalRequests++;
      
      // Skip processing if AI is currently speaking (unless interruption is enabled)
      if (session.isSpeaking && !this.config.allowSpeechInterruption) {
        logger.debug(`[EnhancedUltraFast] Skipping audio processing - AI is speaking`);
        return null;
      }
      
      logger.debug(`[EnhancedUltraFast] Processing audio chunk (${audioBuffer.length} bytes)`);
      
      // Enhanced Google STT transcription with ultra-fast settings
      const transcriptionStartTime = Date.now();
      
      const transcription = await enhancedGoogleSpeechService.transcribe(audioBuffer, {
        ...session.speechConfig,
        ...options
      });
      
      const transcriptionTime = Date.now() - transcriptionStartTime;
      session.metrics.transcriptionTimes.push(transcriptionTime);
      
      // Performance logging
      if (this.config.enablePerformanceLogging) {
        if (transcriptionTime > this.config.targetTranscriptionTime) {
          logger.warn(`[EnhancedUltraFast] Transcription slow: ${transcriptionTime}ms (target: ${this.config.targetTranscriptionTime}ms)`);
        } else {
          logger.debug(`[EnhancedUltraFast] Fast transcription: ${transcriptionTime}ms`);
        }
      }
      
      if (!transcription || transcription.trim().length === 0) {
        logger.debug('[EnhancedUltraFast] Empty transcription result');
        return null;
      }
      
      logger.info(`[EnhancedUltraFast] Transcription completed in ${transcriptionTime}ms: "${transcription}"`);
      
      // Store transcription result
      const result = {
        sessionId,
        transcription: transcription.trim(),
        timestamp: Date.now(),
        processingTime: transcriptionTime,
        confidence: options.confidence || 0.9,
        language: session.speechConfig.languageCode,
        isFinal: true
      };
      
      session.finalResults.push(result);
      session.lastActivity = Date.now();
      session.metrics.successfulRequests++;
      
      this.emit('transcriptionReceived', result);
      
      // Update running metrics
      this.updateMetrics();
      
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`[EnhancedUltraFast] Error processing audio after ${processingTime}ms:`, error);
      
      this.emit('transcriptionError', {
        sessionId,
        error: error.message,
        processingTime
      });
      
      return null;
    }
  }

  /**
   * Generate ultra-fast AI response with Google TTS
   */
  async generateResponse(sessionId, userMessage, options = {}) {
    const startTime = Date.now();
    const session = this.conversationSessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      logger.info(`[EnhancedUltraFast] Generating response for: "${userMessage}"`);
      
      // Mark as generating response
      session.isListening = false;
      session.lastActivity = Date.now();
      
      // Generate AI response with optimized settings
      const responseStartTime = Date.now();
      
      const aiResponse = await openaiService.generateResponse(userMessage, {
        sessionId,
        maxTokens: options.maxTokens || 150,  // Shorter responses for faster generation
        temperature: options.temperature || 0.7,
        model: options.model || 'gpt-3.5-turbo', // Faster model
        stream: false, // Disable streaming for faster complete response
        ...options
      });
      
      const responseTime = Date.now() - responseStartTime;
      session.metrics.responseTimes.push(responseTime);
      
      if (this.config.enablePerformanceLogging) {
        if (responseTime > this.config.maxResponseDelay) {
          logger.warn(`[EnhancedUltraFast] Response generation slow: ${responseTime}ms`);
        } else {
          logger.debug(`[EnhancedUltraFast] Fast response generation: ${responseTime}ms`);
        }
      }
      
      logger.info(`[EnhancedUltraFast] AI response generated in ${responseTime}ms: "${aiResponse}"`);
      
      const result = {
        sessionId,
        userMessage,
        aiResponse,
        timestamp: Date.now(),
        responseTime,
        totalProcessingTime: Date.now() - startTime
      };
      
      this.emit('responseGenerated', result);
      
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`[EnhancedUltraFast] Error generating response after ${processingTime}ms:`, error);
      
      this.emit('responseError', {
        sessionId,
        userMessage,
        error: error.message,
        processingTime
      });
      
      throw error;
    }
  }

  /**
   * Stream ultra-fast TTS response using Enhanced Google TTS
   */
  async streamResponse(sessionId, responseText, audioStream, options = {}) {
    const startTime = Date.now();
    const session = this.conversationSessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      logger.info(`[EnhancedUltraFast] Streaming TTS response: "${responseText.substring(0, 50)}..."`);
      
      // Mark as speaking
      session.isSpeaking = true;
      session.lastActivity = Date.now();
      
      // Generate speech with Enhanced Google TTS
      const ttsStartTime = Date.now();
      
      const success = await enhancedGoogleSpeechService.textToSpeech(responseText, audioStream, {
        language: session.speechConfig.languageCode,
        emotion: options.emotion || 'neutral',
        gender: options.gender || 'FEMALE',
        ...options
      });
      
      const ttsTime = Date.now() - ttsStartTime;
      session.metrics.ttsTimes.push(ttsTime);
      
      if (this.config.enablePerformanceLogging) {
        if (ttsTime > this.config.targetTTSTime) {
          logger.warn(`[EnhancedUltraFast] TTS generation slow: ${ttsTime}ms`);
        } else {
          logger.debug(`[EnhancedUltraFast] Fast TTS generation: ${ttsTime}ms`);
        }
      }
      
      // Mark as finished speaking
      session.isSpeaking = false;
      session.lastActivity = Date.now();
      
      const totalTime = Date.now() - startTime;
      
      logger.info(`[EnhancedUltraFast] TTS streaming completed in ${totalTime}ms (TTS: ${ttsTime}ms)`);
      
      const result = {
        sessionId,
        responseText,
        ttsTime,
        totalTime,
        success,
        timestamp: Date.now()
      };
      
      this.emit('responseStreamed', result);
      
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`[EnhancedUltraFast] Error streaming response after ${processingTime}ms:`, error);
      
      // Ensure speaking state is cleared
      session.isSpeaking = false;
      
      this.emit('streamingError', {
        sessionId,
        responseText,
        error: error.message,
        processingTime
      });
      
      throw error;
    }
  }

  /**
   * Complete conversation flow: transcribe → generate → stream
   */
  async processCompleteConversation(sessionId, audioBuffer, audioStream, options = {}) {
    const startTime = Date.now();
    
    try {
      logger.info(`[EnhancedUltraFast] Starting complete conversation flow for session ${sessionId}`);
      
      // Step 1: Ultra-fast transcription
      const transcriptionResult = await this.processAudio(sessionId, audioBuffer, options);
      
      if (!transcriptionResult || !transcriptionResult.transcription) {
        logger.debug('[EnhancedUltraFast] No transcription available, skipping response');
        return null;
      }
      
      // Step 2: Generate AI response
      const responseResult = await this.generateResponse(
        sessionId, 
        transcriptionResult.transcription, 
        options
      );
      
      // Step 3: Stream TTS response
      const streamResult = await this.streamResponse(
        sessionId,
        responseResult.aiResponse,
        audioStream,
        options
      );
      
      const totalTime = Date.now() - startTime;
      
      const completeResult = {
        sessionId,
        userMessage: transcriptionResult.transcription,
        aiResponse: responseResult.aiResponse,
        transcriptionTime: transcriptionResult.processingTime,
        responseTime: responseResult.responseTime,
        ttsTime: streamResult.ttsTime,
        totalTime,
        timestamp: Date.now()
      };
      
      logger.info(`[EnhancedUltraFast] Complete conversation flow finished in ${totalTime}ms`, {
        transcription: transcriptionResult.processingTime + 'ms',
        response: responseResult.responseTime + 'ms',
        tts: streamResult.ttsTime + 'ms'
      });
      
      this.emit('conversationCompleted', completeResult);
      
      return completeResult;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error(`[EnhancedUltraFast] Complete conversation flow failed after ${processingTime}ms:`, error);
      
      this.emit('conversationError', {
        sessionId,
        error: error.message,
        processingTime
      });
      
      throw error;
    }
  }

  /**
   * Update performance metrics
   */
  updateMetrics() {
    const allSessions = Array.from(this.conversationSessions.values());
    
    if (allSessions.length === 0) return;
    
    // Calculate averages across all sessions
    let totalTranscriptionTime = 0;
    let totalResponseTime = 0;
    let totalTTSTime = 0;
    let totalRequests = 0;
    let totalSuccessful = 0;
    
    allSessions.forEach(session => {
      const metrics = session.metrics;
      
      totalRequests += metrics.totalRequests;
      totalSuccessful += metrics.successfulRequests;
      
      if (metrics.transcriptionTimes.length > 0) {
        totalTranscriptionTime += metrics.transcriptionTimes.reduce((a, b) => a + b, 0) / metrics.transcriptionTimes.length;
      }
      
      if (metrics.responseTimes.length > 0) {
        totalResponseTime += metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length;
      }
      
      if (metrics.ttsTimes.length > 0) {
        totalTTSTime += metrics.ttsTimes.reduce((a, b) => a + b, 0) / metrics.ttsTimes.length;
      }
    });
    
    this.metrics.avgTranscriptionTime = Math.round(totalTranscriptionTime / allSessions.length);
    this.metrics.avgResponseTime = Math.round(totalResponseTime / allSessions.length);
    this.metrics.avgTTSTime = Math.round(totalTTSTime / allSessions.length);
    this.metrics.successRate = totalRequests > 0 ? Math.round((totalSuccessful / totalRequests) * 100) : 0;
  }

  /**
   * Get session information
   */
  getSession(sessionId) {
    return this.conversationSessions.get(sessionId);
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    this.updateMetrics();
    return {
      ...this.metrics,
      activeSessions: this.conversationSessions.size,
      config: this.config
    };
  }

  /**
   * Clean up session
   */
  async destroySession(sessionId) {
    const session = this.conversationSessions.get(sessionId);
    
    if (session) {
      logger.info(`[EnhancedUltraFast] Destroying session ${sessionId}`);
      
      // Final metrics log
      if (this.config.enablePerformanceLogging && session.metrics.totalRequests > 0) {
        const avgTranscription = session.metrics.transcriptionTimes.length > 0 
          ? Math.round(session.metrics.transcriptionTimes.reduce((a, b) => a + b, 0) / session.metrics.transcriptionTimes.length)
          : 0;
          
        const avgResponse = session.metrics.responseTimes.length > 0
          ? Math.round(session.metrics.responseTimes.reduce((a, b) => a + b, 0) / session.metrics.responseTimes.length)
          : 0;
          
        const avgTTS = session.metrics.ttsTimes.length > 0
          ? Math.round(session.metrics.ttsTimes.reduce((a, b) => a + b, 0) / session.metrics.ttsTimes.length)
          : 0;
        
        logger.info(`[EnhancedUltraFast] Session ${sessionId} final metrics:`, {
          totalRequests: session.metrics.totalRequests,
          successRate: Math.round((session.metrics.successfulRequests / session.metrics.totalRequests) * 100) + '%',
          avgTranscription: avgTranscription + 'ms',
          avgResponse: avgResponse + 'ms',
          avgTTS: avgTTS + 'ms',
          sessionDuration: Math.round((Date.now() - session.startTime) / 1000) + 's'
        });
      }
      
      this.conversationSessions.delete(sessionId);
      this.emit('sessionDestroyed', { sessionId });
    }
  }

  /**
   * Get configuration for external services
   */
  getConfig() {
    return { ...this.config };
  }
}

// Create singleton instance
const enhancedUltraFastConversationService = new EnhancedUltraFastConversationService();

module.exports = enhancedUltraFastConversationService;
