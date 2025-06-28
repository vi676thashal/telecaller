/**
 * ZERO LATENCY REAL-TIME AUDIO PROCESSOR
 * Implements human-like conversation flow with instantaneous response
 * Features:
 * - Real-time audio streaming processing (no buffering delays)
 * - Instant voice activity detection and interruption handling
 * - Simultaneous listen/speak capability (full duplex)
 * - Sub-50ms response initiation target
 * - Human-like conversation timing
 */

const { EventEmitter } = require('events');
const { Readable, Transform } = require('stream');

class ZeroLatencyAudioProcessor extends EventEmitter {
  constructor(callId, options = {}) {
    super();
    
    this.callId = callId;
    this.config = {
      // Ultra-low latency targets (human-like timing)
      responseInitiationTarget: 50,  // Start responding within 50ms
      firstAudioChunkTarget: 100,   // First audio chunk within 100ms
      vadSensitivity: 0.01,         // Very sensitive voice detection
      silenceThreshold: 200,        // 200ms silence = user finished
      interruptionGrace: 150,       // Allow 150ms for natural pauses
      streamingChunkSize: 512,      // Small chunks for minimal buffering
      ...options
    };
    
    // Real-time state tracking
    this.isListening = true;
    this.isResponding = false;
    this.userSpeaking = false;
    this.aiSpeaking = false;
    this.lastUserActivity = 0;
    this.lastAudioChunk = 0;
    this.responseStartTime = 0;
    
    // Audio processing streams
    this.audioInputBuffer = [];
    this.audioOutputQueue = [];
    this.processingPipeline = null;
    
    // Conversation flow state
    this.conversationContext = null;
    this.preparingResponse = false;
    this.responseReady = false;
    this.streamingResponse = false;
    
    this._initializeRealTimeProcessing();
  }
  
  /**
   * Initialize ultra-low latency audio processing pipeline
   */
  _initializeRealTimeProcessing() {
    console.log(`[ZeroLatency ${this.callId}] Initializing human-like conversation processor`);
    
    // Create real-time processing pipeline
    this.processingPipeline = new Transform({
      objectMode: true,
      transform: (chunk, encoding, callback) => {
        this._processAudioChunkRealTime(chunk);
        callback();
      }
    });
    
    // Set up ultra-sensitive voice activity detection
    this._setupInstantVAD();
    
    // Initialize predictive response preparation
    this._setupPredictiveResponseGen();
    
    // Start real-time monitoring
    this._startRealTimeMonitoring();
  }
  
  /**
   * Ultra-sensitive voice activity detection for instant response
   */
  _setupInstantVAD() {
    this.vadProcessor = new Transform({
      transform: (chunk, encoding, callback) => {
        const audioLevel = this._calculateAudioLevel(chunk);
        const timestamp = Date.now();
        
        // Instant voice detection
        if (audioLevel > this.config.vadSensitivity) {
          if (!this.userSpeaking) {
            this.userSpeaking = true;
            this.lastUserActivity = timestamp;
            
            // Immediately stop AI if speaking
            if (this.aiSpeaking) {
              this._immediateInterrupt();
            }
            
            this.emit('userStartedSpeaking', { timestamp, audioLevel });
          }
          this.lastAudioChunk = timestamp;
        } else {
          // Check for end of speech (silence detection)
          if (this.userSpeaking && 
              (timestamp - this.lastAudioChunk) > this.config.silenceThreshold) {
            this._handleUserFinishedSpeaking(timestamp);
          }
        }
        
        callback(null, chunk);
      }
    });
  }
  
  /**
   * Predictive response generation for zero-latency replies
   */
  _setupPredictiveResponseGen() {
    // Pre-generate common responses for instant delivery
    this.responseCache = new Map();
    this.contextualPredictions = [];
    
    // Start preparing responses as user speaks
    this.on('userStartedSpeaking', () => {
      if (!this.preparingResponse) {
        this._startPredictiveGeneration();
      }
    });
  }
  
  /**
   * Start real-time monitoring for human-like timing
   */
  _startRealTimeMonitoring() {
    // Monitor conversation flow every 10ms for instant response
    this.monitoringInterval = setInterval(() => {
      this._checkConversationFlow();
    }, 10);
    
    // Log latency metrics every second
    this.metricsInterval = setInterval(() => {
      this._logLatencyMetrics();
    }, 1000);
  }
  
