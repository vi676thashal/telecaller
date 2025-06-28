/**
 * Voice Activity Detection Service Adapter
 * 
 * This adapter allows both old and new versions of the VAD service to coexist
 * while ensuring that both versions handle STT provider selection correctly.
 */

// Import logger - try both paths for compatibility
let logger;
try {
  const loggerModule = require('../utils/logger');
  logger = loggerModule.logger;
} catch (error) {
  // Fallback logger if the module can't be loaded
  logger = {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  };
}

// Try to load both service versions
let voiceActivityDetectionService;
let voiceActivityDetectionServiceNew;

try {
  voiceActivityDetectionService = require('./voiceActivityDetectionService');
} catch (error) {
  logger.error('Failed to load voiceActivityDetectionService:', error);
}

try {
  voiceActivityDetectionServiceNew = require('./voiceActivityDetectionService_new');
} catch (error) {
  logger.error('Failed to load voiceActivityDetectionService_new:', error);
}

// Create the adapter that forwards calls to both services when they exist
const vadServiceAdapter = {
  /**
   * Set STT provider for a specific call
   * @param {string} callId - Call identifier
   * @param {string} provider - STT provider to use
   */
  setSTTProvider(callId, provider) {
    if (voiceActivityDetectionService && typeof voiceActivityDetectionService.setSTTProvider === 'function') {
      try {
        voiceActivityDetectionService.setSTTProvider(callId, provider);
        logger.info(`[VADAdapter] Set STT provider for call ${callId} to ${provider} in original service`);
      } catch (error) {
        logger.error(`[VADAdapter] Error setting STT provider in original service: ${error.message}`);
      }
    }
    
    if (voiceActivityDetectionServiceNew && typeof voiceActivityDetectionServiceNew.setSTTProvider === 'function') {
      try {
        voiceActivityDetectionServiceNew.setSTTProvider(callId, provider);
        logger.info(`[VADAdapter] Set STT provider for call ${callId} to ${provider} in new service`);
      } catch (error) {
        logger.error(`[VADAdapter] Error setting STT provider in new service: ${error.message}`);
      }
    }
  },
  
  /**
   * Get STT provider for a specific call
   * @param {string} callId - Call identifier
   * @returns {string} STT provider to use
   */
  getSTTProvider(callId) {
    // Try to get from original service first
    if (voiceActivityDetectionService && typeof voiceActivityDetectionService.getSTTProvider === 'function') {
      try {
        return voiceActivityDetectionService.getSTTProvider(callId);
      } catch (error) {
        logger.error(`[VADAdapter] Error getting STT provider from original service: ${error.message}`);
      }
    }
    
    // Fall back to new service
    if (voiceActivityDetectionServiceNew && typeof voiceActivityDetectionServiceNew.getSTTProvider === 'function') {
      try {
        return voiceActivityDetectionServiceNew.getSTTProvider(callId);
      } catch (error) {
        logger.error(`[VADAdapter] Error getting STT provider from new service: ${error.message}`);
      }
    }
    
    // Default to deepgram if both fail
    return 'deepgram';
  },
  
  /**
   * Process audio chunk - this is a facade to the old implementation
   * @param {Buffer} audioChunk - Audio data
   * @param {number} sampleRate - Audio sample rate
   * @param {string} callId - Call identifier for tracking
   * @returns {Object} Detection results
   */
  processAudioChunk(audioChunk, sampleRate, callId) {
    // Use original service as primary
    if (voiceActivityDetectionService && typeof voiceActivityDetectionService.processAudioChunk === 'function') {
      return voiceActivityDetectionService.processAudioChunk(audioChunk, sampleRate, callId);
    }
    
    // Fall back to new service
    if (voiceActivityDetectionServiceNew && typeof voiceActivityDetectionServiceNew.processAudioChunk === 'function') {
      return voiceActivityDetectionServiceNew.processAudioChunk(audioChunk, sampleRate, callId);
    }
    
    // Default empty response if no services are available
    return {
      isSpeaking: false,
      audioLevel: 0,
      language: 'en-US',
      emotion: 'neutral',
      confidenceScore: 0,
      speechEvent: null
    };
  }
};

// Export the adapter
module.exports = vadServiceAdapter;
