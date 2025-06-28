/**
 * OpenAI FM Voice Provider Integration
 * 
 * This module integrates OpenAI FM voice provider with enhanced VAD and language detection
 * for multilingual call handling in SecureVoice AI.
 */

const enhancedCallHandler = require('./enhancedCallHandler');
const openAiFmService = require('../services/openAiFmService');
const voiceActivityDetectionService = require('../services/voiceActivityDetectionService');
const enhancedAudioStreamService = require('../services/enhancedAudioStreamService');
const Call = require('../models/Call');

/**
 * Initialize and configure OpenAI FM voice provider for a call
 * @param {string} callId Call identifier
 * @param {Object} callData Call configuration data
 * @returns {Promise<Object>} Initialization result
 */
async function initializeOpenAiFm(callId, callData) {
  try {
    console.log(`[OpenAI FM Integration] Initializing OpenAI FM for call ${callId}`);
    
    // Test the OpenAI connection
    const connectionTest = await openAiFmService.testConnection();
    if (!connectionTest.success) {
      console.error(`[OpenAI FM Integration] OpenAI API connection failed: ${connectionTest.message}`);
      throw new Error(`OpenAI API connection failed: ${connectionTest.message}`);
    }
    
    // Initialize call with enhanced handler
    await enhancedCallHandler.initializeCall(callId, callData);
    
    // Update call with provider info in database
    await Call.findByIdAndUpdate(callId, {
      voiceProvider: 'openai_fm',
      voiceConfig: {
        defaultLanguage: callData.language || 'en-US',
        defaultVoice: callData.voice || 'alloy',
        enableVAD: true,
        enableLID: true
      }
    });
    
    return {
      success: true,
      message: 'OpenAI FM voice provider initialized successfully',
      callId
    };
  } catch (error) {
    console.error(`[OpenAI FM Integration] Error initializing OpenAI FM: ${error.message}`);
    return {
      success: false,
      message: `Failed to initialize OpenAI FM: ${error.message}`,
      callId
    };
  }
}

/**
 * Process audio chunk with VAD and language detection
 * @param {string} callId Call identifier
 * @param {Buffer} audioChunk Raw audio data
 * @returns {Promise<Object>} Processing result
 */
async function processAudioChunk(callId, audioChunk) {
  try {
    return await enhancedAudioStreamService.processIncomingAudio(callId, audioChunk);
  } catch (error) {
    console.error(`[OpenAI FM Integration] Error processing audio chunk: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Process transcribed text with language detection and NLU
 * @param {string} callId Call identifier
 * @param {string} text Transcribed text
 * @returns {Promise<Object>} Processing result with language detection
 */
async function processTranscription(callId, text) {
  try {
    // Process transcription through enhanced audio service
    const result = await enhancedAudioStreamService.processTranscription(callId, text);
    
    // Get the detected language
    const detectedLanguage = result.language || 'en-US';
    
    // Update call record with detected language
    await Call.findByIdAndUpdate(callId, { 
      $push: { 
        conversationHistory: {
          speaker: 'Customer',
          text,
          timestamp: new Date(),
          language: detectedLanguage
        } 
      },
      detectedLanguage
    });
    
    return result;
  } catch (error) {
    console.error(`[OpenAI FM Integration] Error processing transcription: ${error.message}`);
    return { 
      success: false, 
      error: error.message,
      language: 'en-US' // Default to English on error
    };
  }
}

/**
 * Generate AI response in appropriate language with emotional context
 * @param {string} callId Call identifier
 * @param {string} userText User's transcribed text
 * @returns {Promise<Object>} Generated response with audio
 */
async function generateResponse(callId, userText) {
  try {
    // Get call state from enhanced audio service
    const callState = enhancedAudioStreamService.getCallState(callId);
    
    // Generate response using enhanced audio service
    const response = await enhancedAudioStreamService.generateResponse(callId, userText);
    
    // Update call record with AI response
    await Call.findByIdAndUpdate(callId, { 
      $push: { 
        conversationHistory: {
          speaker: 'AI',
          text: response.text,
          timestamp: new Date(),
          language: response.language,
          emotion: response.emotion
        } 
      }
    });
    
    return {
      success: true,
      text: response.text,
      audio: response.audio,
      language: response.language,
      emotion: response.emotion
    };
  } catch (error) {
    console.error(`[OpenAI FM Integration] Error generating response: ${error.message}`);
    return {
      success: false,
      error: error.message,
      text: "I'm sorry, I'm having trouble processing your request right now."
    };
  }
}

/**
 * End call and clean up resources
 * @param {string} callId Call identifier
 */
async function endCall(callId) {
  try {
    // End call with enhanced handler
    await enhancedCallHandler.endCall(callId);
    
    // Clean up enhanced audio service resources
    enhancedAudioStreamService.cleanup(callId);
    
    return { success: true };
  } catch (error) {
    console.error(`[OpenAI FM Integration] Error ending call: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Get WhisperAPI configuration for real-time STT with language detection
 * Uses optimized settings for phone call audio
 */
function getWhisperConfig() {
  return {
    model: 'whisper-1',
    language: null, // Let Whisper auto-detect language
    response_format: 'json',
    temperature: 0,
    prompt: 'This is a phone conversation. The speaker may be speaking in English, Hindi, or a mixture of both.',
    endpointing: true // Enable voice activity detection
  };
}

module.exports = {
  initializeOpenAiFm,
  processAudioChunk,
  processTranscription,
  generateResponse,
  endCall,
  getWhisperConfig
};
