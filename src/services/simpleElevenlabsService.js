/**
 * Simple ElevenLabs Direct Service
 * 
 * This service bypasses MongoDB and uses environment variables directly
 */
const axios = require('axios');
const Setting = require('../models/Setting');

const simpleElevenlabsService = {  getApiKey: async () => {
    try {
      // Check if MongoDB is available before attempting database query
      if (global.isMongoDBAvailable && global.isMongoDBAvailable()) {
        try {
          const setting = await Setting.findOne({ key: 'elevenlabsApiKey' });
          if (setting && setting.value) {
            return setting.value;
          }
        } catch (dbError) {
          console.log('ElevenLabs: Database query failed, using environment variable');
        }
      } else {
        console.log('ElevenLabs: MongoDB not available, using environment variable');
      }
      
      // Fall back to environment variable
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        throw new Error('ElevenLabs API key not found in database or environment variables');
      }
      
      return apiKey;
    } catch (error) {
      console.error('Error getting ElevenLabs API key:', error.message);
      // Last resort fallback to environment variable
      return process.env.ELEVENLABS_API_KEY;
    }
  },
    getAvailableVoices: async () => {
    try {
      console.log('ElevenLabs: Getting API key...');
      const apiKey = await simpleElevenlabsService.getApiKey();
      
      if (!apiKey) {
        console.error('ElevenLabs: API key not found');
        throw new Error('ElevenLabs API key not found');
      }
      
      console.log('ElevenLabs: Fetching voices from API...');
      const response = await axios({
        method: 'get',
        url: 'https://api.elevenlabs.io/v1/voices',
        headers: {
          'xi-api-key': apiKey
        },
        timeout: 20000
      });
      
      console.log('ElevenLabs: API response received');
      
      if (response.data && response.data.voices) {
        const formattedVoices = response.data.voices.map(voice => ({
          id: voice.voice_id,
          name: voice.name,
          description: voice.description || '',
          preview_url: voice.preview_url || '',
          category: voice.category || 'standard',
          language: voice.labels?.language || 'en-US'
        }));
        
        console.log(`ElevenLabs: Successfully mapped ${formattedVoices.length} voices`);
        return formattedVoices;
      }
      
      console.log('ElevenLabs: No voices found in response');
      return [];
    } catch (error) {
      console.error('Error getting ElevenLabs voices:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      }
      throw new Error(`Failed to get ElevenLabs voices: ${error.message}`);
    }
  },
  generateSpeech: async (text, language = 'en-US', voiceId = null) => {
    const apiKey = await simpleElevenlabsService.getApiKey();
    
    // CRITICAL FIX: Use verified working ElevenLabs voice IDs
    const workingVoiceIds = {
      'rachel': '21m00Tcm4TlvDq8ikWAM',     // Rachel - verified working
      'adam': 'pNInz6obpgDQGcFmaJgB',       // Adam - verified working  
      'bella': 'EXAVITQu4vr4xnSDxMaL',     // Bella - verified working
      'arnold': 'VR6AewLTigWG4xSOukaG',    // Arnold - verified working
      'default': '21m00Tcm4TlvDq8ikWAM'    // Default to Rachel
    };
    
    // Handle voice ID - use working voice or map to working voice
    let selectedVoiceId;
    if (voiceId && workingVoiceIds[voiceId]) {
      selectedVoiceId = workingVoiceIds[voiceId];
    } else if (voiceId && Object.values(workingVoiceIds).includes(voiceId)) {
      selectedVoiceId = voiceId; // Already a valid voice ID
    } else {
      // Use environment variable if it's a working voice, otherwise default
      const envVoiceId = process.env.ELEVENLABS_VOICE_ID;
      selectedVoiceId = (envVoiceId && Object.values(workingVoiceIds).includes(envVoiceId)) 
        ? envVoiceId 
        : workingVoiceIds.default;
    }
    
    if (!apiKey) {
      throw new Error('ElevenLabs API key not found in database or environment variables');
    }
    
    console.log(`ElevenLabs: Generating speech with voiceId: ${selectedVoiceId} for text: "${text.substring(0, 50)}..."`);
    
    try {
      const response = await axios({
        method: 'post',
        url: `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
        data: {
          text: text,
          model_id: 'eleven_multilingual_v2', // Better quality model
          voice_settings: {
            stability: 0.5, // Lower for more natural speech
            similarity_boost: 0.8, // Higher for better voice quality
            style: 0.2, // Add some style for more human-like speech
            use_speaker_boost: true // Better audio quality
          },
          output_format: 'mp3_44100_128' // Higher quality output
        },
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        responseType: 'arraybuffer',
        timeout: 20000
      });
        return Buffer.from(response.data);
    } catch (error) {
      console.error('ElevenLabs API error:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', error.response.data);
      }
      throw new Error(`ElevenLabs speech generation failed: ${error.message}`);
    }
  },

  // Generate streaming audio for real-time communication
  generateStreamingAudio: async (text, language = 'en-US', options = {}) => {
    try {
      console.log(`ElevenLabs: Generating streaming audio for: "${text.substring(0, 50)}..."`);
      
      const apiKey = await simpleElevenlabsService.getApiKey();
      if (!apiKey) {
        throw new Error('ElevenLabs API key not found');
      }

      // Use default voice for streaming (Rachel - good for English)
      const voiceId = options.voiceId || 'rachel';
      const format = options.format || 'mulaw'; // Twilio format
      const sampleRate = options.sampleRate || 8000; // Twilio sample rate
      
      console.log(`ElevenLabs: Streaming request with voice: ${voiceId}, format: ${format}`);
        const response = await axios({
        method: 'post',
        url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        data: {
          text: text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.2,
            use_speaker_boost: true
          },
          output_format: format === 'mulaw' ? 'pcm_22050' : 'mp3_44100_128'
        },
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          'Accept': 'audio/mpeg'
        },
        responseType: 'stream',
        timeout: 20000, // Increased from 10 seconds to 20 seconds
        maxContentLength: 100 * 1024 * 1024 // Allow larger responses (100MB)
      });
      
      // If we need mulaw format for Twilio, we'll need to convert
      if (format === 'mulaw' && sampleRate === 8000) {
        // For now, return the stream as-is and handle conversion at the caller level
        // In production, you'd want to pipe through an audio converter
      }
      
      console.log('ElevenLabs: Streaming audio generated successfully');
      return response.data;
    } catch (error) {
      console.error('ElevenLabs streaming error:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
      }
      throw new Error(`ElevenLabs streaming failed: ${error.message}`);
    }
  },

  // Generate streaming audio for real-time responses
  generateStreamingAudio: async (text, options = {}) => {
    try {
      console.log(`ElevenLabs: Generating streaming audio...`);
      const apiKey = await simpleElevenlabsService.getApiKey();
      
      if (!apiKey) {
        throw new Error('ElevenLabs API key not found');
      }
      
      // Extract options with defaults
      const { 
        language = 'en-US', 
        format = 'mp3',
        voice = '', 
        streaming = true 
      } = options;
      
      // Use default voice if not specified
      let voiceId = voice || 'ErXwobaYiN019PkySvjV'; // Default: Antoni
      
      // Support for language-specific voice selection
      if (!voice) {
        if (language.startsWith('hi')) {
          voiceId = 'CYw3kZ02Hs0563khs1Fj'; // Use appropriate voice for Hindi
        }
      }
      
      // Optimize voice settings for streaming
      const stability = 0.5; // Balanced stability (0-1)
      const similarityBoost = 0.75; // Higher similarity boost (0-1)
      const style = 1.0; // Full style transfer when applicable
      const useSpeakerBoost = true; // Enable speaker boost for clearer audio

      // Make streaming request to ElevenLabs API
      const response = await axios({
        method: 'post',
        url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        data: {
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            style,
            use_speaker_boost: useSpeakerBoost
          }
        },
        responseType: 'stream'
      });
      
      // Get the stream directly from the response
      const audioStream = response.data;
      
      // Convert to the requested format if needed
      if (format !== 'mp3' && format === 'mulaw') {
        // For Twilio, convert to 8kHz mulaw
        const { convertToMulaw } = require('../utils/audioUtils');
        return convertToMulaw(audioStream);
      }
      
      return audioStream;
    } catch (error) {
      console.error('ElevenLabs streaming error:', error.message);
      throw new Error(`ElevenLabs streaming failed: ${error.message}`);
    }
  },
};

module.exports = simpleElevenlabsService;