  /**
   * Process audio chunk in real-time with minimal delay
   */
  _processAudioChunkRealTime(audioChunk) {
    const processStartTime = Date.now();
    
    try {
      // Add to processing buffer (minimal buffering)
      this.audioInputBuffer.push({
        data: audioChunk,
        timestamp: processStartTime
      });
      
      // Keep buffer small for low latency
      if (this.audioInputBuffer.length > 5) {
        this.audioInputBuffer.shift();
      }
      
      // Immediate transcription triggering for fast response
      this._triggerInstantTranscription();
      
      const processingTime = Date.now() - processStartTime;
      if (processingTime > 5) {
        console.warn(`[ZeroLatency ${this.callId}] Audio processing took ${processingTime}ms (target: <5ms)`);
      }
      
    } catch (error) {
      console.error(`[ZeroLatency ${this.callId}] Real-time processing error:`, error);
    }
  }
  
  /**
   * Handle user finished speaking with immediate response preparation
   */
  _handleUserFinishedSpeaking(timestamp) {
    console.log(`[ZeroLatency ${this.callId}] User finished speaking, initiating instant response`);
    
    this.userSpeaking = false;
    this.responseStartTime = timestamp;
    
    // Immediately start response generation
    this._generateInstantResponse();
    
    this.emit('userFinishedSpeaking', { 
      timestamp, 
      speechDuration: timestamp - this.lastUserActivity 
    });
  }
  
  /**
   * Generate instant response with zero-latency target
   */
  async _generateInstantResponse() {
    const responseStartTime = Date.now();
    
    try {
      console.log(`[ZeroLatency ${this.callId}] Generating instant response...`);
      
      this.isResponding = true;
      
      // 1. INSTANT TRANSCRIPTION (target: <50ms)
      const transcription = await this._getInstantTranscription();
      
      // 2. IMMEDIATE RESPONSE GENERATION (target: <100ms)  
      const response = await this._generateResponseInstantly(transcription);
      
      // 3. START AUDIO STREAMING IMMEDIATELY (target: <150ms total)
      await this._startInstantAudioStreaming(response);
      
      const totalResponseTime = Date.now() - responseStartTime;
      console.log(`[ZeroLatency ${this.callId}] Total response time: ${totalResponseTime}ms (human-like: ${totalResponseTime < 200 ? '✅' : '❌'})`);
      
      this.emit('responseGenerated', {
        transcription,
        response,
        latency: totalResponseTime,
        humanLike: totalResponseTime < 200
      });
      
    } catch (error) {
      console.error(`[ZeroLatency ${this.callId}] Instant response generation failed:`, error);
      this._fallbackQuickResponse();
    }
  }
  
  /**
   * Ultra-fast transcription for immediate response
   */
  async _getInstantTranscription() {
    const transcriptStartTime = Date.now();
    
    // Use accumulated audio buffer for transcription
    const audioData = Buffer.concat(this.audioInputBuffer.map(chunk => chunk.data));
    
    try {
      // Use fastest available transcription service
      const transcription = await this._fastTranscribe(audioData);
      
      const transcriptionTime = Date.now() - transcriptStartTime;
      console.log(`[ZeroLatency ${this.callId}] Transcription completed in ${transcriptionTime}ms`);
      
      return transcription;
      
    } catch (error) {
      console.error(`[ZeroLatency ${this.callId}] Fast transcription failed:`, error);
      return "[Audio transcription unavailable]";
    }
  }
  
  /**
   * Generate response instantly using cached/predicted responses when possible
   */
  async _generateResponseInstantly(transcription) {
    const genStartTime = Date.now();
    
    try {
      // Check for cached quick responses first
      const cachedResponse = this._getCachedResponse(transcription);
      if (cachedResponse) {
        console.log(`[ZeroLatency ${this.callId}] Using cached response (0ms generation time)`);
        return cachedResponse;
      }
      
      // Generate new response with workflow engine
      const response = await this.conversationContext?.processCustomerResponse?.(transcription) || 
                      await this._generateWorkflowResponse(transcription);
      
      const generationTime = Date.now() - genStartTime;
      console.log(`[ZeroLatency ${this.callId}] Response generated in ${generationTime}ms`);
      
      // Cache common patterns for future instant responses
      this._cacheResponse(transcription, response);
      
      return response;
      
    } catch (error) {
      console.error(`[ZeroLatency ${this.callId}] Response generation failed:`, error);
      return this._getEmergencyResponse();
    }
  }
  
