const { Readable } = require('stream');
const WebSocket = require('ws');
const { EventEmitter } = require('events');
const voiceActivityDetectionService = require('./voiceActivityDetectionService_new');
const ZeroLatencyAudioProcessor = require('./zeroLatencyAudioProcessor');
const openAiFmService = require('./openAiFmService');
// Removing conquiTtsService as it's no longer needed
const elevenlabsService = require('./elevenlabsService');
const realTimeLanguageSwitcher = require('./realTimeLanguageSwitcher');
const languageAdaptiveResponseHandler = require('./languageAdaptiveResponseHandler');
const multilingualSpeechProcessor = require('./multilingualSpeechProcessor');
const fs = require('fs');
const path = require('path');

class AudioStream extends EventEmitter {
  constructor(callId) {
    super();
    
    // Initialize essential properties
    this._initializeProperties(callId);
    
    // Set up streams and handlers
    this._setupStreams();
    this._setupEventHandlers();
  }
  
  _initializeProperties(callId) {
    // Basic state
    this.id = callId;
    this.active = true;
    this.speaking = false;
    this.aiSpeaking = false;
    
    // ZERO LATENCY AUDIO PROCESSOR - Human-like conversation timing
    this.zeroLatencyProcessor = new ZeroLatencyAudioProcessor(callId, {
      responseInitiationTarget: 50,   // Start responding within 50ms (human-like)
      firstAudioChunkTarget: 100,    // First audio within 100ms
      vadSensitivity: 0.01,          // Ultra-sensitive voice detection
      silenceThreshold: 200,         // 200ms silence = user finished
      interruptionGrace: 150         // Natural pause allowance
    });
    
    // Connection state
    this.lastActivity = Date.now();
    this.needsReconnect = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.connectionStable = false;
    this.handshakeComplete = false;
    
    // Timeouts
    this.backpressureTimeout = null;
    this.resourceCleanupTimeout = null;
      // Voice and language
    this.detectedLanguage = 'en-US';
    this.emotionalContext = 'neutral';
    this.languageChangeTimestamp = Date.now();
    this.voiceProvider = 'openai_fm'; // Updated from 'clone_voice' to 'openai_fm'
    this.currentVoiceId = null;
    this.lastVoiceSwitch = Date.now();
    this.languageSwitchCount = 0;
    
    // Initialize real-time language switching
    realTimeLanguageSwitcher.initializeCall(this.id, this.detectedLanguage);
    languageAdaptiveResponseHandler.initializeCall(this.id, {
      language: this.detectedLanguage,
      llmProvider: 'openai', // Default LLM provider
      prompt: '',
      script: ''
    });
    
    // Audio state
    this.transcriptionBuffer = [];
    this.lastTranscriptionTime = 0;
    this.isProcessingAudio = false;
    this.streamingAudio = false;
    this.chunkQueue = [];
    this.audioCache = new Map();
    
    // Interactive state
    this.userBargedIn = false;
    this.interruptionAllowed = true;
    this.lastInterruptionTime = 0;
    this.currentSynthesis = null;
    this.synthesisQueue = [];  }

  _setupStreams() {
    // Create readable streams for input and output
    this.input = new Readable({
      read() {},
      highWaterMark: 256 * 1024
    });

    this.output = new Readable({
      read() {},
      highWaterMark: 256 * 1024
    });
  }

  _setupEventHandlers() {
    // Handle input stream events
    this.input.on('error', (error) => {
      console.error(`[AudioStream ${this.id}] Input stream error:`, error);
      this.handleStreamError('input', error);
    });

    this.input.on('drain', () => {
      if (this.backpressureTimeout) {
        clearTimeout(this.backpressureTimeout);
        this.backpressureTimeout = null;
      }
    });

    // Handle output stream events
    this.output.on('error', (error) => {
      console.error(`[AudioStream ${this.id}] Output stream error:`, error);
      this.handleStreamError('output', error);
    });

    // Handle language changes
    this.on('languageChanged', (data) => {
      console.log(`[AudioStream ${this.id}] Language changed to ${data.language}`);
      this.detectedLanguage = data.language;
      this.languageChangeTimestamp = Date.now();
      
      this.emit('serviceEvent', {
        type: 'language_changed',
        callId: this.id,
        language: data.language,
        timestamp: Date.now()
      });
    });

    this.on('emotionChanged', (data) => {
      console.log(`[AudioStream ${this.id}] Emotion changed to ${data.emotion}`);
      this.emit('serviceEvent', {
        type: 'emotion_changed',
        callId: this.id,
        emotion: data.emotion,
        timestamp: Date.now()
      });
    });

    // User barge-in detection
    this.on('userBargeIn', () => {
      if (this.interruptionAllowed && this.aiSpeaking) {
        console.log(`[AudioStream ${this.id}] User barge-in detected, interrupting AI speech`);
        this.interruptAiSpeech();
      }
    });

    // Register with VAD service for transcription callbacks
    voiceActivityDetectionService.registerTranscriptionCallback(this.id, 
      (text, language, isInterim) => this.handleTranscriptionResult(text, language, isInterim));

    // Keep-alive mechanism
    this.keepAliveInterval = setInterval(() => {
      if (!this.active) {
        clearInterval(this.keepAliveInterval);
        return;
      }

      try {
        this.output.push(Buffer.from([0]));
        this.lastActivity = Date.now();
      } catch (error) {
        console.warn(`[AudioStream ${this.id}] Keep-alive error:`, error);
        this.handleStreamError('keepAlive', error);
      }
    }, 5000);

    // Monitor for inactivity
    this.activityCheckInterval = setInterval(() => {
      if (!this.active) {
        clearInterval(this.activityCheckInterval);
        return;
      }

      const inactiveTime = Date.now() - this.lastActivity;
      if (inactiveTime > 300000) {
        console.log(`[AudioStream ${this.id}] Inactive for too long, cleaning up`);
        this.cleanup();
      }
    }, 60000);

    // Schedule periodic resource cleanup
    this.scheduleResourceCleanup();
  }

