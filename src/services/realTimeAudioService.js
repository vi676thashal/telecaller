/**
 * Real-Time Audio Streaming Service
 * Eliminates MP3 file storage and enables direct streaming to Twilio
 */

const { Readable, PassThrough } = require('stream');
const WebSocket = require('ws');
const axios = require('axios');

class RealTimeAudioService {
  constructor() {
    this.activeStreams = new Map();
    this.twilioMediaStreams = new Map();
  }

  /**
   * Create a real-time audio stream that can be directly fed to Twilio
   * @param {string} callId - Unique call identifier
   * @param {string} text - Text to convert to speech
   * @param {object} options - TTS options
   * @returns {Promise<Readable>} Direct audio stream
   */
  async createRealTimeAudioStream(callId, text, options = {}) {
    const { 
      language = 'en-US', 
      voiceProvider = 'openai_fm',
      useStreaming = true 
    } = options;

    console.log(`[RealTimeAudio] Creating real-time stream for call ${callId}`);

    // Create a pass-through stream for immediate audio delivery
    const audioStream = new PassThrough();
    
    try {
      if (voiceProvider === 'openai_realtime') {
        // Use OpenAI Realtime API for sub-200ms latency
        return await this.createOpenAIRealtimeStream(callId, text, audioStream, options);
      } else if (voiceProvider === 'openai_fm') {
        // Use OpenAI TTS with streaming
        return await this.createOpenAIStreamingTTS(callId, text, audioStream, options);
      } else if (voiceProvider === 'elevenlabs_streaming') {
        // Use ElevenLabs streaming API
        return await this.createElevenLabsStream(callId, text, audioStream, options);
      } else {
        // Fallback to fastest available service
        return await this.createFallbackStream(callId, text, audioStream, options);
      }
    } catch (error) {
      console.error(`[RealTimeAudio] Error creating stream for call ${callId}:`, error);
      // Return empty stream to prevent call failure
      audioStream.end();
      return audioStream;
    }
  }

