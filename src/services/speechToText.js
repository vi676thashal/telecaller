/**
 * Speech to Text Service
 * 
 * Provides a unified API for different speech-to-text providers
 * Supports Google Speech and Deepgram
 */

const { logger } = require('../utils/logger');
const deepgramService = require('./deepgramService');
const googleSpeechService = require('./googleSpeechService');

class SpeechToTextService {
  constructor() {
    this.defaultProvider = process.env.DEFAULT_STT_PROVIDER || 'google';
    logger.info(`Using ${this.defaultProvider} as the default Speech-to-Text provider`);
  }

  /**
   * Transcribe audio buffer using the preferred provider
   * @param {Buffer} audioBuffer - Raw audio buffer to transcribe
   * @param {Object} options - Transcription options
   * @returns {Promise<string>} - Transcription result
   */
  async transcribe(audioBuffer, options = {}) {
    const provider = options.provider || this.defaultProvider;
    
    try {
      switch (provider.toLowerCase()) {
        case 'deepgram':
          return await this.transcribeWithDeepgram(audioBuffer, options);
        case 'google':
        default:
          return await this.transcribeWithGoogleSpeech(audioBuffer, options);
      }
    } catch (error) {
      logger.error('Speech-to-text transcription error', { error: error.message, provider });
      return '';
    }
  }
  /**
   * Transcribe using Google Speech
   * @param {Buffer} audioBuffer - Raw audio buffer
   * @param {Object} options - Transcription options
   * @returns {Promise<string>} - Transcription result
   */
  async transcribeWithGoogleSpeech(audioBuffer, options = {}) {
    try {
      logger.info('Transcribing with Google Speech');
      
      // Convert audio buffer to desired format if necessary
      // Google Speech expects certain audio formats
      const language = options.language || 'en-US';
      
      // Call the actual Google Speech service
      const transcription = await googleSpeechService.transcribe(audioBuffer, {
        languageCode: language,
        encoding: 'LINEAR16',
        sampleRateHertz: 16000
      });
      
      logger.info(`Google Speech transcription result: ${transcription}`);
      return transcription;
    } catch (error) {
      logger.error('Google Speech transcription error', { error: error.message });
      throw error;
    }
  }

  /**
   * Transcribe using Deepgram
   * @param {Buffer} audioBuffer - Raw audio buffer
   * @param {Object} options - Transcription options
   * @returns {Promise<string>} - Transcription result
   */
  async transcribeWithDeepgram(audioBuffer, options = {}) {
    try {
      logger.info('Transcribing with Deepgram');
      
      // Create a temporary call ID if not provided
      const callId = options.callId || `temp_${Date.now()}`;
      
      // Process the audio chunk through Deepgram service
      const result = await deepgramService.processAudioChunk(callId, audioBuffer);
      
      // Extract the transcription text from the result
      let transcription = '';
      if (result && result.text) {
        transcription = result.text;
        logger.info(`Deepgram transcription result: ${transcription}`);
      }
      
      return transcription;
    } catch (error) {
      logger.error('Deepgram transcription error', { error: error.message });
      throw error;
    }
  }
}

const speechToTextService = new SpeechToTextService();
module.exports = { speechToTextService };