  setupStreamHandlers() {
    // Setup input stream handlers
    if (this.input) {
      this.input.on('error', (error) => {
        console.error(`[AudioStream ${this.id}] Input stream error:`, error);
        this.handleStreamError('input', error);
      });

      this.input.on('drain', () => {
        if (this.backpressureTimeout) {
          clearTimeout(this.backpressureTimeout);
          this.backpressureTimeout = null;
        }
      });
    }

    // Setup output stream handlers
    if (this.output) {
      this.output.on('error', (error) => {
        console.error(`[AudioStream ${this.id}] Output stream error:`, error);
        this.handleStreamError('output', error);
      });
    }

    // Setup language change handler
    this.on('languageChanged', (data) => {
      console.log(`[AudioStream ${this.id}] Language changed to ${data.language}`);
      this.emit('serviceEvent', {
        type: 'language_changed',
        callId: this.id,
        language: data.language,
        timestamp: Date.now()
      });
    });
    
    this.on('emotionChanged', (data) => {
      console.log(`[AudioStream ${this.id}] Emotion changed to ${data.emotion}`);
      this.emit('serviceEvent', {
        type: 'emotion_changed',
        callId: this.id,
        emotion: data.emotion,
        timestamp: Date.now()
      });
    });
    
    // User barge-in detection
    this.on('userBargeIn', () => {
      if (this.interruptionAllowed && this.aiSpeaking) {
        console.log(`[AudioStream ${this.id}] User barge-in detected, interrupting AI speech`);
        this.interruptAiSpeech();
      }
    });
    
    // Register with VAD service for transcription callbacks
    voiceActivityDetectionService.registerTranscriptionCallback(callId, 
      (text, language, isInterim) => this.handleTranscriptionResult(text, language, isInterim));

    // Keep-alive mechanism with error handling
    this.keepAliveInterval = setInterval(() => {
      if (!this.active) {
        clearInterval(this.keepAliveInterval);
        return;
      }

      try {
        this.output.push(Buffer.from([0])); // Silent frame
        this.lastActivity = Date.now();
      } catch (error) {
        console.warn(`[AudioStream ${this.id}] Keep-alive error:`, error);
        this.handleStreamError('keepAlive', error);
      }
    }, 5000);

    // Monitor for inactivity
    this.activityCheckInterval = setInterval(() => {
      if (!this.active) {
        clearInterval(this.activityCheckInterval);
        return;
      }

      const inactiveTime = Date.now() - this.lastActivity;
      if (inactiveTime > 300000) { // 5 minutes
        console.log(`[AudioStream ${this.id}] Inactive for too long, cleaning up`);
        this.cleanup();
      }
    }, 60000);

    // Schedule periodic resource cleanup
    this.scheduleResourceCleanup();
  }
  
  /**
   * Handle transcription results from the VAD service
   * @param {string} text - Transcribed text
   * @param {string} language - Detected language
   * @param {boolean} isInterim - Whether this is an interim result
   */
  handleTranscriptionResult(text, language, isInterim) {
    if (!this.active) return;
      console.log(`[AudioStream ${this.id}] Transcription received: ${text.substring(0, 50)}... (${language}, interim: ${isInterim})`);
    
    // If AI is speaking and we get user speech, handle potential barge-in
    if (this.aiSpeaking && !isInterim) {
      this.userBargedIn = true;
      this.emit('userBargeIn');
      
      // Process interruption with real-time language switcher
      realTimeLanguageSwitcher.handleUserInterruption(this.id, text);
    }
    
    // Process transcription with real-time language switcher
    if (!isInterim) {
      // Use real-time language switcher to handle language detection and switching
      realTimeLanguageSwitcher.processTranscription(this.id, text, this.aiSpeaking);
    }
    
    // Update language if changed
    const currentLanguage = realTimeLanguageSwitcher.getCurrentLanguage(this.id);
    if (currentLanguage !== this.detectedLanguage) {
      const previousLanguage = this.detectedLanguage;
      this.detectedLanguage = currentLanguage;
      this.languageChangeTimestamp = Date.now();
      this.languageSwitchCount++;
      
      // Switch voice if language changed
      this.handleLanguageChange(previousLanguage, currentLanguage);
      
      // Emit language change event
      this.emit('languageChanged', {
        callId: this.id,
        language: currentLanguage,
        previousLanguage,
        source: 'realTimeLanguageSwitcher',
        switchCount: this.languageSwitchCount
      });
    }
    
    // If not an interim result, process the transcription
    if (!isInterim) {
      // Add to transcription buffer
      this.transcriptionBuffer.push({
        text,
        language: currentLanguage,
        timestamp: Date.now()
      });
      
      // Limit buffer size
      if (this.transcriptionBuffer.length > 20) {
        this.transcriptionBuffer.shift();
      }
      
      // Emit transcription event for processing
      this.emit('transcription', {
        callId: this.id,
        text,
        language,
        confidence: 0.9,  // Whisper is highly accurate
        final: true
      });
    }
  }
  /**
   * Handle language change and voice switching
   * @param {string} previousLanguage - Previous language
   * @param {string} newLanguage - New language
   */
  async handleLanguageChange(previousLanguage, newLanguage) {
    try {
      // For clone_voice provider, select appropriate voice for the new language
      if (this.voiceProvider === 'clone_voice') {
        // Clone voice provider is no longer supported
        console.log(`[AudioStream ${this.id}] Clone voice provider is no longer supported, falling back to current voice`);
        // Switch to OpenAI as default
        this.voiceProvider = 'openai_fm';
      }
      // No special handling for other voice providers - OpenAI FM handles languages automatically
    } catch (error) {
      console.error(`[AudioStream ${this.id}] Error switching voices: ${error.message}`);
    }  }
  
