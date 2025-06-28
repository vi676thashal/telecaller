const axios = require('axios');
const Setting = require('../models/Setting');

const elevenlabsService = {
  getSettings: async () => {
    try {
      let apiKey = process.env.ELEVENLABS_API_KEY;
      let voiceId = process.env.ELEVENLABS_VOICE_ID;

      // Only try to access database if MongoDB is available
      if (global.isMongoDBAvailable && global.isMongoDBAvailable()) {
        if (!apiKey) {
          const apiKeySetting = await Setting.findOne({ key: 'elevenlabsApiKey' });
          if (apiKeySetting) {
            apiKey = apiKeySetting.value;
          }
        }

        if (!voiceId) {
          const voiceSetting = await Setting.findOne({ key: 'elevenlabsVoiceId' });
          if (voiceSetting) {
            voiceId = voiceSetting.value;
          }
        }
      }

      return { apiKey, voiceId };
    } catch (error) {
      console.error('Error getting ElevenLabs settings:', error);
      // Return environment variables as fallback
      return { 
        apiKey: process.env.ELEVENLABS_API_KEY, 
        voiceId: process.env.ELEVENLABS_VOICE_ID 
      };
    }
  },

  listVoices: async () => {
    try {
      const settings = await elevenlabsService.getSettings();
      
      if (!settings.apiKey) {
        throw new Error('ElevenLabs API key not found');
      }

      const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'Accept': 'application/json',
          'xi-api-key': settings.apiKey
        }
      });

      if (response.data && response.data.voices) {
        return response.data.voices.map(voice => ({
          id: voice.voice_id,
          name: voice.name,
          description: voice.description || '',
          preview_url: voice.preview_url,
          category: voice.category || 'standard'
        }));
      }

      return [];
    } catch (error) {
      console.error('Error listing ElevenLabs voices:', error);
      throw error;
    }
  },  generateSpeech: async (text, language = 'en-US', options = {}) => {
    try {
      const settings = await elevenlabsService.getSettings();
      
      if (!settings.apiKey) {
        throw new Error('ElevenLabs API key not found. Please configure your API key in settings.');
      }
      
      const voiceId = options.voiceId || settings.voiceId;
      if (!voiceId) {
        throw new Error('No voice ID provided or configured. Please select a voice.');
      }

      console.log(`Generating speech with ElevenLabs voice ${voiceId}`);

      const response = await axios({
        method: 'post',
        url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': settings.apiKey,
          'Content-Type': 'application/json'
        },
        data: {
          text: text,
          model_id: 'eleven_multilingual_v1',
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75
          }
        },
        responseType: 'arraybuffer',
        timeout: 15000 // 15 second timeout
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('Received empty response from ElevenLabs API');
      }

      console.log(`Generated ${response.data.length} bytes of audio data`);
      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error generating speech with ElevenLabs:', error);
      
      if (error.response) {
        if (error.response.status === 401) {
          throw new Error('Invalid ElevenLabs API key. Please check your settings.');
        } else if (error.response.status === 429) {
          throw new Error('ElevenLabs API rate limit exceeded. Please try again later.');
        } else {
          const errorData = error.response.data || {};
          if (typeof errorData === 'string') {
            throw new Error(`ElevenLabs API error: ${errorData}`);
          } else if (errorData.detail) {
            throw new Error(`ElevenLabs API error: ${errorData.detail}`);
          } else {
            throw new Error(`ElevenLabs API error: ${error.response.status}`);
          }
        }
      }
      
      throw error;
    }
  },

  getSubscriptionInfo: async () => {
    try {
      const settings = await elevenlabsService.getSettings();
      
      if (!settings.apiKey) {
        throw new Error('ElevenLabs API key not found');
      }

      const response = await axios.get('https://api.elevenlabs.io/v1/user/subscription', {
        headers: {
          'Accept': 'application/json',
          'xi-api-key': settings.apiKey
        }
      });

      if (response.data) {
        return {
          tier: response.data.tier || 'starter',
          characterCount: response.data.character_count || 0,
          characterLimit: response.data.character_limit || 10000
        };
      }

      // Return default values if API doesn't provide subscription info
      return {
        tier: 'starter',
        characterCount: 0,
        characterLimit: 10000
      };
    } catch (error) {
      console.error('Error getting ElevenLabs subscription info:', error);
      
      // Return default values on error
      return {
        tier: 'starter',
        characterCount: 0,
        characterLimit: 10000
      };
    }
  },

  /**
   * Generate speech from text using ElevenLabs API
   * @param {string} text - Text to synthesize
   * @param {string} voiceId - Voice ID to use
   * @param {Object} options - Additional options
   * @returns {Promise<Buffer>} Audio data
   */
  generateSpeech: async (text, voiceId = null, options = {}) => {
    try {
      const settings = await elevenlabsService.getSettings();
      
      if (!settings.apiKey) {
        throw new Error('ElevenLabs API key not found');
      }

      const selectedVoiceId = voiceId || settings.voiceId || 'EXAVITQu4vr4xnSDxMaL'; // Default Bella voice
      
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
        {
          text: text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': settings.apiKey
          },
          responseType: 'arraybuffer',
          timeout: 15000
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error generating ElevenLabs speech:', error);
      throw error;
    }
  },

  /**
   * Synthesize text to audio stream for real-time playback
   * @param {string} text - Text to synthesize
   * @param {Object} options - Synthesis options
   * @returns {Promise<Stream>} Audio stream
   */
  synthesizeToStream: async (text, options = {}) => {
    try {
      const {
        voiceId = null,
        language = 'en-US',
        streaming = true
      } = options;
      
      const settings = await elevenlabsService.getSettings();
      
      if (!settings.apiKey) {
        throw new Error('ElevenLabs API key not found');
      }

      const selectedVoiceId = voiceId || settings.voiceId || 'EXAVITQu4vr4xnSDxMaL';
      
      console.log(`[ElevenLabs] Starting stream synthesis with voice: ${selectedVoiceId}`);
      
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}/stream`,
        {
          text: text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': settings.apiKey
          },
          responseType: 'stream', // Important for streaming
          timeout: 10000 // Shorter timeout for real-time
        }
      );

      console.log(`[ElevenLabs] Stream synthesis started successfully for voice: ${selectedVoiceId}`);
      return response.data; // Return the stream directly
      
    } catch (error) {
      console.error('[ElevenLabs] Stream synthesis error:', error);
      throw new Error(`ElevenLabs stream synthesis failed: ${error.message}`);
    }
  }
};

module.exports = elevenlabsService;