  /**
   * Create OpenAI Realtime API stream (fastest option)
   */
  async createOpenAIRealtimeStream(callId, text, audioStream, options) {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      // Connect to OpenAI Realtime API via WebSocket
      const ws = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      return new Promise((resolve, reject) => {
        ws.on('open', () => {
          console.log(`[RealTimeAudio] OpenAI Realtime WebSocket connected for call ${callId}`);
          
          // Configure session for optimal voice settings
          ws.send(JSON.stringify({
            type: 'session.update',
            session: {
              modalities: ['text', 'audio'],
              instructions: `Convert this text to speech: "${text}"`,
              voice: options.voice || 'alloy',
              output_audio_format: 'pcm16',
              turn_detection: null // Disable turn detection for TTS-only
            }
          }));

          // Send the text for TTS conversion
          ws.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text }]
            }
          }));

          // Trigger response generation
          ws.send(JSON.stringify({
            type: 'response.create',
            response: {
              modalities: ['audio'],
              instructions: 'Convert the provided text to speech immediately.'
            }
          }));
        });

        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data);
            
            if (message.type === 'response.audio.delta') {
              // Stream audio chunks directly as they arrive
              const audioChunk = Buffer.from(message.delta, 'base64');
              audioStream.push(audioChunk);
            } else if (message.type === 'response.audio.done') {
              // Audio generation complete
              console.log(`[RealTimeAudio] OpenAI Realtime TTS completed for call ${callId}`);
              audioStream.end();
              ws.close();
            } else if (message.type === 'error') {
              console.error(`[RealTimeAudio] OpenAI Realtime error:`, message.error);
              reject(new Error(message.error.message));
            }
          } catch (parseError) {
            console.error(`[RealTimeAudio] Error parsing OpenAI message:`, parseError);
          }
        });

        ws.on('error', (error) => {
          console.error(`[RealTimeAudio] OpenAI Realtime WebSocket error:`, error);
          reject(error);
        });

        // Return the stream immediately for parallel processing
        resolve(audioStream);
      });
    } catch (error) {
      console.error(`[RealTimeAudio] OpenAI Realtime setup error:`, error);
      throw error;
    }
  }

  /**
   * Create OpenAI TTS streaming (good fallback option)
   */
  async createOpenAIStreamingTTS(callId, text, audioStream, options) {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OpenAI API key not configured');
      }

      console.log(`[RealTimeAudio] Creating OpenAI TTS stream for call ${callId}`);

      const response = await axios.post('https://api.openai.com/v1/audio/speech', {
        model: 'tts-1', // Use tts-1 for lower latency (tts-1-hd for quality)
        input: text,
        voice: options.voice || 'alloy',
        response_format: 'mp3',
        speed: options.speed || 1.0
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream', // Important: stream the response
        timeout: 5000 // 5 second timeout for fast failure
      });

      // Pipe the response directly to our audio stream
      response.data.on('data', (chunk) => {
        audioStream.push(chunk);
      });

      response.data.on('end', () => {
        console.log(`[RealTimeAudio] OpenAI TTS streaming completed for call ${callId}`);
        audioStream.end();
      });

      response.data.on('error', (error) => {
        console.error(`[RealTimeAudio] OpenAI TTS streaming error:`, error);
        audioStream.emit('error', error);
      });

      return audioStream;
    } catch (error) {
      console.error(`[RealTimeAudio] OpenAI TTS error:`, error);
      throw error;
    }
  }

  /**
   * Create ElevenLabs streaming
   */
  async createElevenLabsStream(callId, text, audioStream, options) {
    try {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        throw new Error('ElevenLabs API key not configured');
      }

      console.log(`[RealTimeAudio] Creating ElevenLabs stream for call ${callId}`);

      // Use ElevenLabs streaming endpoint
      const voiceId = options.voiceId || 'pNInz6obpgDQGcFmaJgB'; // Default voice
      
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
          text: text,
          model_id: 'eleven_turbo_v2', // Fastest model
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': apiKey
          },
          responseType: 'stream',
          timeout: 8000
        }
      );

      response.data.on('data', (chunk) => {
        audioStream.push(chunk);
      });

      response.data.on('end', () => {
        console.log(`[RealTimeAudio] ElevenLabs streaming completed for call ${callId}`);
        audioStream.end();
      });

      response.data.on('error', (error) => {
        console.error(`[RealTimeAudio] ElevenLabs streaming error:`, error);
        audioStream.emit('error', error);
      });

      return audioStream;
    } catch (error) {
      console.error(`[RealTimeAudio] ElevenLabs error:`, error);
      throw error;
    }
  }

  /**
   * Create fallback stream using fastest available service
   */
  async createFallbackStream(callId, text, audioStream, options) {
    console.log(`[RealTimeAudio] Creating fallback stream for call ${callId}`);
    
    // Try services in order of speed: OpenAI Realtime > OpenAI TTS > ElevenLabs
    const services = ['openai_realtime', 'openai_fm', 'elevenlabs_streaming'];
    
    for (const service of services) {
      try {
        console.log(`[RealTimeAudio] Trying ${service} for call ${callId}`);
        return await this.createRealTimeAudioStream(callId, text, { 
          ...options, 
          voiceProvider: service 
        });
      } catch (error) {
        console.warn(`[RealTimeAudio] ${service} failed for call ${callId}:`, error.message);
        continue;
      }
    }
    
    // If all services fail, return empty stream
    console.error(`[RealTimeAudio] All services failed for call ${callId}`);
    audioStream.end();
    return audioStream;
  }

  /**
   * Connect audio stream directly to Twilio Media Stream
   */
  async streamToTwilio(callId, audioStream, twilioWebSocket) {
    try {
      console.log(`[RealTimeAudio] Streaming audio to Twilio for call ${callId}`);
        audioStream.on('data', (chunk) => {        if (twilioWebSocket && twilioWebSocket.readyState === WebSocket.OPEN) {
          // Convert audio to base64 and send to Twilio Media Stream
          const audioPayload = {
            event: 'media',  // FIXED: Use 'event' instead of 'action' for messages TO Twilio
            streamSid: callId,
            media: {
              payload: chunk.toString('base64'),
              track: "outbound",  // Required for Twilio to correctly handle the media
              chunk: String(Date.now()),
              timestamp: String(Date.now())
            }
          };
          
          twilioWebSocket.send(JSON.stringify(audioPayload));
        }
      });

      audioStream.on('end', () => {
        console.log(`[RealTimeAudio] Audio streaming to Twilio completed for call ${callId}`);
      });

      audioStream.on('error', (error) => {
        console.error(`[RealTimeAudio] Error streaming to Twilio for call ${callId}:`, error);
      });

    } catch (error) {
      console.error(`[RealTimeAudio] Error setting up Twilio stream for call ${callId}:`, error);
    }
  }

  /**
   * Clean up resources for a call
   */
  async cleanup(callId) {
    console.log(`[RealTimeAudio] Cleaning up resources for call ${callId}`);
    
    if (this.activeStreams.has(callId)) {
      const stream = this.activeStreams.get(callId);
      stream.destroy();
      this.activeStreams.delete(callId);
    }

    if (this.twilioMediaStreams.has(callId)) {
      const ws = this.twilioMediaStreams.get(callId);
      ws.close();
      this.twilioMediaStreams.delete(callId);
    }
  }

  /**
   * Get stream status for monitoring
   */
  getStreamStatus(callId) {
    return {
      hasActiveStream: this.activeStreams.has(callId),
      hasTwilioConnection: this.twilioMediaStreams.has(callId),
      timestamp: Date.now()
    };
  }
}

module.exports = new RealTimeAudioService();