  /**
   * Generate AI response using language-adaptive handler
   * @param {string} userInput - User's transcribed input
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Generated response
   */
  async generateLanguageAdaptiveResponse(userInput, options = {}) {
    try {
      console.log(`[AudioStream ${this.id}] Generating language-adaptive response for: "${userInput.substring(0, 50)}..."`);
      
      // Update language adaptive handler configuration if needed
      if (options.prompt || options.script || options.llmProvider) {
        languageAdaptiveResponseHandler.updateCallConfig(this.id, {
          systemPrompt: options.prompt,
          script: options.script,
          llmProvider: options.llmProvider
        });
      }
      
      // Generate response with real-time language adaptation
      const response = await languageAdaptiveResponseHandler.generateAdaptiveResponse(
        this.id,
        userInput,
        options
      );
      
      console.log(`[AudioStream ${this.id}] Generated response in ${response.language}: "${response.text.substring(0, 50)}..."`);
      
      return response;
      
    } catch (error) {
      console.error(`[AudioStream ${this.id}] Error generating language-adaptive response:`, error);
      
      // Fallback to simple response
      const fallbackLanguage = realTimeLanguageSwitcher.getCurrentLanguage(this.id);
      return {
        text: 'I understand. How can I help you?',
        language: fallbackLanguage,
        audio: null,
        error: error.message
      };
    }
  }
  
  /**
   * Stream AI response with language optimization
   * @param {Object} response - Generated response object
   * @param {Object} options - Streaming options
   * @returns {Promise<boolean>} Success status
   */
  async streamLanguageOptimizedResponse(response, options = {}) {
    try {
      console.log(`[AudioStream ${this.id}] Streaming language-optimized response in ${response.language}`);
      
      // Set AI as speaking
      this.setAiSpeaking(true);
      
      // Update detected language
      this.detectedLanguage = response.language;
      
      // Stream the audio if available
      if (response.audio) {
        // Create audio stream
        const audioStream = new Readable({
          read() {}
        });
        
        // Push audio data
        audioStream.push(response.audio);
        audioStream.push(null); // End of stream
        
        // Pipe to output
        if (this.output) {
          audioStream.pipe(this.output);
        }
        
        // Emit streaming events
        this.emit('aiResponseStreaming', {
          callId: this.id,
          text: response.text,
          language: response.language,
          audioLength: response.audio.length
        });
        
        // Wait for streaming to complete
        await new Promise((resolve) => {
          audioStream.on('end', resolve);
          setTimeout(resolve, 5000); // Timeout after 5 seconds
        });
      }
      
      // Mark AI as no longer speaking
      this.setAiSpeaking(false);
      
      // Emit completion event
      this.emit('aiResponseComplete', {
        callId: this.id,
        text: response.text,
        language: response.language
      });
      
      return true;
      
    } catch (error) {
      console.error(`[AudioStream ${this.id}] Error streaming language-optimized response:`, error);
      this.setAiSpeaking(false);
      return false;
    }
  }
  