  /**
   * Start instant audio streaming for human-like response delivery
   */
  async _startInstantAudioStreaming(response) {
    const streamStartTime = Date.now();
    
    try {
      console.log(`[ZeroLatency ${this.callId}] Starting instant audio streaming...`);
      
      this.aiSpeaking = true;
      this.streamingResponse = true;
      
      // Configure for ultra-low latency streaming
      const streamingOptions = {
        language: this.conversationContext?.language || 'en-US',
        latencyTarget: 50,           // Ultra-low latency target
        chunkSize: 256,              // Smaller chunks for faster delivery
        voiceProvider: 'openai_fm',  // Fastest provider
        streamingMode: 'instant',    // Instant streaming mode
        bufferSize: 0                // No buffering for zero latency
      };
      
      // Start streaming immediately
      const audioStream = await this._createInstantAudioStream(response.content, streamingOptions);
      
      // Track first chunk latency
      let firstChunk = true;
      audioStream.on('data', (chunk) => {
        if (firstChunk) {
          const firstChunkTime = Date.now() - streamStartTime;
          console.log(`[ZeroLatency ${this.callId}] First audio chunk: ${firstChunkTime}ms (human-like: ${firstChunkTime < 100 ? '✅' : '❌'})`);
          firstChunk = false;
          
          this.emit('firstAudioChunk', { latency: firstChunkTime });
        }
        
        // Stream directly to output with no additional buffering
        this.emit('audioChunk', chunk);
      });
      
      audioStream.on('end', () => {
        this.aiSpeaking = false;
        this.streamingResponse = false;
        this.isResponding = false;
        
        console.log(`[ZeroLatency ${this.callId}] Audio streaming completed`);
        this.emit('responseComplete');
      });
      
    } catch (error) {
      console.error(`[ZeroLatency ${this.callId}] Instant audio streaming failed:`, error);
      this._handleStreamingFailure();
    }
  }
  
  /**
   * Immediate interruption handling for natural conversation flow
   */
  _immediateInterrupt() {
    console.log(`[ZeroLatency ${this.callId}] User interrupted - stopping AI immediately`);
    
    this.aiSpeaking = false;
    this.streamingResponse = false;
    
    // Stop all audio output immediately
    this.emit('stopAudio');
    
    // Clear any queued audio
    this.audioOutputQueue = [];
    
    this.emit('interrupted', { timestamp: Date.now() });
  }
  
  /**
   * Check conversation flow for optimal timing
   */
  _checkConversationFlow() {
    const now = Date.now();
    
    // Check if response is taking too long
    if (this.isResponding && this.responseStartTime) {
      const responseTime = now - this.responseStartTime;
      if (responseTime > 500) { // 500ms is getting too slow for natural conversation
        console.warn(`[ZeroLatency ${this.callId}] Response taking ${responseTime}ms - may feel unnatural`);
      }
    }
    
    // Check for conversation gaps
    if (!this.userSpeaking && !this.aiSpeaking && this.lastUserActivity) {
      const silenceTime = now - this.lastUserActivity;
      if (silenceTime > 3000) { // 3 seconds of silence
        this.emit('conversationGap', { duration: silenceTime });
      }
    }
  }
  
  /**
   * Calculate audio level for voice activity detection
   */
  _calculateAudioLevel(audioBuffer) {
    if (!audioBuffer || audioBuffer.length === 0) return 0;
    
    let sum = 0;
    for (let i = 0; i < audioBuffer.length; i += 2) {
      const sample = audioBuffer.readInt16LE(i);
      sum += Math.abs(sample);
    }
    
    return sum / (audioBuffer.length / 2) / 32768; // Normalize to 0-1
  }
  
  /**
   * Log latency metrics for monitoring performance
   */
  _logLatencyMetrics() {
    if (this.lastMetricsLog && Date.now() - this.lastMetricsLog < 5000) return;
    
    console.log(`[ZeroLatency ${this.callId}] Performance Status:`);
    console.log(`  - Listening: ${this.isListening ? '✅' : '❌'}`);
    console.log(`  - User Speaking: ${this.userSpeaking ? '🎤' : '❌'}`);
    console.log(`  - AI Speaking: ${this.aiSpeaking ? '🔊' : '❌'}`);
    console.log(`  - Response Ready: ${this.responseReady ? '✅' : '⏳'}`);
    
    this.lastMetricsLog = Date.now();
  }
  
  /**
   * Cleanup resources when call ends
   */
  destroy() {
    console.log(`[ZeroLatency ${this.callId}] Cleaning up zero-latency processor`);
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    this.audioInputBuffer = [];
    this.audioOutputQueue = [];
    this.responseCache.clear();
    
    this.emit('destroyed');
  }
  
  // Placeholder methods to be implemented with specific services
  async _fastTranscribe(audioData) {
    // Implementation with fastest transcription service
    throw new Error('_fastTranscribe not implemented');
  }
  
  async _createInstantAudioStream(text, options) {
    // Implementation with audio streaming service
    throw new Error('_createInstantAudioStream not implemented');
  }
  
  _getCachedResponse(transcription) {
    // Check cached responses for instant delivery
    return this.responseCache.get(transcription.toLowerCase());
  }
  
  _cacheResponse(transcription, response) {
    // Cache response for future instant delivery
    this.responseCache.set(transcription.toLowerCase(), response);
  }
  
  _getEmergencyResponse() {
    return {
      content: "I apologize, could you please repeat that?",
      stepType: "clarification"
    };
  }
}

module.exports = ZeroLatencyAudioProcessor;
