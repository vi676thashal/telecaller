/**
 * Enhanced Deepgram STT Service
 * Optimized for real-time conversation with high accuracy
 */

const axios = require('axios');
const WebSocket = require('ws');
const { logger } = require('../utils/logger');

class EnhancedDeepgramService {
  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY;
    this.model = process.env.STT_MODEL || 'nova-2';
    this.language = process.env.STT_LANGUAGE || 'en-US';
    this.enableInterimResults = process.env.STT_INTERIM_RESULTS === 'true';
    this.baseUrl = 'https://api.deepgram.com/v1';
    
    if (!this.apiKey) {
      logger.warn('[DeepgramSTT] API key not configured');
    }
    
    logger.info('[DeepgramSTT] Service initialized', {
      model: this.model,
      language: this.language,
      interimResults: this.enableInterimResults
    });
  }

  /**
   * Convert audio to text using Deepgram's latest model for maximum accuracy
   */
  async transcribeAudio(audioBuffer, options = {}) {
    if (!this.apiKey) {
      throw new Error('Deepgram API key not configured');
    }

    try {
      const {
        language = this.language,
        model = this.model,
        enablePunctuation = true,
        enableNumerals = true,
        enableProfanityFilter = false,
        smartFormatting = true
      } = options;

      logger.debug('[DeepgramSTT] Starting transcription', {
        audioSize: audioBuffer.length,
        model,
        language
      });

      const response = await axios.post(
        `${this.baseUrl}/listen`,
        audioBuffer,
        {
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'audio/wav'
          },
          params: {
            model: model,
            language: language,
            punctuate: enablePunctuation,
            numerals: enableNumerals,
            profanity_filter: enableProfanityFilter,
            smart_format: smartFormatting,
            interim_results: false, // For batch processing
            utterances: true,
            utt_split: 0.8 // Split utterances on 0.8 second pauses
          },
          timeout: 10000
        }
      );

      const results = response.data?.results;
      if (!results || !results.channels || results.channels.length === 0) {
        logger.warn('[DeepgramSTT] No transcription results');
        return '';
      }

      const transcript = results.channels[0].alternatives[0].transcript;
      const confidence = results.channels[0].alternatives[0].confidence;
      
      logger.debug('[DeepgramSTT] Transcription completed', {
        transcript: transcript.substring(0, 100) + '...',
        confidence: confidence.toFixed(3),
        duration: results.metadata?.duration || 'unknown'
      });

      return transcript.trim();

    } catch (error) {
      logger.error('[DeepgramSTT] Transcription error:', error.message);
      
      // If Deepgram fails, throw error to trigger fallback
      throw new Error(`Deepgram STT failed: ${error.message}`);
    }
  }

  /**
   * Create real-time streaming transcription with Deepgram
   */
  createRealtimeStream(options = {}) {
    if (!this.apiKey) {
      throw new Error('Deepgram API key not configured');
    }

    const {
      language = this.language,
      model = this.model,
      onTranscript,
      onInterimResult,
      onError,
      onClose
    } = options;

    const wsUrl = `wss://api.deepgram.com/v1/listen?` +
      `model=${model}&` +
      `language=${language}&` +
      `punctuate=true&` +
      `numerals=true&` +
      `smart_format=true&` +
      `interim_results=${this.enableInterimResults}&` +
      `utterances=true&` +
      `utt_split=0.5&` +
      `endpointing=100`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        'Authorization': `Token ${this.apiKey}`
      }
    });

    let lastTranscript = '';
    let accumulatedTranscript = '';

    ws.on('open', () => {
      logger.info('[DeepgramSTT] Real-time stream connected');
    });

    ws.on('message', (data) => {
      try {
        const result = JSON.parse(data);
        
        if (result.type === 'Results') {
          const alternatives = result.channel?.alternatives;
          if (alternatives && alternatives.length > 0) {
            const transcript = alternatives[0].transcript;
            const confidence = alternatives[0].confidence;
            const isFinal = result.is_final;

            if (transcript && transcript.trim()) {
              if (isFinal) {
                // Final result - high confidence
                if (confidence > 0.6) {
                  accumulatedTranscript += ' ' + transcript;
                  lastTranscript = transcript;
                  
                  if (onTranscript) {
                    onTranscript({
                      transcript: transcript.trim(),
                      confidence,
                      isFinal: true,
                      accumulated: accumulatedTranscript.trim()
                    });
                  }
                  
                  logger.debug('[DeepgramSTT] Final transcript', {
                    text: transcript.substring(0, 50) + '...',
                    confidence: confidence.toFixed(3)
                  });
                }
              } else if (this.enableInterimResults && onInterimResult) {
                // Interim result for real-time feedback
                onInterimResult({
                  transcript: transcript.trim(),
                  confidence,
                  isFinal: false
                });
              }
            }
          }
        } else if (result.type === 'Metadata') {
          logger.debug('[DeepgramSTT] Stream metadata:', result);
        } else if (result.type === 'UtteranceEnd') {
          // Utterance completed - good time to process
          if (onTranscript && lastTranscript) {
            onTranscript({
              transcript: lastTranscript,
              confidence: 1.0,
              isFinal: true,
              isUtteranceEnd: true,
              accumulated: accumulatedTranscript.trim()
            });
          }
        }
      } catch (parseError) {
        logger.error('[DeepgramSTT] Error parsing stream message:', parseError);
      }
    });

    ws.on('error', (error) => {
      logger.error('[DeepgramSTT] Stream error:', error);
      if (onError) onError(error);
    });

    ws.on('close', (code, reason) => {
      logger.info('[DeepgramSTT] Stream closed', { code, reason: reason?.toString() });
      if (onClose) onClose(code, reason);
    });

    // Return object with send method for audio data
    return {
      send: (audioData) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(audioData);
        }
      },
      close: () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      },
      isOpen: () => ws.readyState === WebSocket.OPEN,
      getAccumulatedTranscript: () => accumulatedTranscript.trim()
    };
  }

  /**
   * Test connection to Deepgram API
   */
  async testConnection() {
    if (!this.apiKey) {
      return { success: false, message: 'API key not configured' };
    }

    try {
      // Test with a small audio buffer
      const testAudio = Buffer.alloc(1024);
      
      await axios.post(
        `${this.baseUrl}/listen`,
        testAudio,
        {
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'audio/wav'
          },
          params: {
            model: this.model,
            language: this.language
          },
          timeout: 5000
        }
      );

      return { success: true, message: 'Deepgram API connection successful' };
    } catch (error) {
      return { 
        success: false, 
        message: `Deepgram API test failed: ${error.message}` 
      };
    }
  }

  /**
   * Get available models
   */
  async getAvailableModels() {
    if (!this.apiKey) {
      throw new Error('Deepgram API key not configured');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/projects`, {
        headers: {
          'Authorization': `Token ${this.apiKey}`
        }
      });

      return response.data;
    } catch (error) {
      logger.error('[DeepgramSTT] Error fetching models:', error);
      throw error;
    }
  }
}

module.exports = new EnhancedDeepgramService();