  /**
   * Interrupt AI speech due to user barge-in
   */
  interruptAiSpeech() {
    if (!this.aiSpeaking) return;
    
    this.lastInterruptionTime = Date.now();
    
    // Clear the synthesis queue
    this.synthesisQueue = [];
    
    // Stop the current synthesis
    if (this.currentSynthesis) {
      // Signal that we're stopping because of interruption
      this.currentSynthesis.interrupted = true;
      
      // Signal that AI is no longer speaking
      this.setAiSpeaking(false);
      
      // Emit interruption event
      this.emit('aiInterrupted', {
        callId: this.id,
        timestamp: this.lastInterruptionTime
      });
    }  }
  handleStreamError(streamType, error) {
    console.error(`[AudioStream ${this.id}] ${streamType} stream error:`, error);
    this.emit('streamError', {
      callId: this.id,
      streamType,
      error: error.message
    });
    
    // Attempt recovery if appropriate
    this.attemptStreamRecovery(streamType);
  }  setupStreamHandlers() {
    if (this.output) {
      this.output.on('error', (error) => {
        console.error(`[AudioStream ${this.id}] Output stream error:`, error);
        this.handleStreamError('output', error);
      });
    }
    
    if (this.input) {
      this.input.on('drain', () => {
        if (this.backpressureTimeout) {
          clearTimeout(this.backpressureTimeout);
          this.backpressureTimeout = null;
        }
      });
    }
  
    // Setup language and emotion change handlers
    this.on('languageChanged', (data) => {
      console.log(`[AudioStream ${this.id}] Language changed to ${data.language}`);
      // When language changes, we may need to switch TTS voices
      this.emit('serviceEvent', {
        type: 'language_changed',
        callId: this.id,
        language: data.language,
        timestamp: Date.now()
      });
    });
  
    this.on('emotionChanged', (data) => {
      console.log(`[AudioStream ${this.id}] Emotion changed to ${data.emotion}`);
      this.emit('serviceEvent', {
        type: 'emotion_changed',
        callId: this.id,
        emotion: data.emotion,
        timestamp: Date.now()
      });
    });

    // Keep-alive mechanism with error handling
    this.keepAliveInterval = setInterval(() => {
      if (!this.active) {
        clearInterval(this.keepAliveInterval);
        return;
      }

      try {
        this.output.push(Buffer.from([0])); // Silent frame
        this.lastActivity = Date.now();
      } catch (error) {
        console.warn(`[AudioStream ${this.id}] Keep-alive error:`, error);
        this.handleStreamError('keepAlive', error);
      }
    }, 5000);

    // Monitor for inactivity
    this.activityCheckInterval = setInterval(() => {
      if (!this.active) {
        clearInterval(this.activityCheckInterval);
        return;
      }

      const inactiveTime = Date.now() - this.lastActivity;
      if (inactiveTime > 300000) { // 5 minutes
        console.log(`[AudioStream ${this.id}] Inactive for too long, cleaning up`);
        this.cleanup();
      }
    }, 60000);

    // Schedule periodic resource cleanup
    this.scheduleResourceCleanup();
  }

scheduleResourceCleanup() {
  if (this.resourceCleanupTimeout) {
    clearTimeout(this.resourceCleanupTimeout);
  }

  this.resourceCleanupTimeout = setTimeout(() => {
    if (this.active) {
      // Clean up any unused resources
      global.gc && global.gc();
      this.scheduleResourceCleanup();
    }
  }, 300000); // 5 minutes
}

handleStreamError(streamType, error) {
  console.log(`[AudioStream ${this.id}] Handling ${streamType} stream error:`, error.message);
  
  if (!this.active) return;

  if (this.reconnectAttempts < this.maxReconnectAttempts) {
    this.reconnectAttempts++;
    this.needsReconnect = true;
    
    // Attempt recovery based on error type
    if (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED') {
      this.recreateStream(streamType);
    } else {
      this.emit('needsReconnect', this.id);
    }
  } else {
    console.error(`[AudioStream ${this.id}] Max reconnection attempts reached`);
    this.cleanup();
  }
}

recreateStream(streamType) {
  try {
    const newStream = new Readable({
      read() {},
      highWaterMark: 256 * 1024
    });

    if (streamType === 'input') {
      this.input.removeAllListeners();
      this.input = newStream;
    } else {
      this.output.removeAllListeners();
      this.output = newStream;
    }

    console.log(`[AudioStream ${this.id}] Successfully recreated ${streamType} stream`);
    this.emit('streamRecreated', { streamType, id: this.id });
  } catch (error) {
    console.error(`[AudioStream ${this.id}] Failed to recreate ${streamType} stream:`, error);
    this.handleStreamError(streamType, error);
  }
}

push(data) {
  if (!this.active || !this.input || this.input.destroyed) {
    return false;
  }

  try {
    this.lastActivity = Date.now();
    
    // Enhanced backpressure handling
    const success = this.input.push(data);
    
    if (!success) {
      console.log(`[AudioStream ${this.id}] Backpressure detected`);
      
      // Set a timeout to force reconnection if backpressure persists
      if (this.backpressureTimeout) {
        clearTimeout(this.backpressureTimeout);
      }
      
      this.backpressureTimeout = setTimeout(() => {
        console.log(`[AudioStream ${this.id}] Backpressure timeout reached`);
        this.needsReconnect = true;
        this.emit('needsReconnect', this.id);
      }, 5000);
    }
    
    return success;
  } catch (error) {
    console.error(`[AudioStream ${this.id}] Error pushing data:`, error);
    this.handleStreamError('push', error);
    return false;
  }
}

async close() {
  if (!this.active) return;

  this.active = false;
  this.speaking = false;
  this.aiSpeaking = false;
  
  clearInterval(this.keepAliveInterval);
  clearInterval(this.activityCheckInterval);
  clearTimeout(this.backpressureTimeout);
  clearTimeout(this.resourceCleanupTimeout);

  // Clean up streams
  try {
    if (this.input && !this.input.destroyed) {
      this.input.removeAllListeners();
      this.input.destroy();
    }
    if (this.output && !this.output.destroyed) {
      this.output.removeAllListeners();
      this.output.destroy();
    }
  } catch (error) {
    console.error(`[AudioStream ${this.id}] Error during cleanup:`, error);
  }

  // Remove all listeners
  this.removeAllListeners();
  
  // Force garbage collection if available
  if (global.gc) {
    try {
      global.gc();
    } catch (error) {
      console.warn(`[AudioStream ${this.id}] Error during garbage collection:`, error);
    }
  }
}

cleanup() {
  if (!this.active) return;

  console.log(`[AudioStream ${this.id}] Cleaning up resources`);
  this.active = false;
  // Clear all intervals and timeouts
  clearInterval(this.keepAliveInterval);
  clearInterval(this.activityCheckInterval);
  clearTimeout(this.backpressureTimeout);
  clearTimeout(this.resourceCleanupTimeout);

  // Clean up language switching services
  try {
    realTimeLanguageSwitcher.cleanup(this.id);
    languageAdaptiveResponseHandler.cleanup(this.id);
  } catch (error) {
    console.error(`[AudioStream ${this.id}] Error cleaning up language services:`, error);
  }

  // Clean up streams
  try {
    if (this.input && !this.input.destroyed) {
      this.input.removeAllListeners();
      this.input.destroy();
    }
    if (this.output && !this.output.destroyed) {
      this.output.removeAllListeners();
      this.output.destroy();
    }
  } catch (error) {
    console.error(`[AudioStream ${this.id}] Error during cleanup:`, error);
  }

  // Remove all listeners
  this.removeAllListeners();
  
  // Force garbage collection if available
  if (global.gc) {
    try {
      global.gc();
    } catch (error) {
      console.warn(`[AudioStream ${this.id}] Error during garbage collection:`, error);
    }
  }
}

isCustomerSpeaking(callId) {
  if (callId !== this.id || !this.active) {
    return false;
  }
  return this.speaking;
}

isAISpeaking(callId) {
  if (callId !== this.id || !this.active) {
    return false;
  }
  return this.aiSpeaking;
}

setCustomerSpeaking(isSpeaking) {
  if (!this.active) return;
  
  const wasNotSpeaking = !this.speaking;
  this.speaking = isSpeaking;
  
  if (isSpeaking && wasNotSpeaking) {
    this.emit('customerStartedSpeaking', this.id);
  } else if (!isSpeaking && !wasNotSpeaking) {
    this.emit('customerStoppedSpeaking', this.id);
  }
}

setAISpeaking(isSpeaking) {
  if (!this.active) return;
  
  const wasNotSpeaking = !this.aiSpeaking;
  this.aiSpeaking = isSpeaking;
  
  if (isSpeaking && wasNotSpeaking) {
    this.emit('aiStartedSpeaking', this.id);
  } else if (!isSpeaking && !wasNotSpeaking) {
    this.emit('aiStoppedSpeaking', this.id);
  }
}

/**
 * Process incoming audio with VAD
 * @param {Buffer} audioChunk - Audio buffer
 */
processAudioWithVAD(audioChunk) {
  if (!this.active) return;
  
  try {
    // Process with VAD service
    const vadResult = voiceActivityDetectionService.processAudioChunk(audioChunk, 16000, this.id);
    
    // Update speaking state if changed
    if (this.speaking !== vadResult.isSpeaking) {
      this.speaking = vadResult.isSpeaking;
      this.emit('speakingStateChanged', {
        callId: this.id,
        speaking: this.speaking,
        level: vadResult.audioLevel
      });
    }
    
    // If user started speaking, check for barge-in
    if (vadResult.speechEvent === 'start' && this.aiSpeaking) {
      this.emit('userBargeIn');
    }
    
    // Add audio to collection if user is speaking
    if (this.speaking) {
      voiceActivityDetectionService.addAudioToCollection(this.id, audioChunk);
    }
    
    return vadResult;
  } catch (error) {
    console.error(`[AudioStream ${this.id}] Error processing audio with VAD: ${error.message}`);
    return null;
  }
}

/**
 * Update AI speaking state
 * @param {boolean} isSpeaking - Whether AI is speaking
 */
setAiSpeaking(isSpeaking) {
  const wasNotSpeaking = !this.aiSpeaking;
  this.aiSpeaking = isSpeaking;
  
  if (isSpeaking && wasNotSpeaking) {
    this.emit('aiStartedSpeaking', this.id);
  } else if (!isSpeaking && !wasNotSpeaking) {
    this.emit('aiStoppedSpeaking', this.id);
  }
}

/**
 * Stream audio chunks from buffer
 * @param {Buffer} audioBuffer - Full audio buffer
 * @param {number} chunkSize - Size of each chunk in bytes
 * @param {number} interval - Time between chunks in ms
 */
async streamAudioBuffer(audioBuffer, chunkSize = 3200, interval = 20) {
  if (!this.active || this.streamingAudio) return;
  
  this.streamingAudio = true;
  this.setAiSpeaking(true);
  
  try {
    // Split buffer into chunks
    const chunks = [];
    for (let i = 0; i < audioBuffer.length; i += chunkSize) {
      chunks.push(audioBuffer.slice(i, i + chunkSize));
    }
    
    // Stream chunks with proper timing
    for (let i = 0; i < chunks.length; i++) {
      // Check for interruptions
      if (!this.streamingAudio || this.userBargedIn) {
        console.log(`[AudioStream ${this.id}] Streaming interrupted at chunk ${i}/${chunks.length}`);
        break;
      }
      
      // Push audio chunk to output
      this.output.push(chunks[i]);
      
      // Wait for next interval
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  } catch (error) {
    console.error(`[AudioStream ${this.id}] Error streaming audio: ${error.message}`);
  } finally {
    this.streamingAudio = false;
    this.setAiSpeaking(false);
    this.userBargedIn = false;
  }
}

/**
   * Stream audio data to the client with real-time processing
   * @param {Buffer} audioBuffer - Full audio buffer to stream
   * @param {Object} options - Streaming options
   */
  streamAudio(audioBuffer, options = {}) {
    if (!this.active || this.streamingAudio) {
      return false;
    }
    
    const chunkSize = options.chunkSize || 3200; // Default chunk size (~200ms at 16kHz)
    const interval = options.interval || 20;     // Default interval 20ms between chunks
    const allowInterruption = options.allowInterruption !== false; // Default to allow interruptions
    
    this.streamingAudio = true;
    this.setAiSpeaking(true);
    this.userBargedIn = false;
    this.interruptionAllowed = allowInterruption;
    
    // Create a structured object to represent the current synthesis
    const currentSynthesis = {
      id: Date.now(),
      buffer: audioBuffer,
      startTime: Date.now(),
      interrupted: false,
      finished: false
    };
    
    this.currentSynthesis = currentSynthesis;
    
    // Split buffer into chunks
    const chunks = [];
    for (let i = 0; i < audioBuffer.length; i += chunkSize) {
      chunks.push(audioBuffer.slice(i, i + chunkSize));
    }
    
    // Stream chunks with proper timing
    let chunkIndex = 0;
    
    const sendNextChunk = () => {
      if (!this.active || !this.streamingAudio || this.userBargedIn || 
          chunkIndex >= chunks.length || currentSynthesis.interrupted) {
        
        // Signal that we're done or interrupted
        this.streamingAudio = false;
        this.setAiSpeaking(false);
        currentSynthesis.finished = true;
        
        // If interrupted, emit event
        if (this.userBargedIn || currentSynthesis.interrupted) {
          this.emit('streamingInterrupted', {
            callId: this.id,
            chunksSent: chunkIndex,
            totalChunks: chunks.length
          });
        } else {
          this.emit('streamingComplete', {
            callId: this.id,
            totalChunks: chunks.length
          });
        }
        
        return;
      }
      
      // Push the next chunk to the output stream
      this.output.push(chunks[chunkIndex]);
      chunkIndex++;
      
      // Schedule next chunk
      setTimeout(sendNextChunk, interval);
    };
    
    // Start streaming
    sendNextChunk();
    return true;
  }

  /**
   * Synthesize text to audio and stream in real-time with sub-200ms latency target
   * @param {string} text - Text to synthesize
   * @param {Object} options - Synthesis and streaming options
   * @returns {Promise<Object>} Streaming result with stream URL and metadata
   */
  async synthesizeAndStream(text, options = {}) {
    try {
      const {
        language = 'en-US',
        latencyTarget = 50,        // ZERO LATENCY TARGET: 50ms (human-like)
        chunkSize = 256,           // Smaller chunks for faster delivery
        voiceProvider = 'openai_fm',
        emotion = 'neutral'
      } = options;
      
      console.log(`[AudioStream ${this.id}] 🚀 ZERO LATENCY MODE: Starting human-like synthesis with ${voiceProvider}, target: ${latencyTarget}ms`);
      
      // Start synthesis timestamp for latency tracking
      const synthStartTime = Date.now();
      
      // Set up synthesis and streaming parameters
      this.streamingAudio = true;
      this.setAiSpeaking(true);
      this.userBargedIn = false;
      
      // Create streaming URL for Twilio WebSocket connection
      const ngrokUrl = process.env.NGROK_URL || 'http://localhost:5002';
      const streamUrl = `${ngrokUrl}/stream/call/${this.id}/audio`;
      
      // Start real-time synthesis based on voice provider
      let audioStream;
        switch (voiceProvider) {
        case 'openai_fm':
          audioStream = await this.synthesizeWithOpenAI(text, language, emotion);
          break;        case 'elevenlabs':
          audioStream = await this.synthesizeWithElevenLabs(text, language);
          break;
        // Removed case for clone_voice as it's no longer needed
        default:
          // Fallback to OpenAI FM
          audioStream = await this.synthesizeWithOpenAI(text, language, emotion);
      }
      
      if (!audioStream) {
        throw new Error(`Failed to create audio stream with provider: ${voiceProvider}`);
      }
      
      // Track first chunk latency
      let firstChunkReceived = false;
      
      // Set up real-time streaming with chunking
      audioStream.on('data', (chunk) => {
        // Track latency for first chunk
        if (!firstChunkReceived) {
          const firstChunkLatency = Date.now() - synthStartTime;
          const isHumanLike = firstChunkLatency <= latencyTarget;
          console.log(`[AudioStream ${this.id}] 🎯 First chunk latency: ${firstChunkLatency}ms (target: ${latencyTarget}ms) ${isHumanLike ? '✅ HUMAN-LIKE!' : '❌ TOO SLOW'}`);
          firstChunkReceived = true;
          
          // Emit latency metrics with human-like assessment
          this.emit('latencyMetrics', {
            callId: this.id,
            firstChunkLatency,
            targetLatency: latencyTarget,
            withinTarget: isHumanLike,
            humanLike: isHumanLike,
            conversationQuality: isHumanLike ? 'natural' : 'robotic'
          });
        }
        
        // Check for barge-in/interruption
        if (this.userBargedIn || !this.streamingAudio) {
          console.log(`[AudioStream ${this.id}] Real-time streaming interrupted`);
          audioStream.destroy();
          return;
        }
        
        // Stream chunk to output with minimal delay
        this.output.push(chunk);
      });
      
      audioStream.on('end', () => {
        const totalLatency = Date.now() - synthStartTime;
        console.log(`[AudioStream ${this.id}] Real-time streaming completed in ${totalLatency}ms`);
        
        this.streamingAudio = false;
        this.setAiSpeaking(false);
        
        this.emit('streamingComplete', {
          callId: this.id,
          totalLatency,
          withinTarget: totalLatency <= latencyTarget * 3 // Allow 3x latency for total completion
        });
      });
      
      audioStream.on('error', (error) => {
        console.error(`[AudioStream ${this.id}] Real-time synthesis error:`, error);
        this.streamingAudio = false;
        this.setAiSpeaking(false);
        
        this.emit('streamingError', {
          callId: this.id,
          error: error.message
        });
      });
      
      return {
        streamUrl,
        latencyTarget,
        voiceProvider,
        startTime: synthStartTime
      };
      
    } catch (error) {
      console.error(`[AudioStream ${this.id}] synthesizeAndStream error:`, error);
      this.streamingAudio = false;
      this.setAiSpeaking(false);
      throw error;
    }
  }
  
  /**
   * Synthesize audio using OpenAI TTS with real-time streaming
   * @param {string} text - Text to synthesize
   * @param {string} language - Language code
   * @param {string} emotion - Emotional context
   * @returns {Promise<Stream>} Audio stream
   */
  async synthesizeWithOpenAI(text, language, emotion) {
    try {
      console.log(`[AudioStream ${this.id}] Starting OpenAI TTS synthesis`);
      
      // Use the current voice ID if set, otherwise use default
      const voiceId = this.currentVoiceId || 'alloy';
      
      // Call OpenAI TTS service with streaming enabled
      const audioStream = await openAiFmService.synthesizeToStream(text, {
        voice: voiceId,
        language: language,
        emotion: emotion,
        streaming: true
      });
      
      if (!audioStream) {
        throw new Error('OpenAI TTS returned null stream');
      }
      
      console.log(`[AudioStream ${this.id}] OpenAI TTS synthesis started with voice: ${voiceId}`);
      return audioStream;
      
    } catch (error) {
      console.error(`[AudioStream ${this.id}] OpenAI synthesis error:`, error);
      throw error;
    }
  }

  /**
   * Synthesize audio using ElevenLabs with real-time streaming
   * @param {string} text - Text to synthesize
   * @param {string} language - Language code
   * @returns {Promise<Stream>} Audio stream
   */
  async synthesizeWithElevenLabs(text, language) {
    try {
      console.log(`[AudioStream ${this.id}] Starting ElevenLabs TTS synthesis`);
      
      // Use the current voice ID if set, otherwise use default
      const voiceId = this.currentVoiceId || 'EXAVITQu4vr4xnSDxMaL'; // Default Bella voice
      
      // Call ElevenLabs service with streaming enabled
      const audioStream = await elevenlabsService.synthesizeToStream(text, {
        voiceId: voiceId,
        language: language,
        streaming: true
      });
      
      if (!audioStream) {
        throw new Error('ElevenLabs TTS returned null stream');
      }
      
      console.log(`[AudioStream ${this.id}] ElevenLabs TTS synthesis started with voice: ${voiceId}`);
      return audioStream;
      
    } catch (error) {
      console.error(`[AudioStream ${this.id}] ElevenLabs synthesis error:`, error);
      throw error;
    }
  }

  /**
   * Set the current voice ID for TTS synthesis
   * @param {string} voiceId - Voice ID to use
   * @param {string} provider - Voice provider (openai_fm, elevenlabs, etc.)
   */
  setVoice(voiceId, provider) {
    this.currentVoiceId = voiceId;
    this.voiceProvider = provider;
    this.lastVoiceSwitch = Date.now();
    
    console.log(`[AudioStream ${this.id}] Voice set to ${voiceId} (${provider})`);
    
    this.emit('voiceChanged', {
      callId: this.id,
      voiceId: voiceId,
      provider: provider,
      timestamp: Date.now()
    });
  }

  // ...existing code...
}

class AudioStreamService extends EventEmitter {
  constructor() {
    super();
    this.activeStreams = new Map();    this.SILENCE_THRESHOLD = 500;     // ms of silence to consider speech ended
    this.BARGE_IN_THRESHOLD = 200;    // ms of customer speech to trigger barge-in
    this.CHUNK_SIZE = 640;           // 40ms of audio at 8kHz
    this.HEARTBEAT_INTERVAL = 1000;  // Send heartbeat every 1 second
    this.MAX_BUFFER_SIZE = 64 * 1024; // 64KB buffer size to match WebSocket
  }

