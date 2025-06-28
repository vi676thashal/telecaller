/**
 * Deepgram Service for Real-Time Speech-to-Text
 * Provides high-quality transcription with language detection
 */

const { Deepgram } = require('@deepgram/sdk');
const { PassThrough } = require('stream');
const Setting = require('../models/Setting');
const languageUtils = require('../utils/languageUtils');
const { logger } = require('../utils/logger');

class DeepgramService {
  constructor() {
    this.deepgram = null;
    this.activeTranscriptions = new Map();
  }
  
  /**
   * Initialize Deepgram client
   * @returns {Object} Deepgram client instance
   */
  async getClient() {
    if (this.deepgram) return this.deepgram;
    
    try {
      let apiKey = process.env.DEEPGRAM_API_KEY;
      
      if (!apiKey) {
        // Try to fetch from database
        const apiKeySetting = await Setting.findOne({ key: 'deepgramApiKey' });
        if (apiKeySetting) {
          apiKey = apiKeySetting.value;
        }
      }
      
      if (!apiKey) {
        throw new Error('Deepgram API key not found');
      }
      
      this.deepgram = new Deepgram(apiKey);
      return this.deepgram;
    } catch (error) {
      logger.error('Error initializing Deepgram client:', error);
      throw error;
    }
  }
  
  /**
   * Create a real-time transcription stream
   * @param {string} callId - Call identifier
   * @param {Object} options - Transcription options
   * @returns {Object} Transcription session
   */
  async createTranscriptionStream(callId, options = {}) {
    try {
      const deepgram = await this.getClient();
      
      // Configure transcription options
      const deepgramOptions = {
        punctuate: true,
        language: options.language || 'en',
        model: 'nova-2',
        smart_format: true,
        diarize: true,
        interim_results: true,
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
        endpointing: 'true',
        utterance_end_ms: '1000'
      };
      
      // Create audio stream
      const audioStream = new PassThrough();
      
      // Connect to Deepgram API
      const connection = deepgram.transcription.live(deepgramOptions);
      
      // Set up connection event handlers
      connection.addListener('open', () => {
        logger.info(`Deepgram WebSocket connection established for call ${callId}`);
      });
      
      connection.addListener('error', (error) => {
        logger.error(`Deepgram WebSocket error for call ${callId}:`, error);
      });
      
      // Initialize transcription session
      const session = {
        connection,
        audioStream,
        callId,
        language: options.language || 'en',
        active: true
      };
      
      // Store session
      this.activeTranscriptions.set(callId, session);
      
      // Start piping audio to Deepgram
      audioStream.on('data', (chunk) => {
        if (session.active && connection) {
          connection.send(chunk);
        }
      });
      
      return session;
    } catch (error) {
      logger.error(`Error creating transcription stream for call ${callId}:`, error);
      throw error;
    }
  }
  
  /**
   * Process audio chunk and get transcription
   * @param {string} callId - Call identifier
   * @param {Buffer} audioChunk - Audio data
   * @returns {Promise<Object>} Transcription result
   */
  async processAudioChunk(callId, audioChunk) {
    try {
      // Get existing session or create new one
      let session = this.activeTranscriptions.get(callId);
      
      if (!session || !session.active) {
        session = await this.createTranscriptionStream(callId);
      }
      
      // Push audio chunk to stream
      if (session.audioStream && session.active) {
        session.audioStream.write(audioChunk);
      }
      
      // Return a promise that resolves with results
      return new Promise((resolve) => {
        // Handle transcription results
        const handleTranscription = (data) => {
          try {
            if (!data || !data.channel) return;
            
            const transcript = data.channel.alternatives[0]?.transcript;
            
            if (!transcript || transcript.trim() === '') return;
            
            // Detect language
            const language = languageUtils.detectLanguage(transcript);
            
            // Return result
            resolve({
              text: transcript,
              language,
              isFinal: data.is_final
            });
            
            // Remove listener if final
            if (data.is_final) {
              session.connection.removeListener('transcriptReceived', handleTranscription);
            }
          } catch (error) {
            logger.error(`Error processing transcription for call ${callId}:`, error);
          }
        };
        
        // Add transcription listener
        session.connection.addListener('transcriptReceived', handleTranscription);
        
        // Set timeout to prevent hanging
        setTimeout(() => {
          resolve(null);
        }, 5000);
      });
    } catch (error) {
      logger.error(`Error processing audio chunk for call ${callId}:`, error);
      return null;
    }
  }
  
  /**
   * Close transcription session
   * @param {string} callId - Call identifier
   */
  closeTranscription(callId) {
    try {
      const session = this.activeTranscriptions.get(callId);
      
      if (session) {
        session.active = false;
        
        // Close WebSocket connection
        if (session.connection) {
          session.connection.finish();
        }
        
        // End audio stream
        if (session.audioStream) {
          session.audioStream.end();
        }
        
        // Remove session
        this.activeTranscriptions.delete(callId);
      }
    } catch (error) {
      logger.error(`Error closing transcription for call ${callId}:`, error);
    }
  }
}

// Create singleton instance
const deepgramService = new DeepgramService();
module.exports = deepgramService;
