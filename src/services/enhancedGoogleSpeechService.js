const speech = require('@google-cloud/speech');
const textToSpeech = require('@google-cloud/text-to-speech');
const fs = require('fs').promises;
const Setting = require('../models/Setting');
const { Transform } = require('stream');
const audioStreamService = require('./audioStreamService');

// Ultra-fast transcription configurations for real-time conversation - ENHANCED FOR QUALITY
const ULTRA_FAST_CONFIG = {
  // Enhanced silence threshold for better accuracy - CRITICAL FIX
  silenceThreshold: 600,        // Reduced from 800ms to 600ms for faster detection
  minSpeechDuration: 400,       // Minimum 400ms for valid speech
  maxSilenceDuration: 1200,     // Maximum silence before cutoff
  
  // Optimized audio chunk sizes for faster processing
  minChunkSize: 3200,          // 200ms at 16kHz (was 6400/400ms)
  maxChunkSize: 8000,          // 500ms at 16kHz (was 16000/1000ms)
  
  // Enhanced language detection for better accuracy
  enableLanguageDetection: true,
  
  // Faster model selection
  preferredModel: 'latest_short', // Optimized for real-time short utterances
  
  // Enhanced punctuation and formatting - IMPROVED
  enableAutoFormatting: true,
  enablePunctuation: true,
  enableWordTimestamps: true,
  
  // Noise reduction for better accuracy
  enableNoiseReduction: true,
  
  // Real-time streaming optimizations
  streamingChunkMs: 100,       // Process every 100ms for ultra-fast response
  
  // Enhanced confidence thresholds - IMPROVED FOR QUALITY
  minConfidence: 0.7,          // Increased from 0.6 for better quality
  
  // Multi-language support with fast switching
  primaryLanguages: ['en-US', 'hi-IN'],
  fallbackLanguage: 'en-US',
  
  // Enhanced contextual boosting - NEW
  contextualPhrases: [
    'yes', 'no', 'hello', 'hi', 'thank you', 'please',
    'can you', 'tell me', 'I want', 'I need', 'help me',
    'interested', 'not interested', 'call back', 'remove me',
    'what is', 'how much', 'when', 'where', 'why'
  ],
  phraseBoost: 10.0
};

// Enhanced emotion configurations for more natural speech
const emotionConfigs = {
  happy: {
    pitch: '+2st',
    rate: '108%',      // Optimized for natural conversation flow
    emphasis: 'moderate',
    volumeGain: 2.0,
    contour: '(0%,+0st) (50%,+2st) (100%,+1st)'
  },
  concerned: {
    pitch: '-1st',
    rate: '92%',       // Slightly slower for empathy
    emphasis: 'strong',
    volumeGain: 0.8,
    contour: '(0%,+0st) (30%,-1st) (70%,-2st) (100%,-1st)'
  },
  neutral: {
    pitch: 'medium',
    rate: '100%',      // Standard rate for natural flow
    emphasis: 'none',
    volumeGain: 1.0,
    contour: '(0%,+0st) (25%,+0.5st) (75%,-0.5st) (100%,-0.5st)'
  },
  excited: {
    pitch: '+3st',
    rate: '112%',      // Faster for excitement but still clear
    emphasis: 'moderate',
    volumeGain: 2.5,
    contour: '(0%,+1st) (50%,+4st) (100%,+2st)'
  },
  professional: {
    pitch: 'medium',
    rate: '98%',       // Slightly slower for clarity
    emphasis: 'none',
    volumeGain: 1.2,
    contour: '(0%,+0st) (50%,+0st) (100%,-1st)'
  },
  warm: {
    pitch: '+1st',
    rate: '95%',       // Warm and welcoming pace
    emphasis: 'reduced',
    volumeGain: 1.1,
    contour: '(0%,+0st) (30%,+1st) (70%,+1.5st) (100%,+0.5st)'
  },
  urgent: {
    pitch: '+2st',
    rate: '115%',      // Fast but still clear
    emphasis: 'strong',
    volumeGain: 1.8,
    contour: '(0%,+1st) (25%,+3st) (75%,+2st) (100%,+1st)'
  }
};