  // Create a new bidirectional audio stream for a call with retry logic
  async createCallStream(callId) {
    if (this.activeStreams.has(callId)) {
      console.log(`[AudioStreamService] Stream exists for call ${callId}, closing old stream`);
      await this.closeStream(callId);
    }

    try {
      console.log(`[AudioStreamService] Creating new stream for call ${callId}`);
      const stream = new AudioStream(callId);
      
      // Store the stream
      this.activeStreams.set(callId, stream);
      
      // Set up stream event handlers
      stream.on('error', (error) => {
        console.error(`[AudioStreamService] Stream error for call ${callId}:`, error);
        this.handleStreamError(callId, error);
      });
      
      stream.on('close', () => {
        console.log(`[AudioStreamService] Stream closed for call ${callId}`);
        this.activeStreams.delete(callId);
      });
      
      console.log(`[AudioStreamService] Successfully created stream for call ${callId}`);
      return stream;
      
    } catch (error) {
      console.error(`[AudioStreamService] Error creating stream for call ${callId}:`, error);
      throw error;
    }
  }

  // Get existing stream
  getStream(callId) {
    return this.activeStreams.get(callId);
  }

  // Create a new stream
  createStream(callId, options = {}) {
    if (this.activeStreams.has(callId)) {
      console.log(`[AudioStreamService] Stream already exists for call: ${callId}`);
      return this.activeStreams.get(callId);
    }

    const stream = new AudioStream(callId);
    
    // Set voice configuration if provided
    if (options.voiceProvider) {
      stream.voiceProvider = options.voiceProvider;
    }
    if (options.voiceId) {
      stream.currentVoiceId = options.voiceId;
    }
    if (options.language) {
      stream.detectedLanguage = options.language;
    }
    
    this.activeStreams.set(callId, stream);
    console.log(`[AudioStreamService] Created new stream for call: ${callId}`, {
      voiceProvider: stream.voiceProvider,
      voiceId: stream.currentVoiceId,
      language: stream.detectedLanguage
    });
    
    return stream;
  }

