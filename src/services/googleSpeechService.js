const speech = require('@google-cloud/speech');
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs').promises;
const Setting = require('../models/Setting');
const { Transform } = require('stream');
const audioStreamService = require('./audioStreamService');

// Emotion configurations for natural speech
const emotionConfigs = {
  happy: {
    pitch: '+2st',
    rate: '110%',
    emphasis: 'moderate',
    volumeGain: 2.0
  },
  concerned: {
    pitch: '-1st',
    rate: '95%',
    emphasis: 'strong',
    volumeGain: 0.8
  },
  neutral: {
    pitch: 'medium',
    rate: 'medium',
    emphasis: 'none',
    volumeGain: 1.0
  },
  excited: {
    pitch: '+3st',
    rate: '115%',
    emphasis: 'moderate',
    volumeGain: 2.5
  },
  professional: {
    pitch: 'medium',
    rate: '100%',
    emphasis: 'none',
    volumeGain: 1.2
  }
};

// Helper to detect emotion from text
const detectEmotion = (text) => {
  const emotionPatterns = {
    happy: /great|excellent|wonderful|thank you|appreciate|happy|glad|perfect/i,
    concerned: /sorry|unfortunately|issue|problem|worry|concern/i,
    excited: /amazing|fantastic|incredible|excellent|outstanding/i,
    professional: /certainly|understood|acknowledge|confirm|assist/i
  };

  for (const [emotion, pattern] of Object.entries(emotionPatterns)) {
    if (pattern.test(text)) return emotion;
  }
  return 'neutral';
};

// Process text for SSML with emotion and natural speech patterns
// Enhanced for better Hindi and multilingual support
const processTextForSSML = (text, emotion = 'neutral', language = 'en-US') => {
  const config = emotionConfigs[emotion];
  const isHindi = /hi-IN|hindi/i.test(language);
  
  // Hindi-specific patterns for sentence splitting
  const sentenceRegex = isHindi 
    ? /(?<=[।?!])\s+/ // Hindi sentence markers
    : /(?<=[.!?])\s+/; // English sentence markers
  
  // Split into sentences for individual processing
  const sentences = text.split(sentenceRegex).filter(s => s.trim().length > 0);
  
  const processedSentences = sentences.map(sentence => {
    let ssml = '';
    const trimmedSentence = sentence.trim();
    
    // Add emotion-specific prosody wrapper
    ssml += `<prosody pitch="${config.pitch}" rate="${config.rate}" volume="${config.volumeGain}db">`;
    
    // Process based on sentence type with language-specific enhancements
    if (isHindi) {
      // Hindi-specific processing
      if (trimmedSentence.endsWith('?') || /क्या|कौन|कब|कहाँ|कैसे/.test(trimmedSentence)) {
        // Question in Hindi - rising intonation
        ssml += `<prosody pitch="+2st" rate="95%" contour="(0%,+0st) (50%,+1st) (100%,+3st)">${sentence}</prosody>`;
      }
      else if (trimmedSentence.endsWith('!') || /वाह|अरे|हाय/.test(trimmedSentence)) {
        // Exclamation in Hindi - emphasized
        ssml += `<emphasis level="strong">${sentence}</emphasis>`;
      }
      else if (/धन्यवाद|शुक्रिया|आभार/.test(trimmedSentence)) {
        // Gratitude expressions - warm tone
        ssml += `<prosody pitch="+1st" rate="90%">${sentence}</prosody>`;
      }
      else {
        // Add subtle variations for normal Hindi sentences
        ssml += `<prosody contour="(0%,+0st) (25%,+0.5st) (75%,-0.5st) (100%,-1st)">${sentence}</prosody>`;
      }
    } else {
      // English and other languages processing
      if (trimmedSentence.endsWith('?')) {
        ssml += `<prosody pitch="high" rate="95%">${sentence}</prosody>`;
      }
      else if (trimmedSentence.endsWith('!')) {
        ssml += `<emphasis level="strong">${sentence}</emphasis>`;
      }
      else {
        ssml += sentence;
      }
    }
    
    ssml += '</prosody>';
    return ssml;
  });

  // Combine with appropriate breaks (slightly longer for Hindi)
  const breakTime = isHindi ? '400ms' : '300ms';
  return `<speak>
    ${processedSentences.join(`<break time="${breakTime}"/>`)}
  </speak>`;
};