// Enhanced emotion detection with more patterns
const detectEmotion = (text) => {
  const emotionPatterns = {
    happy: /great|excellent|wonderful|thank you|appreciate|happy|glad|perfect|amazing|fantastic|love|awesome/i,
    concerned: /sorry|unfortunately|issue|problem|worry|concern|trouble|difficult|apologize|regret/i,
    excited: /amazing|fantastic|incredible|excellent|outstanding|brilliant|wow|unbelievable|superb/i,
    professional: /certainly|understood|acknowledge|confirm|assist|provide|ensure|guarantee|professional/i,
    warm: /welcome|pleased|delighted|honor|privilege|grateful|blessed|appreciate|kind|thoughtful/i,
    urgent: /urgent|immediately|asap|quickly|hurry|emergency|critical|important|now|fast/i
  };

  // Check for multiple emotion indicators and return the strongest match
  let maxMatches = 0;
  let detectedEmotion = 'neutral';
  
  for (const [emotion, pattern] of Object.entries(emotionPatterns)) {
    const matches = (text.match(pattern) || []).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedEmotion = emotion;
    }
  }
  
  return detectedEmotion;
};

// Enhanced SSML processing for ultra-natural speech
const processTextForSSML = (text, emotion = 'neutral', language = 'en-US') => {
  const config = emotionConfigs[emotion];
  const isHindi = /hi-IN|hindi/i.test(language);
  const isMixed = /mixed/i.test(language);
  
  // Enhanced sentence splitting for multiple languages
  const sentenceRegex = isHindi || isMixed
    ? /(?<=[।?!\.।])\s+/g // Hindi and mixed language markers
    : /(?<=[.!?])\s+/g;   // English sentence markers
  
  const sentences = text.split(sentenceRegex).filter(s => s.trim().length > 0);
  
  const processedSentences = sentences.map((sentence, index) => {
    let ssml = '';
    const trimmedSentence = sentence.trim();
    
    // Add emotion-specific prosody with contour
    ssml += `<prosody pitch="${config.pitch}" rate="${config.rate}" volume="${config.volumeGain}db">`;
    
    // Add contour for more natural intonation
    if (config.contour) {
      ssml += `<prosody contour="${config.contour}">`;
    }
    
    // Enhanced language-specific processing
    if (isHindi || isMixed) {
      // Hindi/Mixed language processing
      if (trimmedSentence.endsWith('?') || /क्या|कौन|कब|कहाँ|कैसे|what|who|when|where|how/i.test(trimmedSentence)) {
        ssml += `<prosody pitch="+3st" rate="90%" contour="(0%,+0st) (50%,+2st) (100%,+4st)">${sentence}</prosody>`;
      }
      else if (trimmedSentence.endsWith('!') || /वाह|अरे|हाय|wow|oh|great/i.test(trimmedSentence)) {
        ssml += `<emphasis level="strong"><prosody pitch="+2st">${sentence}</prosody></emphasis>`;
      }
      else if (/धन्यवाद|शुक्रिया|आभार|thank|thanks|grateful/i.test(trimmedSentence)) {
        ssml += `<prosody pitch="+1st" rate="85%" volume="+2db">${sentence}</prosody>`;
      }
      else {
        // Add natural variations for mixed/Hindi sentences
        const variation = index % 3;
        const contours = [
          '(0%,+0st) (25%,+1st) (75%,-1st) (100%,-2st)',
          '(0%,+0st) (50%,+0.5st) (100%,-1st)',
          '(0%,+0st) (30%,+1st) (70%,-0.5st) (100%,-1.5st)'
        ];
        ssml += `<prosody contour="${contours[variation]}">${sentence}</prosody>`;
      }
    } else {
      // Enhanced English processing
      if (trimmedSentence.endsWith('?')) {
        ssml += `<prosody pitch="high" rate="90%" contour="(0%,+0st) (80%,+2st) (100%,+4st)">${sentence}</prosody>`;
      }
      else if (trimmedSentence.endsWith('!')) {
        ssml += `<emphasis level="strong"><prosody pitch="+2st" rate="105%">${sentence}</prosody></emphasis>`;
      }
      else if (/hello|hi|hey|welcome/i.test(trimmedSentence)) {
        ssml += `<prosody pitch="+1st" rate="95%" volume="+1db">${sentence}</prosody>`;
      }
      else {
        // Add subtle natural variations
        ssml += sentence;
      }
    }
    
    // Close contour if opened
    if (config.contour) {
      ssml += '</prosody>';
    }
    
    ssml += '</prosody>';
    return ssml;
  });

  // Enhanced break timing based on language and emotion
  let breakTime = '250ms'; // Default faster breaks for conversation flow
  
  if (isHindi || isMixed) {
    breakTime = '300ms'; // Slightly longer for Hindi/mixed
  }
  
  if (emotion === 'excited' || emotion === 'urgent') {
    breakTime = '200ms'; // Shorter breaks for excitement/urgency
  } else if (emotion === 'professional' || emotion === 'concerned') {
    breakTime = '400ms'; // Longer breaks for professionalism/concern
  }

  return `<speak>
    ${processedSentences.join(`<break time="${breakTime}"/>`)}
  </speak>`;
};