  // Set AI speaking state
  async setAISpeaking(callId, speaking) {
    const stream = this.getStream(callId);
    if (stream) {
      stream.setAiSpeaking(speaking);
    }
  }

  // Close a specific stream
  async closeStream(callId) {
    const stream = this.getStream(callId);
    if (stream) {
      await stream.close();
      this.activeStreams.delete(callId);
    }
  }

  // Reconnect a stream
  async reconnectStream(callId) {
    console.log(`[AudioStreamService] Attempting to reconnect stream for call ${callId}`);
    const existingStream = this.getStream(callId);
    
    if (existingStream) {
      // Save current state
      const wasSpeaking = existingStream.speaking;
      const wasAiSpeaking = existingStream.aiSpeaking;
      
      // Close old stream
      await this.closeStream(callId);
      
      // Create new stream
      const newStream = await this.createCallStream(callId);
      newStream.speaking = wasSpeaking;
      newStream.aiSpeaking = wasAiSpeaking;
      
      return newStream;
    } else {
      return this.createCallStream(callId);
    }
  }

  // Handle stream errors
  handleStreamError(callId, error) {
    console.error(`[AudioStreamService] Handling stream error for call ${callId}:`, error);
    // Could implement retry logic here
  }

  /**
   * Get active stream count for monitoring
   */
  getActiveStreamCount() {
    return this.activeStreams.size;
  }