// Google Cloud Speech Services
const googleSpeechService = {
  // Initialize Google Cloud Speech client
  getClient: async () => {
    try {
      return new speech.SpeechClient();
    } catch (error) {
      console.error('Error initializing Google Cloud Speech client:', error);
      throw error;
    }
  },

  // Transcribe audio using Google Speech-to-Text
  transcribe: async (audioBuffer, options = {}) => {
    try {
      console.log('Transcribing with Google Speech API...');
      const client = await googleSpeechService.getClient();
      
      // Configure the request
      const request = {
        audio: {
          content: audioBuffer.toString('base64')
        },
        config: {
          encoding: options.encoding || 'LINEAR16',
          sampleRateHertz: options.sampleRateHertz || 16000,
          languageCode: options.languageCode || 'en-US',
          model: 'latest_short',
          useEnhanced: true,
          enableAutomaticPunctuation: true
        }
      };
      
      // Perform the API call
      const [response] = await client.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join(' ');
      
      console.log(`Google Speech transcription result: "${transcription}"`);
      return transcription;
    } catch (error) {
      console.error('Error in Google Speech transcription:', error);
      return '';
    }
  },

  // Initialize Google Cloud Text-to-Speech client
  getTTSClient: async () => {
    try {
      return new textToSpeech.TextToSpeechClient();
    } catch (error) {
      console.error('Error initializing Google Cloud Text-to-Speech client:', error);
      throw error;
    }
  },
  // Enhanced text-to-speech with emotion detection and natural speech
  async textToSpeech(text, audioStream, options = {}) {
    try {
      // First check for valid stream
      if (!audioStream?.output || !audioStream?.id) {
        throw new Error('Invalid audio stream provided');
      }

      // Get fresh stream reference to ensure we have the current state
      const currentStream = audioStreamService.getStream(audioStream.id);
      if (!currentStream || !currentStream.active) {
        console.error(`[GoogleTTS] Stream for ${audioStream.id} is not active or not found`);
        throw new Error(`Stream ${audioStream.id} is not active or not found`);
      }

      // Initialize TTS client
      const client = await googleSpeechService.getTTSClient();
      
      // Add defensive delay to ensure WebSocket connection is stable
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Stream recovery logic with validation
      if (currentStream.needsReconnect || !currentStream.output.readable) {
        console.log(`[GoogleTTS] Detected stream needs reconnect for ${currentStream.id}, attempting recovery`);
        try {
          const recoveredStream = await audioStreamService.reconnectStream(currentStream.id);
          if (!recoveredStream || !recoveredStream.active) {
            throw new Error('Stream recovery failed - stream not active after recovery');
          }
          console.log(`[GoogleTTS] Stream recovery successful for ${currentStream.id}`);
          // Use the recovered stream
          audioStream = recoveredStream;
        } catch (error) {
          console.error(`[GoogleTTS] Stream recovery failed for ${currentStream.id}:`, error);
          throw error;
        }
      }
      
      // Set AI as speaking before starting synthesis - with validation
      try {
        await audioStreamService.setAISpeaking(audioStream.id, true);
      } catch (stateError) {
        console.warn(`[GoogleTTS] Error setting AI speaking state: ${stateError.message}`);
        // Continue anyway since this is non-critical
      }
      
      // Process text using SSML for better speech quality
      const ssml = processTextForSSML(text, options.emotion || detectEmotion(text), options.language);
      console.log(`[GoogleTTS] Using SSML: ${ssml}`);
      
      // Configure synthesis request with optimized settings
      const request = {
        input: { ssml },
        voice: {
          languageCode: options.language || 'en-US',
          name: options.voice || null,
          ssmlGender: 'FEMALE'
        },        audioConfig: {
          audioEncoding: 'MULAW',
          sampleRateHertz: 8000,
          effectsProfileId: ['telephony-class-application', 'headphone-class-device'],
          volumeGainDb: 16.0,  // Extremely high volume gain (16dB) for maximum audibility 
          pitch: 0.8,  // Higher pitch for better clarity on phone calls
          speakingRate: 0.85,  // Even slower rate for better clarity and audibility
        },
      };      // Get synthesized speech
      console.log(`[GoogleTTS] Generating speech for call ${audioStream.id}`);
      const [response] = await client.synthesizeSpeech(request);
      
      if (!response?.audioContent) {
        throw new Error('No audio content received from Google TTS');
      }      // Create buffer from audio content and setup stream
      const audioBuffer = Buffer.from(response.audioContent);
      
      // Verify stream is still active before sending audio
      const activeStream = audioStreamService.getStream(audioStream.id);
      if (!activeStream?.active) {
        console.log('[GoogleTTS] Stream no longer active, aborting audio transmission');
        return false;
      }
        // Send initial silent packets to establish stream
      console.log('[GoogleTTS] Sending initial silence packets');
      const silentPacket = Buffer.alloc(640, 127); // 40ms of silence at 8kHz
      
      // Send additional audio test tone to verify audio connectivity
      console.log('[GoogleTTS] Sending audio test tone');
      const testTonePacket = Buffer.alloc(640);
      for (let i = 0; i < 640; i++) {
        // Generate an audible test tone (alternating values)
        testTonePacket[i] = i % 2 === 0 ? 200 : 50;
      }
      
      // Send 400ms of initial silence (10 packets * 40ms)
      for (let i = 0; i < 10 && activeStream.active; i++) {
        try {
          if (!activeStream.output.push(silentPacket)) {
            console.log('[GoogleTTS] Stream backpressure detected, waiting...');
            await new Promise(resolve => activeStream.output.once('drain', resolve));
          }
          await new Promise(resolve => setTimeout(resolve, 40)); // Match packet timing
        } catch (error) {
          if (error.code === 'ERR_STREAM_PUSH_AFTER_EOF') {
            console.log('[GoogleTTS] Stream ended, stopping silence packets');
            return false;
          }
          console.error('[GoogleTTS] Error sending silence packet:', error);
        }
      }
      
      // Send test tone packets to verify audio connection
      for (let i = 0; i < 5 && activeStream.active; i++) {
        try {
          if (!activeStream.output.push(testTonePacket)) {
            console.log('[GoogleTTS] Stream backpressure detected during test tone, waiting...');
            await new Promise(resolve => activeStream.output.once('drain', resolve));
          }
          await new Promise(resolve => setTimeout(resolve, 40)); // Match packet timing
        } catch (error) {
          if (error.code === 'ERR_STREAM_PUSH_AFTER_EOF') {
            console.log('[GoogleTTS] Stream ended during test tone');
            return false;
          }
          console.error('[GoogleTTS] Error sending test tone packet:', error);
        }
      }
      
      console.log('[GoogleTTS] Test tone transmission complete');
      
      // Send audio data in smaller chunks with improved timing and error handling
      const CHUNK_SIZE = 640; // 40ms of audio at 8kHz mu-law
      let lastChunkTime = Date.now();
      let consecutiveErrors = 0;
      let streamClosed = false;
      
      console.log(`[GoogleTTS] Starting audio transmission for ${audioStream.id}`);
      for (let offset = 0; offset < audioBuffer.length; offset += CHUNK_SIZE) {
        try {
          // Check if stream is closed or not active before sending more data
          const stream = audioStreamService.getStream(audioStream.id);
          if (!stream || !stream.active) {
            console.log('[GoogleTTS] Stream closed or inactive - stopping transmission');
            break;
          }
          
          // Check if we should continue speaking
          if (!stream.aiSpeaking) {
            console.log('[GoogleTTS] Speech interrupted - stopping transmission');
            break;
          }

          // Calculate time since last chunk
          const now = Date.now();
          const timeSinceLastChunk = now - lastChunkTime;
          
          // Maintain consistent timing (aim for 40ms between chunks)
          if (timeSinceLastChunk < 40) {
            await new Promise(resolve => setTimeout(resolve, 40 - timeSinceLastChunk));
          }          // Send chunk with padding if needed
          const chunk = audioBuffer.slice(offset, offset + CHUNK_SIZE);
          
          // Check stream again before pushing data
          const currentStream = audioStreamService.getStream(audioStream.id);
          if (!currentStream || !currentStream.active || !currentStream.output) {
            console.log('[GoogleTTS] Stream no longer available - stopping transmission');
            break;
          }
            let pushSuccess = true;
          try {
            // Verify stream is still writable before attempting to push
            if (!currentStream.output.readable || !currentStream.active) {
              console.log('[GoogleTTS] Stream no longer readable/active, stopping transmission');
              break;
            }
              if (chunk.length < CHUNK_SIZE) {
              // Pad the last chunk with silence to maintain timing
              const paddedChunk = Buffer.alloc(CHUNK_SIZE, 127);
              chunk.copy(paddedChunk);
              pushSuccess = currentStream.output.push(paddedChunk);
            } else {
              // Amplify the audio before sending to make it louder
              const amplifiedChunk = Buffer.from(chunk);
              for (let i = 0; i < amplifiedChunk.length; i++) {
                // Normalize mulaw bytes (0-255) to range around 127
                const centered = amplifiedChunk[i] - 127;
                // Amplify by 1.5x while avoiding clipping
                const amplified = Math.max(0, Math.min(255, Math.round(centered * 1.5 + 127)));
                amplifiedChunk[i] = amplified;
              }
              pushSuccess = currentStream.output.push(amplifiedChunk);
            }
            
            // Handle backpressure with improved error handling
            if (!pushSuccess) {
              console.log('[GoogleTTS] Backpressure detected, waiting for drain event');
              await new Promise((resolve, reject) => {
                // Set timeout to prevent indefinite waiting
                const timeout = setTimeout(() => {
                  currentStream.output.removeListener('drain', onDrain);
                  currentStream.output.removeListener('error', onError);
                  reject(new Error('Timeout waiting for drain event'));
                }, 5000);
                
                const onDrain = () => {
                  clearTimeout(timeout);
                  currentStream.output.removeListener('error', onError);
                  resolve();
                };
                
                const onError = (err) => {
                  clearTimeout(timeout);
                  currentStream.output.removeListener('drain', onDrain);
                  reject(err);
                };
                
                currentStream.output.once('drain', onDrain);
                currentStream.output.once('error', onError);
              });
            }
          } catch (pushError) {
            // Handle specific stream errors
            if (pushError.code === 'ERR_STREAM_PUSH_AFTER_EOF') {
              console.log('[GoogleTTS] Cannot push after EOF, stream closed');
              break;
            } else if (pushError.code === 'ERR_STREAM_DESTROYED') {
              console.log('[GoogleTTS] Stream destroyed, stopping transmission');
              break;
            } else {
              console.error('[GoogleTTS] Error pushing chunk:', pushError);
              consecutiveErrors++;
              if (consecutiveErrors > 3) {
                console.log('[GoogleTTS] Too many consecutive errors, stopping transmission');
                break;
              }
            }
          }

          lastChunkTime = Date.now();
          consecutiveErrors = 0;
          
          // Add heartbeat every second (25 chunks)
          if (offset % (CHUNK_SIZE * 25) === 0) {
            audioStream.emit('heartbeat');
            console.log(`[GoogleTTS] Heartbeat - ${Math.floor((offset / audioBuffer.length) * 100)}% complete`);
          }
        } catch (chunkError) {
          console.error('[GoogleTTS] Error sending chunk:', chunkError);
          consecutiveErrors++;
          if (consecutiveErrors > 3) {
            throw new Error('Too many consecutive errors while sending audio');
          }
          await new Promise(resolve => setTimeout(resolve, 50)); // Brief pause before retrying
        }
      }

      console.log(`[GoogleTTS] Successfully sent audio for call ${audioStream.id}`);
      return true;

    } catch (error) {
      console.error('[GoogleTTS] Error in speech synthesis:', error);
      if (audioStream?.id) {
        audioStreamService.setAISpeaking(audioStream.id, false);
      }
      throw error;
    } finally {
      // Ensure AI speaking state is reset
      if (audioStream?.id) {
        await audioStreamService.setAISpeaking(audioStream.id, false);
      }
    }
  },
  // Real-time speech recognition stream - Fixed for Twilio compatibility
  createRecognitionStream: (audioStream, language) => {
    const client = new speech.SpeechClient();

    // Configure language settings based on detected language
    const languageConfig = (() => {
      switch(language) {
        case 'hindi':
          return {
            languageCode: 'hi-IN',
            alternativeLanguageCodes: ['en-IN']
          };
        case 'hinglish':
          return {
            languageCode: 'hi-IN',
            alternativeLanguageCodes: ['en-IN', 'en-US'],
          };
        case 'auto':
          return {
            languageCode: 'hi-IN',
            alternativeLanguageCodes: ['en-IN', 'en-US'],
          };
        default:
          return {
            languageCode: 'en-US'
          };
      }
    })();

    // CRITICAL FIX: Use 8kHz sample rate to match Twilio's mu-law audio
    const config = {
      encoding: 'MULAW', // Twilio sends mu-law encoded audio
      sampleRateHertz: 8000, // Twilio uses 8kHz, not 48kHz
      ...languageConfig,
      enableAutomaticPunctuation: true,
      model: 'phone_call',
      useEnhanced: true,
      enableVoiceActivityDetection: true,
      enableWordTimeOffsets: true,
      metadata: {
        interactionType: 'PHONE_CALL',
        microphoneDistance: 'NEARFIELD',
        originalMediaType: 'AUDIO',
        recordingDeviceType: 'PHONE_LINE'
      }
    };

    console.log(`[GoogleSpeech] Creating recognition stream with config:`, config);

    const recognizeStream = client
      .streamingRecognize({
        config,
        interimResults: true,
      })
      .on('error', (error) => {
        console.error('[GoogleSpeech] Error in speech recognition:', error);
        // Try to restart the stream on error
        setTimeout(() => {
          console.log('[GoogleSpeech] Attempting to restart recognition stream...');
          audioStream.emit('restartRecognition');
        }, 1000);
      })
      .on('data', (data) => {
        if (data.results?.[0]?.alternatives?.[0]) {
          const result = {
            transcript: data.results[0].alternatives[0].transcript,
            isFinal: data.results[0].isFinal,
            confidence: data.results[0].alternatives[0].confidence || 0,
            words: data.results[0].alternatives[0].words || [],
            languageCode: data.results[0].languageCode || languageConfig.languageCode
          };

          console.log(`[GoogleSpeech] Recognition result: "${result.transcript}" (final: ${result.isFinal}, confidence: ${result.confidence})`);
          
          // Emit recognition event directly on the audio stream
          audioStream.emit('recognition', result);

          if (data.results[0].isFinal) {
            audioStream.speaking = false;
          }
        }
      })
      .on('end', () => {
        console.log('[GoogleSpeech] Recognition stream ended');
      });    // CRITICAL FIX: Connect the audio input stream to Google's recognition stream with error handling
    try {
      audioStream.input
        .on('error', (error) => {
          console.error(`[GoogleSpeech] Input stream error:`, error);
          audioStream.emit('streamError', error);
        })
        .pipe(recognizeStream)
        .on('error', (error) => {
          console.error(`[GoogleSpeech] Recognition stream error:`, error);
          audioStream.emit('streamError', error);
        });
      
      console.log(`[GoogleSpeech] Recognition stream created and connected for language: ${language}`);
    } catch (error) {
      console.error(`[GoogleSpeech] Failed to connect streams:`, error);
      throw error;
    }
    return recognizeStream;
  }
};

module.exports = googleSpeechService;
