/**
 * Enhanced Audio Stream Service for OpenAI FM Integration
 * Extends the core audioStreamService with language detection, voice activity detection,
 * and emotional context handling for real-time multilingual voice interactions
 */

const audioStreamService = require('./audioStreamService');
const voiceActivityDetectionService = require('./voiceActivityDetectionService');
const openAiFmService = require('./openAiFmService');

// State storage for each active call
const callStateMap = new Map();

// Configure enhanced service
const enhancedAudioStreamService = {
  /**
   * Initialize enhanced state for a call
   * @param {string} callId - Call identifier
   * @returns {Object} The enhanced state object
   */
  initializeCallState(callId) {
    if (callStateMap.has(callId)) {
      return callStateMap.get(callId);
    }
    
    const callState = {
      callId,
      detectedLanguage: 'en-US',
      emotionalContext: 'neutral',
      languageConfidence: 0.8,
      transcriptionBuffer: [],
      lastActivityTime: Date.now(),
      audioBuffer: Buffer.alloc(0),
      isProcessingAudio: false,
      vadActive: true,
      lastLanguageChange: Date.now(),
      conversationHistory: []
    };
    
    callStateMap.set(callId, callState);
    return callState;
  },
  
  /**
   * Process incoming audio with VAD and language detection
   * @param {string} callId - Call identifier
   * @param {Buffer} audioChunk - Raw audio data
   * @returns {Promise<Object>} Processing results
   */
  async processIncomingAudio(callId, audioChunk) {
    // Ensure state is initialized
    const state = this.initializeCallState(callId);
    
    try {
      // Process audio with VAD service
      const vadResult = voiceActivityDetectionService.processAudioChunk(audioChunk);
      
      // Check if language changed
      if (vadResult.language && vadResult.language !== state.detectedLanguage) {
        console.log(`[EnhancedAudioStream] Language changed from ${state.detectedLanguage} to ${vadResult.language} for call ${callId}`);
        state.detectedLanguage = vadResult.language;
        state.lastLanguageChange = Date.now();
        
        // Emit event through the core audio stream service
        const stream = audioStreamService.getStream(callId);
        if (stream) {
          stream.emit('serviceEvent', {
            type: 'language_changed',
            callId,
            language: vadResult.language,
            confidence: vadResult.confidenceScore
          });
        }
      }
      
      // Update emotional context
      if (vadResult.emotion && vadResult.emotion !== state.emotionalContext) {
        state.emotionalContext = vadResult.emotion;
        
        // Emit event through the core audio stream service
        const stream = audioStreamService.getStream(callId);
        if (stream) {
          stream.emit('serviceEvent', {
            type: 'emotion_changed',
            callId,
            emotion: vadResult.emotion
          });
        }
      }
      
      return {
        ...vadResult,
        callId
      };
    } catch (error) {
      console.error(`[EnhancedAudioStream] Error processing audio for call ${callId}:`, error);
      return null;
    }
  },
  
  /**
   * Process transcribed text and update language/emotion state
   * @param {string} callId - Call identifier
   * @param {string} text - Transcribed text
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Updated state
   */
  async processTranscription(callId, text, options = {}) {
    const state = this.initializeCallState(callId);
    
    try {
      // Add to transcription buffer
      state.transcriptionBuffer.push({
        text,
        timestamp: Date.now(),
        speaker: options.speaker || 'user'
      });
      
      // Keep buffer size manageable
      if (state.transcriptionBuffer.length > 20) {
        state.transcriptionBuffer.shift();
      }
      
      // Update VAD service with transcribed text
      voiceActivityDetectionService.addTranscribedSpeech(text);
      
      // Check language based on text
      const textLanguage = await openAiFmService.identifyLanguage(text);
      if (textLanguage && textLanguage !== state.detectedLanguage) {
        state.detectedLanguage = textLanguage;
        state.lastLanguageChange = Date.now();
        
        // Emit through audio stream service
        const stream = audioStreamService.getStream(callId);
        if (stream) {
          stream.emit('serviceEvent', {
            type: 'language_changed',
            callId,
            language: textLanguage,
            source: 'transcription'
          });
        }
      }
      
      // Detect emotion from text
      const emotion = await openAiFmService.detectEmotion(text);
      if (emotion && emotion !== state.emotionalContext) {
        state.emotionalContext = emotion;
        
        // Emit through audio stream service
        const stream = audioStreamService.getStream(callId);
        if (stream) {
          stream.emit('serviceEvent', {
            type: 'emotion_changed',
            callId,
            emotion
          });
        }
      }
      
      return {
        language: state.detectedLanguage,
        emotion: state.emotionalContext,
        callId
      };
    } catch (error) {
      console.error(`[EnhancedAudioStream] Error processing transcription for call ${callId}:`, error);
      return {
        language: state.detectedLanguage,
        emotion: state.emotionalContext,
        callId,
        error: error.message
      };
    }
  },
  
  /**
   * Generate AI response with appropriate language and emotional context
   * @param {string} callId - Call identifier
   * @param {string} transcribedText - Input text
   * @returns {Promise<Object>} Response with text and audio
   */
  async generateResponse(callId, transcribedText) {
    const state = this.initializeCallState(callId);
    
    try {
      // Process text with GPT using detected language and emotion
      const processedResponse = await openAiFmService.processTextWithGPT(
        transcribedText, 
        state.detectedLanguage,
        {
          callHistory: state.transcriptionBuffer,
          emotion: state.emotionalContext
        }
      );
      
      // Add to conversation history
      state.conversationHistory.push({
        user: transcribedText,
        ai: processedResponse.text,
        timestamp: Date.now(),
        language: state.detectedLanguage,
        emotion: processedResponse.emotion
      });
      
      // Keep history manageable
      if (state.conversationHistory.length > 10) {
        state.conversationHistory.shift();
      }
      
      // Generate speech with the same language and emotional context
      const audioBuffer = await openAiFmService.generateSpeech(
        processedResponse.text, 
        state.detectedLanguage, 
        processedResponse.emotion
      );
      
      return {
        text: processedResponse.text,
        audio: audioBuffer,
        language: state.detectedLanguage,
        emotion: processedResponse.emotion,
        callId
      };
    } catch (error) {
      console.error(`[EnhancedAudioStream] Error generating response for call ${callId}:`, error);
      throw error;
    }
  },
  
  /**
   * Get the current state for a call
   * @param {string} callId - Call identifier
   * @returns {Object} Current call state
   */
  getCallState(callId) {
    return callStateMap.get(callId) || this.initializeCallState(callId);
  },
  
  /**
   * Clean up resources for a call
   * @param {string} callId - Call identifier
   */
  cleanup(callId) {
    if (callStateMap.has(callId)) {
      callStateMap.delete(callId);
    }
    
    // Reset VAD for this call
    voiceActivityDetectionService.reset();
  },
  
  /**
   * Clean up all resources
   */
  cleanupAll() {
    callStateMap.clear();
    voiceActivityDetectionService.reset();
  }
};

module.exports = enhancedAudioStreamService;