  /**
   * Get comprehensive metrics for monitoring and analytics
   */
  getMetrics() {
    const activeStreams = this.activeStreams.size;
    const metrics = {
      activeStreams,
      totalMemoryUsage: 0,
      averageLatency: 0,
      streamDetails: []
    };

    // Collect detailed metrics from each stream
    this.activeStreams.forEach((stream, callId) => {
      const streamMetrics = {
        callId,
        active: stream.active,
        speaking: stream.speaking,
        aiSpeaking: stream.aiSpeaking,
        language: stream.detectedLanguage,
        emotion: stream.emotionalContext,
        voiceProvider: stream.voiceProvider,
        lastActivity: stream.lastActivity,
        uptime: Date.now() - (stream.createdAt || Date.now()),
        transcriptionBufferSize: stream.transcriptionBuffer ? stream.transcriptionBuffer.length : 0,
        queueSize: stream.chunkQueue ? stream.chunkQueue.length : 0
      };
      
      metrics.streamDetails.push(streamMetrics);
    });

    metrics.timestamp = Date.now();
    return metrics;
  }

  /**
   * Create streaming synthesis method that delegates to AudioStream
   */
  async createStreamingSynthesis(callId, text, options = {}) {
    const stream = this.getStream(callId);
    if (!stream) {
      throw new Error(`No audio stream found for call: ${callId}`);
    }
    
    return await stream.synthesizeAndStream(text, options);
  }

  /**
   * Remove a stream from the service
   */
  removeStream(callId) {
    if (this.activeStreams.has(callId)) {
      const stream = this.activeStreams.get(callId);
      
      // Clean up the stream
      if (stream && typeof stream.cleanup === 'function') {
        stream.cleanup();
      }
      
      // Remove from active streams
      this.activeStreams.delete(callId);
      
      console.log(`✅ Stream removed for call: ${callId}`);
      return true;
    }
    
    console.log(`⚠️ No stream found to remove for call: ${callId}`);
    return false;
  }
}

// Create service instance
const audioStreamService = new AudioStreamService();

module.exports = audioStreamService;