// Enhanced Google Cloud Speech Services with ultra-fast optimizations
const enhancedGoogleSpeechService = {
  // Ultra-fast client initialization with connection pooling
  speechClient: null,
  ttsClient: null,
  
  getClient: async () => {
    if (!enhancedGoogleSpeechService.speechClient) {
      try {
        enhancedGoogleSpeechService.speechClient = new speech.SpeechClient({
          // Enhanced client configuration for faster performance
          grpc: {
            keepalive_time_ms: 30000,
            keepalive_timeout_ms: 5000,
            keepalive_permit_without_calls: true,
            http2_max_pings_without_data: 0,
            http2_min_time_between_pings_ms: 10000,
            http2_min_ping_interval_without_data_ms: 300000
          }
        });
        console.log('✅ Enhanced Google Speech client initialized with connection pooling');
      } catch (error) {
        console.error('❌ Error initializing Enhanced Google Speech client:', error);
        throw error;
      }
    }
    return enhancedGoogleSpeechService.speechClient;
  },

  getTTSClient: async () => {
    if (!enhancedGoogleSpeechService.ttsClient) {
      try {
        enhancedGoogleSpeechService.ttsClient = new textToSpeech.TextToSpeechClient({
          // Enhanced TTS client configuration
          grpc: {
            keepalive_time_ms: 30000,
            keepalive_timeout_ms: 3000,
            keepalive_permit_without_calls: true
          }
        });
        console.log('✅ Enhanced Google TTS client initialized');
      } catch (error) {
        console.error('❌ Error initializing Enhanced Google TTS client:', error);
        throw error;
      }
    }
    return enhancedGoogleSpeechService.ttsClient;
  },

  // Ultra-fast transcription with enhanced accuracy
  transcribe: async (audioBuffer, options = {}) => {
    const startTime = Date.now();
    
    try {
      console.log(`🎤 Starting ultra-fast transcription (${audioBuffer.length} bytes)`);
      const client = await enhancedGoogleSpeechService.getClient();
      
      // Enhanced request configuration for maximum accuracy and speed
      const request = {
        audio: {
          content: audioBuffer.toString('base64')
        },
        config: {
          encoding: options.encoding || 'MULAW',
          sampleRateHertz: options.sampleRateHertz || 8000,
          languageCode: options.languageCode || 'en-US',
          
          // Ultra-fast model optimizations
          model: ULTRA_FAST_CONFIG.preferredModel,
          useEnhanced: true,
          
          // Enhanced accuracy features
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: false, // Disable for speed
          enableWordConfidence: false,  // Disable for speed
          enableSpokenPunctuation: false,
          enableSpokenEmojis: false,
          
          // Noise handling for better accuracy
          audioChannelConfig: {
            audioChannelCount: 1,
            enableSeparateRecognitionPerChannel: false
          },
          
          // Enhanced language support
          alternativeLanguageCodes: options.alternativeLanguages || ['hi-IN'],
          
          // Profanity filter disabled for natural conversation
          profanityFilter: false,
          
          // Enhanced speech contexts for better accuracy
          speechContexts: [
            {
              phrases: [
                // Common conversation starters
                'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
                'thank you', 'thanks', 'please', 'sorry', 'excuse me',
                
                // Hindi common phrases
                'नमस्ते', 'धन्यवाद', 'कृपया', 'माफ़ करें', 'हाँ', 'नहीं',
                
                // Business terms
                'account', 'balance', 'payment', 'transfer', 'customer', 'service',
                'information', 'help', 'assistance', 'support'
              ],
              boost: 20.0 // High boost for common phrases
            }
          ],
          
          // Adaptation for better accuracy with specific vocabulary
          adaptation: {
            phraseSets: [
              {
                name: 'conversational_phrases',
                phrases: [
                  { value: 'customer service', boost: 15.0 },
                  { value: 'account balance', boost: 15.0 },
                  { value: 'payment information', boost: 15.0 },
                  { value: 'thank you very much', boost: 10.0 },
                  { value: 'how can I help', boost: 12.0 },
                  { value: 'what can I do', boost: 12.0 }
                ]
              }
            ]
          }
        }
      };
      
      // Perform ultra-fast recognition
      const [response] = await client.recognize(request);
      
      if (!response.results || response.results.length === 0) {
        console.log('⚠️ No transcription results returned');
        return '';
      }
      
      // Extract transcription with confidence filtering
      const results = response.results
        .filter(result => result.alternatives && result.alternatives.length > 0)
        .map(result => {
          const alternative = result.alternatives[0];
          const confidence = alternative.confidence || 0;
          
          // Only use results above minimum confidence threshold
          if (confidence >= ULTRA_FAST_CONFIG.minConfidence) {
            return alternative.transcript;
          }
          return null;
        })
        .filter(text => text !== null);
      
      const transcription = results.join(' ').trim();
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Ultra-fast transcription completed in ${processingTime}ms: "${transcription}"`);
      
      // Log performance metrics
      if (processingTime > 500) {
        console.warn(`⚠️ Transcription took ${processingTime}ms (target: <500ms)`);
      }
      
      return transcription;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Ultra-fast transcription failed after ${processingTime}ms:`, error);
      return '';
    }
  },

  // Enhanced streaming transcription for real-time conversation
  createStreamingRecognition: async (options = {}) => {
    try {
      const client = await enhancedGoogleSpeechService.getClient();
      
      const request = {
        config: {
          encoding: options.encoding || 'MULAW',
          sampleRateHertz: options.sampleRateHertz || 8000,
          languageCode: options.languageCode || 'en-US',
          model: 'latest_short',
          useEnhanced: true,
          enableAutomaticPunctuation: true,
          alternativeLanguageCodes: ['hi-IN'],
          profanityFilter: false,
          
          // Real-time optimizations
          enableWordTimeOffsets: false,
          enableWordConfidence: false,
          enableSpokenPunctuation: false,
          enableSpokenEmojis: false
        },
        interimResults: true,
        singleUtterance: false,
        
        // Enhanced streaming config for ultra-fast response
        streamingConfig: {
          enableVoiceActivityEvents: true,
          voiceActivityTimeout: {
            speechStartTimeout: { seconds: 2 },
            speechEndTimeout: { nanos: ULTRA_FAST_CONFIG.silenceThreshold * 1000000 } // 0.8s in nanoseconds
          }
        }
      };
      
      const recognizeStream = client.streamingRecognize(request);
      
      console.log('✅ Enhanced streaming recognition created with ultra-fast config');
      return recognizeStream;
      
    } catch (error) {
      console.error('❌ Error creating enhanced streaming recognition:', error);
      throw error;
    }
  },

  // Ultra-fast TTS with enhanced naturalness
  textToSpeech: async (text, audioStream, options = {}) => {
    const startTime = Date.now();
    
    try {
      // Validate stream
      if (!audioStream?.output || !audioStream?.id) {
        throw new Error('Invalid audio stream provided');
      }

      const currentStream = audioStreamService.getStream(audioStream.id);
      if (!currentStream || !currentStream.active) {
        console.error(`❌ Stream ${audioStream.id} is not active`);
        throw new Error(`Stream ${audioStream.id} is not active`);
      }

      console.log(`🎤 Starting ultra-fast TTS for: "${text.substring(0, 50)}..."`);

      // Initialize TTS client
      const client = await enhancedGoogleSpeechService.getTTSClient();
      
      // Enhanced emotion detection and SSML processing
      const detectedEmotion = options.emotion || detectEmotion(text);
      const ssml = processTextForSSML(text, detectedEmotion, options.language || 'en-US');
      
      console.log(`🎭 Detected emotion: ${detectedEmotion}`);
      
      // Set AI speaking state
      await audioStreamService.setAISpeaking(audioStream.id, true);
      
      // Ultra-fast synthesis configuration
      const request = {
        input: { ssml },
        voice: {
          languageCode: options.language || 'en-US',
          name: options.voice || null,
          ssmlGender: options.gender || 'FEMALE'
        },
        audioConfig: {
          audioEncoding: 'MULAW',
          sampleRateHertz: 8000,
          
          // Enhanced audio effects for crystal clear phone quality
          effectsProfileId: [
            'telephony-class-application',
            'headphone-class-device'
          ],
          
          // Optimized audio settings for maximum clarity and speed
          volumeGainDb: 18.0,  // Maximum volume for phone calls
          pitch: 1.0,          // Natural pitch
          speakingRate: 0.88,  // Slightly slower for perfect clarity
        },
      };

      console.log('🔄 Generating speech with enhanced quality settings...');
      const [response] = await client.synthesizeSpeech(request);
      
      if (!response?.audioContent) {
        throw new Error('No audio content received from Google TTS');
      }

      const synthesisTime = Date.now() - startTime;
      console.log(`✅ Speech synthesis completed in ${synthesisTime}ms`);

      // Ultra-fast audio streaming with optimized timing
      const audioBuffer = Buffer.from(response.audioContent);
      const CHUNK_SIZE = 320; // 20ms chunks for ultra-smooth playback
      const CHUNK_INTERVAL = 20; // 20ms intervals for real-time feel
      
      console.log(`📤 Starting ultra-fast audio transmission (${audioBuffer.length} bytes)`);
      
      // Send optimized silence packets for initialization
      const silentPacket = Buffer.alloc(CHUNK_SIZE, 127);
      for (let i = 0; i < 3; i++) { // Reduced from 10 to 3 for faster start
        if (currentStream.active && currentStream.output) {
          currentStream.output.push(silentPacket);
          await new Promise(resolve => setTimeout(resolve, CHUNK_INTERVAL));
        }
      }
      
      // Stream audio with ultra-precise timing
      let lastChunkTime = Date.now();
      for (let offset = 0; offset < audioBuffer.length; offset += CHUNK_SIZE) {
        const stream = audioStreamService.getStream(audioStream.id);
        if (!stream || !stream.active || !stream.aiSpeaking) {
          console.log('🛑 Stopping transmission - stream inactive or interrupted');
          break;
        }

        const now = Date.now();
        const timeSinceLastChunk = now - lastChunkTime;
        
        // Maintain precise timing
        if (timeSinceLastChunk < CHUNK_INTERVAL) {
          await new Promise(resolve => setTimeout(resolve, CHUNK_INTERVAL - timeSinceLastChunk));
        }

        const chunk = audioBuffer.slice(offset, offset + CHUNK_SIZE);
        
        // Pad chunk if necessary
        if (chunk.length < CHUNK_SIZE) {
          const paddedChunk = Buffer.alloc(CHUNK_SIZE, 127);
          chunk.copy(paddedChunk);
          stream.output.push(paddedChunk);
        } else {
          stream.output.push(chunk);
        }
        
        lastChunkTime = Date.now();
      }
      
      // Send final silence for clean ending
      for (let i = 0; i < 2; i++) {
        if (currentStream.active && currentStream.output) {
          currentStream.output.push(silentPacket);
          await new Promise(resolve => setTimeout(resolve, CHUNK_INTERVAL));
        }
      }
      
      await audioStreamService.setAISpeaking(audioStream.id, false);
      
      const totalTime = Date.now() - startTime;
      console.log(`✅ Ultra-fast TTS completed in ${totalTime}ms`);
      
      return true;
      
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`❌ Ultra-fast TTS failed after ${totalTime}ms:`, error);
      
      try {
        await audioStreamService.setAISpeaking(audioStream.id, false);
      } catch (stateError) {
        console.warn('⚠️ Error clearing AI speaking state:', stateError.message);
      }
      
      return false;
    }
  },

  // Enhanced transcription for audio files with ultra-fast processing
  transcribeAudio: async (audioBuffer, language = 'en-US', options = {}) => {
    return await enhancedGoogleSpeechService.transcribe(audioBuffer, {
      languageCode: language,
      encoding: options.encoding || 'MULAW',
      sampleRateHertz: options.sampleRateHertz || 8000,
      alternativeLanguages: language === 'en-US' ? ['hi-IN'] : ['en-US'],
      ...options
    });
  },

  // Configuration getter for external services
  getConfig: () => {
    return ULTRA_FAST_CONFIG;
  },

  // Performance metrics
  getPerformanceMetrics: () => {
    return {
      silenceThreshold: ULTRA_FAST_CONFIG.silenceThreshold,
      minChunkSize: ULTRA_FAST_CONFIG.minChunkSize,
      maxChunkSize: ULTRA_FAST_CONFIG.maxChunkSize,
      streamingChunkMs: ULTRA_FAST_CONFIG.streamingChunkMs,
      preferredModel: ULTRA_FAST_CONFIG.preferredModel
    };
  }
};

module.exports = enhancedGoogleSpeechService;
