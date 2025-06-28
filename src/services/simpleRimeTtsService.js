/**
 * Simple Rime TTS Direct Service
 * 
 * This service bypasses MongoDB and uses environment variables directly
 */
const axios = require('axios');
const Setting = require('../models/Setting');

const simpleRimeTtsService = {
  getApiKey: async () => {
    try {
      // Check if MongoDB is available before querying
      if (global.isMongoDBAvailable && global.isMongoDBAvailable()) {
        const setting = await Setting.findOne({ key: 'rimeTtsApiKey' });
        if (setting && setting.value) {
          return setting.value;
        }
      }
      
      // Fall back to environment variable
      const apiKey = process.env.RIME_API_KEY;
      if (!apiKey) {
        throw new Error('Rime TTS API key not found in database or environment variables');
      }
      
      return apiKey;
    } catch (error) {
      console.error('Error getting Rime TTS API key:', error.message);
      // Last resort fallback to environment variable
      return process.env.RIME_API_KEY;
    }
  },
    getAvailableVoices: async () => {
    try {
      console.log('Rime TTS: Getting API key...');
      const apiKey = await simpleRimeTtsService.getApiKey();
      
      if (!apiKey) {
        console.error('Rime TTS: API key not found');
        throw new Error('Rime TTS API key not found');
      }
      
      console.log('Rime TTS: Fetching voices from API...');
      console.log('Rime TTS: Using API key:', `${apiKey.substring(0, 5)}...`);
      
      const response = await axios({
        method: 'get',
        url: 'https://api.rimeai.app/v1/voices',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log('Rime TTS: API response received:', response.status);
      
      if (response.data && response.data.voices) {
        const formattedVoices = response.data.voices.map(voice => ({
          id: voice.id,
          name: voice.name,
          description: voice.description || '',
          preview_url: voice.preview_url || '',
          category: voice.category || 'standard',
          language: voice.language || 'en-US'
        }));
        
        console.log(`Rime TTS: Successfully mapped ${formattedVoices.length} voices`);
        return formattedVoices;
      }
        console.log('Rime TTS: No voices found in response');
      // Return fallback voices as a development/testing aid
      return simpleRimeTtsService.getFallbackVoices();
    } catch (error) {
      console.error('Error getting Rime TTS voices:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      }
      
      console.log('Rime TTS: Returning fallback voices due to API error');
      // Return fallback voices in case of API error
      return simpleRimeTtsService.getFallbackVoices();
    }
  },
  
  // Fallback voices for development and testing
  getFallbackVoices: () => {
    console.log('Rime TTS: Providing fallback voices for testing');
    return [
      {
        id: 'default',
        name: 'Default Voice',
        description: 'Rime TTS default conversational voice',
        category: 'standard',
        language: 'en-US'
      },
      {
        id: 'james',
        name: 'James',
        description: 'Deep professional male voice',
        category: 'premium',
        language: 'en-US'
      },
      {
        id: 'sophia',
        name: 'Sophia',
        description: 'Warm and engaging female voice',
        category: 'premium',
        language: 'en-US'
      },
      {
        id: 'oliver',
        name: 'Oliver',
        description: 'British accent, articulate male voice',
        category: 'standard',
        language: 'en-GB'
      },
      {
        id: 'emma',
        name: 'Emma',
        description: 'Clear and natural female voice',
        category: 'standard',
        language: 'en-US'
      },
      {
        id: 'news-anchor',
        name: 'News Anchor',
        description: 'Professional broadcast style voice',
        category: 'specialized',
        language: 'en-US'
      },
      {
        id: 'assistant',
        name: 'Digital Assistant',
        description: 'Friendly AI assistant voice',
        category: 'specialized',
        language: 'en-US'
      }
    ];
  },
    generateSpeech: async (text, language = 'en-US', options = {}) => {
    const apiKey = await simpleRimeTtsService.getApiKey();
    
    // Get voice ID from options, environment, or use default
    const voiceId = options.voiceId || process.env.RIME_VOICE_ID || 'default';
    console.log(`Rime TTS: Generating speech for text "${text.substring(0, 30)}..." using voice ID: ${voiceId}`);
    
    if (!apiKey) {
      throw new Error('Rime TTS API key not found in database or environment variables');
    }
    
    try {
      // Prepare request data with voice settings
      const speechSettings = {
        speed: options.speed || 1.0,
        pitch: options.pitch || 1.0,
        emotion: options.emotion || 'neutral'
      };
      
      console.log(`Rime TTS: Using settings:`, speechSettings);
      
      const response = await axios({
        method: 'post',
        url: `https://api.rimeai.app/v1/text-to-speech`,
        data: {
          text: text,
          voice_id: voiceId,
          model: options.model || 'standard',
          settings: speechSettings
        },
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        responseType: 'arraybuffer',
        timeout: 20000 // Increased timeout for better reliability
      });
      
      if (!response.data || response.data.length === 0) {
        throw new Error('Rime TTS returned empty audio data');
      }
      
      console.log(`Rime TTS: Successfully generated ${response.data.length} bytes of audio data`);
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Rime TTS API error:', error.message);
      
      // Enhanced error handling with more specific error messages
      if (error.response) {
        console.error('Status:', error.response.status);
        
        if (error.response.status === 401) {
          throw new Error('Rime TTS authentication failed - invalid API key');
        } else if (error.response.status === 400) {
          throw new Error(`Rime TTS bad request - ${error.response.data?.error || 'invalid parameters'}`);
        } else if (error.response.status === 404) {
          throw new Error(`Rime TTS voice ID not found: ${voiceId}`);
        } else if (error.response.status === 429) {
          throw new Error('Rime TTS rate limit exceeded - please try again later');
        }
      }
      
      throw new Error(`Rime TTS speech generation failed: ${error.message}`);
    }},
  
  getSubscriptionInfo: async () => {
    try {
      const apiKey = await simpleRimeTtsService.getApiKey();
      
      if (!apiKey) {
        throw new Error('Rime TTS API key not found');
      }
      
      const response = await axios({
        method: 'get',
        url: 'https://api.rimeai.app/v1/user/subscription',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      if (response.data) {
        return {
          status: 'available',
          tier: response.data.tier || 'standard',
          characterCount: response.data.character_count || 0,
          characterLimit: response.data.character_limit || 1000000,
          validUntil: response.data.valid_until || null
        };
      }
      
      return {
        status: 'unknown',
        tier: 'unknown',
        characterCount: 0,
        characterLimit: 0
      };
    } catch (error) {
      console.error('Error getting Rime TTS subscription info:', error.message);
      return {
        status: 'error',
        message: error.message,
        tier: 'unknown',
        characterCount: 0,
        characterLimit: 0      };
    }
  },

  // Generate streaming audio for real-time communication
  generateStreamingAudio: async (text, language = 'en-US', options = {}) => {
    try {
      console.log(`Rime TTS: Generating streaming audio for: "${text.substring(0, 50)}..."`);
      
      const apiKey = await simpleRimeTtsService.getApiKey();
      if (!apiKey) {
        throw new Error('Rime TTS API key not found');
      }

      // Use default voice for streaming
      const voiceId = options.voiceId || 'jovie';
      const format = options.format || 'mulaw'; // Twilio format
      
      console.log(`Rime TTS: Streaming request with voice: ${voiceId}, format: ${format}`);
      
      const response = await axios({
        method: 'post',
        url: 'https://api.rimeai.app/v1/speech',
        data: {
          text: text,
          voice: voiceId,
          speed: 1.0,
          format: format === 'mulaw' ? 'wav' : 'mp3'
        },
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        timeout: 10000
      });
      
      console.log('Rime TTS: Streaming audio generated successfully');
      return response.data;
    } catch (error) {
      console.error('Rime TTS streaming error:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
      }
      throw new Error(`Rime TTS streaming failed: ${error.message}`);
    }
  }
};

module.exports = simpleRimeTtsService;
