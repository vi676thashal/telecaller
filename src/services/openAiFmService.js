const axios = require('axios');
const Setting = require('../models/Setting');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const { execFile } = require('child_process');
const util = require('util');

// OpenAI FM service for text-to-speech
const openAiFmService = {
  // Get available voices from OpenAI
  getAvailableVoices: async () => {
    try {
      // OpenAI TTS voices are fixed and don't need to be fetched from API
      return [
        { id: 'alloy', name: 'Alloy', description: 'Versatile, neutral voice', language: 'en-US' },
        { id: 'echo', name: 'Echo', description: 'Balanced male voice', language: 'en-US' },
        { id: 'fable', name: 'Fable', description: 'British accent, male voice', language: 'en-US' },
        { id: 'onyx', name: 'Onyx', description: 'Deep male voice', language: 'en-US' },
        { id: 'nova', name: 'Nova', description: 'Feminine emotive voice', language: 'en-US' },
        { id: 'shimmer', name: 'Shimmer', description: 'Warm feminine voice', language: 'en-US' }
      ];
    } catch (error) {
      console.error('Error getting OpenAI voices:', error.message);
      throw new Error(`Failed to get OpenAI voices: ${error.message}`);
    }
  },
  
  // Check API status and connectivity
  checkApiStatus: async () => {
    try {
      // Get settings first to ensure we have a valid API key
      let settings;
      
      try {
        settings = await openAiFmService.getSettings();
      } catch (settingsError) {
        console.warn('[OpenAI FM] Error getting settings:', settingsError.message);
        
        // Try to use environment variables as fallback
        const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_FALLBACK_API_KEY;
        if (apiKey) {
          console.log('[OpenAI FM] Using fallback API key from environment');
          settings = {
            apiKey,
            voiceId: process.env.OPENAI_FM_VOICE_ID || 'alloy',
            speechSpeed: 1.0
          };
        } else {
          return { 
            status: 'error', 
            message: 'Could not retrieve API key: ' + settingsError.message 
          };
        }
      }

      // Simple check - just verify we can get a valid API key
      if (!settings.apiKey || settings.apiKey.trim() === '') {
        return { 
          status: 'error', 
          message: 'API key not configured or invalid'
        };
      }

      // Try to make a small request to check API connectivity
      // Using the models endpoint which is lightweight
      try {
        const response = await axios.get('https://api.openai.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${settings.apiKey}`
          },
          timeout: 20000 // 5-second timeout
        });

        return { 
          status: 'available', 
          models: response.data.data.length,
          message: 'API connection successful'
        };
      } catch (apiError) {
        // If we get a 401 error, the API key is invalid
        if (apiError.response && apiError.response.status === 401) {
          return {
            status: 'error',
            message: 'Invalid API key'
          };
        }
        
        // For other API errors, report details
        return {
          status: 'error',
          message: apiError.message,
          details: apiError.response?.data?.error?.message || 'Unknown API error'
        };
      }
    } catch (error) {
      console.error('OpenAI FM API status check failed:', error.message);
      return {
        status: 'error',
        message: error.message
      };
    }
  },
  // Initialize OpenAI FM client with settings from environment or database
  getSettings: async () => {
    try {
      let apiKey = process.env.OPENAI_API_KEY;
      let voiceId = process.env.OPENAI_FM_VOICE_ID || 'alloy'; // Default voice
      let speechSpeed = 1.0;

      // If we have environment variables, use them directly
      if (apiKey) {
        console.log('[OpenAI FM] Using API key from environment variables');
        return {
          apiKey,
          voiceId,
          speechSpeed
        };
      }

      // Try to get from database with timeout handling
      try {
        if (!apiKey) {
          // Set a timeout for database query
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database query timed out')), 5000)
          );
          
          // Race the database query against the timeout
          const apiKeySetting = await Promise.race([
            Setting.findOne({ key: 'openaiApiKey' }),
            timeoutPromise
          ]);
          
          if (apiKeySetting) {
            apiKey = apiKeySetting.value;
            console.log('[OpenAI FM] Using API key from database');
          }
        }

        const voiceIdPromise = Promise.race([
          Setting.findOne({ key: 'openaiVoiceId' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);

        const speedPromise = Promise.race([
          Setting.findOne({ key: 'openaiSpeechSpeed' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);

        const [voiceIdSetting, speechSpeedSetting] = await Promise.allSettled([voiceIdPromise, speedPromise]);
        
        if (voiceIdSetting.status === 'fulfilled' && voiceIdSetting.value) {
          voiceId = voiceIdSetting.value.value;
        }

        if (speechSpeedSetting.status === 'fulfilled' && speechSpeedSetting.value) {
          speechSpeed = parseFloat(speechSpeedSetting.value.value);
        }
      } catch (dbError) {
        console.warn('[OpenAI FM] Database query failed, using defaults:', dbError.message);
        // Continue with defaults or environment variables
      }
      
      // Fallback to demo/test key if still no API key
      if (!apiKey) {
        console.warn('[OpenAI FM] No API key found in env or DB, checking for fallback key');
        apiKey = process.env.OPENAI_FALLBACK_API_KEY;
      }
      
      // Final check for API key
      if (!apiKey) {
        throw new Error('OpenAI API key not found in environment variables or settings');
      }
      
      return {
        apiKey,
        voiceId,
        speechSpeed
      };
    } catch (error) {
      console.error('Error getting OpenAI FM settings:', error);
      throw error;
    }
  },  // Generate speech from text with language and emotional context support
  generateSpeech: async (text, language = 'en-US', voiceId = null, emotionalContext = 'neutral') => {
    try {
      // Get settings with error handling
      let settings;
      try {
        settings = await openAiFmService.getSettings();
      } catch (settingsError) {
        console.warn('[OpenAI FM] Error getting settings for speech generation:', settingsError.message);
        
        // Use environment variables as fallback
        const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_FALLBACK_API_KEY;
        if (!apiKey) {
          throw new Error('No OpenAI API key available for speech generation');
        }
        
        settings = {
          apiKey,
          voiceId: process.env.OPENAI_FM_VOICE_ID || 'alloy',
          speechSpeed: 1.0
        };
        console.log('[OpenAI FM] Using fallback settings for speech generation');
      }
      
      // OpenAI API endpoint
      const url = 'https://api.openai.com/v1/audio/speech';
      
      // Select the optimal voice based on parameters
      let selectedVoiceId;
      
      // If a specific voiceId is provided, use it (highest priority)
      if (voiceId) {
        selectedVoiceId = voiceId;
        console.log(`[OpenAI FM] Using provided voiceId: ${selectedVoiceId}`);
      } else {
        // Use settings voiceId or emotional context mapping
        selectedVoiceId = settings.voiceId; // Default from settings
        
        // Map emotional contexts to appropriate voices (only if no specific voiceId provided)
        const emotionalVoiceMap = {
          'warm': 'nova', // Warm, friendly tone
          'cheerful': 'shimmer', // Light, upbeat tone
          'authoritative': 'onyx', // Deep, confident tone
          'neutral': 'alloy', // Balanced, versatile tone
          'empathetic': 'echo', // Soft, caring tone
          'storytelling': 'fable', // Expressive, engaging tone
        };
        
        // If we have a specific emotional context, use the corresponding voice
        if (emotionalVoiceMap[emotionalContext]) {
          selectedVoiceId = emotionalVoiceMap[emotionalContext];
        }
        
        console.log(`[OpenAI FM] Using voice based on emotional context "${emotionalContext}": ${selectedVoiceId}`);
      }
      
      // Adjust speech speed based on language and context
      let speechSpeed = settings.speechSpeed;
      if (language.startsWith('hi') || language === 'mixed') {
        // Slightly slower for Hindi/Hinglish to improve clarity
        speechSpeed = speechSpeed * 0.92;
      }
      
      // Optimize voice selection for Hindi-English-Mix
      if (language === 'mixed' || language === 'hinglish') {
        // For Hinglish, prefer voices that handle mixed language well
        const hinglishVoiceMap = {
          'nova': 'nova',     // Good for Indian accent and mixed language
          'alloy': 'alloy',   // Neutral, works well for mixed content
          'echo': 'echo',     // Clear pronunciation for technical terms
          'onyx': 'onyx',     // Professional tone for business conversations
          'shimmer': 'shimmer' // Friendly tone for sales conversations
        };
        
        // If the selected voice is good for Hinglish, use it; otherwise default to Nova
        if (!hinglishVoiceMap[selectedVoiceId]) {
          selectedVoiceId = 'nova'; // Nova works best for Indian English and mixed language
          console.log(`[OpenAI FM] Using Nova voice for Hindi-English-Mix content`);
        }
      }
        // Add natural pauses and emphasis by inserting SSML-like markers
      // OpenAI doesn't support full SSML but we can add strategic pauses with punctuation
      let processedText = text || '';
      
      // Safety check for empty text
      if (!processedText || processedText.length === 0) {
        throw new Error('Text cannot be empty for TTS generation');
      }
      
      // For Hindi-English-Mix, add natural pauses at language switches
      if (language === 'mixed' || language === 'hinglish') {
        // Add slight pauses where language typically switches in Hinglish
        processedText = processedText.replace(/(\bhhai\b|\bhai\b|\bke\b|\bka\b|\bki\b|\bmein\b|\bse\b|\bko\b|\baur\b)\s+([A-Z][a-z]+)/g, '$1, $2');
        processedText = processedText.replace(/([a-z]+)\s+(\bke\b|\bka\b|\bki\b|\bmein\b|\bse\b|\bko\b|\baur\b|\bhhai\b|\bhai\b)/g, '$1, $2');
      }
      
      // Add breathing pauses at appropriate points
      processedText = processedText.replace(/([.!?])\s+/g, '$1 ... ');
        // Optimize for the specific emotional context
      if (emotionalContext === 'warm' || emotionalContext === 'empathetic') {
        // Add more pauses for empathetic speech
        processedText = processedText.replace(/,/g, ', ');
      }
      
      // Request body with optimized settings for clarity and minimal artifacts
      const data = {
        model: "tts-1", // Use standard model for better consistency with μ-law conversion
        input: processedText,
        voice: selectedVoiceId,
        response_format: "mp3",
        speed: Math.max(0.8, Math.min(1.2, speechSpeed)) // Clamp speed to prevent artifacts
      };
      
      // Log the TTS request for debugging
      console.log(`[OpenAI FM] Generating speech: language=${language}, emotion=${emotionalContext}, voice=${selectedVoiceId}`);
      
      // Request headers
      const headers = {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      };
      
      // Make request with extended timeout settings
      const response = await axios.post(url, data, {
        headers,
        responseType: 'arraybuffer',
        timeout: 5000, // OPTIMIZED: Reduced from 20s to 5s for faster response
      });
      
      return response.data;
    } catch (error) {
      console.error('Error generating OpenAI FM speech:', error);
      throw error;
    }
  },
  
  // Test connection to OpenAI API
  testConnection: async () => {
    try {
      const settings = await openAiFmService.getSettings();
      
      // Request headers
      const headers = {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      };
        // Simple test request to check API key validity
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers,
        timeout: 5000 // OPTIMIZED: Reduced from 20s to 5s for faster response
      });
      
      return {
        success: true,
        message: 'Successfully connected to OpenAI API'
      };
    } catch (error) {
      console.error('Error testing OpenAI connection:', error);
      return {
        success: false,
        message: error.response?.data?.error?.message || 'Failed to connect to OpenAI API'
      };
    }
  },
  
  // Identify language from text
  identifyLanguage: async (text) => {
    try {
      // First try detecting using basic patterns for speed
      const hindiPattern = /[\u0900-\u097F]/; // Hindi Unicode range
      if (hindiPattern.test(text)) {
        return 'hi-IN';
      }
      
      // If no clear pattern is detected, use more sophisticated analysis
      const settings = await openAiFmService.getSettings();
      
      const headers = {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      };
      
      // Use GPT to detect language
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4-1106-preview',
        messages: [
          {
            role: 'system',
            content: 'You are a language detection system. Respond with only the language code: "en-US" for English, "hi-IN" for Hindi, or "mixed" for mixed Hindi-English.'
          },
          {
            role: 'user',
            content: `Detect the language of this text: "${text.substring(0, 100)}"`
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      }, { headers });
      
      const detectedLanguage = response.data.choices[0].message.content.trim().toLowerCase();
      
      if (detectedLanguage.includes('hi') || detectedLanguage.includes('hindi')) {
        return 'hi-IN';
      } else if (detectedLanguage.includes('mix')) {
        return 'mixed';
      } else {
        return 'en-US';
      }
    } catch (error) {
      console.error('Error identifying language:', error);
      // Default to English on error
      return 'en-US';
    }
  },
  
  // Detect emotion and context from text
  detectEmotion: async (text) => {
    try {
      // First try basic keyword matching for speed
      const emotionKeywords = {
        warm: ['thank', 'appreciate', 'grateful', 'help', 'support'],
        cheerful: ['great', 'happy', 'exciting', 'wonderful', 'fantastic', 'awesome'],
        authoritative: ['must', 'should', 'important', 'require', 'necessary'],
        empathetic: ['sorry', 'understand', 'difficult', 'challenge', 'worry', 'concern'],
        storytelling: ['happened', 'once', 'story', 'experience', 'remember', 'recall'],
      };
      
      // Convert text to lowercase for matching
      const lowerText = text.toLowerCase();
      
      // Check for emotional keywords
      for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
        for (const keyword of keywords) {
          if (lowerText.includes(keyword)) {
            return emotion;
          }
        }
      }
      
      // For more nuanced cases, use OpenAI API
      const settings = await openAiFmService.getSettings();
      
      const headers = {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      };
      
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4-1106-preview',
        messages: [
          {
            role: 'system',
            content: 'You are an emotion detection system. Based on the text, respond with only one emotional tone that would be appropriate for responding: "warm", "cheerful", "authoritative", "neutral", "empathetic", or "storytelling".'
          },
          {
            role: 'user',
            content: `Detect appropriate emotional tone for responding to this text: "${text.substring(0, 100)}"`
          }
        ],
        temperature: 0.3,
        max_tokens: 10
      }, { headers });
      
      const detectedEmotion = response.data.choices[0].message.content.trim().toLowerCase();
      
      // Map to one of our supported emotions
      if (detectedEmotion.includes('warm') || detectedEmotion.includes('friendly')) {
        return 'warm';
      } else if (detectedEmotion.includes('cheer') || detectedEmotion.includes('happy')) {
        return 'cheerful';
      } else if (detectedEmotion.includes('author') || detectedEmotion.includes('formal')) {
        return 'authoritative';
      } else if (detectedEmotion.includes('empath') || detectedEmotion.includes('caring')) {
        return 'empathetic';
      } else if (detectedEmotion.includes('story') || detectedEmotion.includes('narrat')) {
        return 'storytelling';
      } else {
        return 'neutral';
      }
    } catch (error) {
      console.error('Error detecting emotion:', error);
      // Default to neutral on error
      return 'neutral';
    }
  },
  
  // Process text with appropriate language model for generating a natural response
  processTextWithGPT: async (text, language = 'en-US', contextData = {}) => {
    try {
      const settings = await openAiFmService.getSettings();
      
      const headers = {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      };
      
      // Prepare system prompt based on language and context
      let systemPrompt = 'You are a helpful, conversational AI assistant.';
      
      if (language === 'hi-IN') {
        systemPrompt += ' Respond in Hindi using respectful language.';
      } else if (language === 'mixed') {
        systemPrompt += ' Respond in the same mix of Hindi and English as the user query.';
      } else {
        systemPrompt += ' Respond in clear, natural English.';
      }
      
      // Add emotion guidance to the prompt
      const emotion = await openAiFmService.detectEmotion(text);
      switch (emotion) {
        case 'warm':
          systemPrompt += ' Use a warm, friendly tone showing appreciation.';
          break;
        case 'cheerful':
          systemPrompt += ' Use an upbeat, positive tone with enthusiasm.';
          break;
        case 'authoritative':
          systemPrompt += ' Use a confident, clear tone that conveys expertise.';
          break;
        case 'empathetic':
          systemPrompt += ' Use a gentle, understanding tone that acknowledges feelings.';
          break;
        case 'storytelling':
          systemPrompt += ' Use an engaging, narrative style with rich descriptions.';
          break;
        default:
          systemPrompt += ' Use a balanced, neutral tone.';
      }
      
      // Add real-time contextual information
      if (contextData.callHistory && contextData.callHistory.length > 0) {
        systemPrompt += ' Reference relevant points from previous exchanges in this conversation.';
      }
      
      // Keep responses brief for better real-time interaction
      systemPrompt += ' Keep responses concise (1-3 sentences) for natural conversation flow.';
      
      // Create the conversation history for context
      const messages = [
        { role: 'system', content: systemPrompt }
      ];
      
      // Add conversation history if available
      if (contextData.callHistory && contextData.callHistory.length > 0) {
        for (const exchange of contextData.callHistory) {
          messages.push({ role: 'user', content: exchange.customerText });
          messages.push({ role: 'assistant', content: exchange.aiResponse });
        }
      }
      
      // Add current user message
      messages.push({ role: 'user', content: text });
      
      // Send to OpenAI API
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.7,
        max_tokens: 150
      }, { headers });
      
      return {
        text: response.data.choices[0].message.content,
        language: language,
        emotion: emotion
      };
    } catch (error) {
      console.error('Error processing text with GPT:', error);
      throw error;
    }
  },
  
  /**
   * Transcribe audio using OpenAI Whisper API
   * @param {string} audioFilePath - Path to audio file
   * @param {string} language - Language hint (optional)
   * @returns {Promise<Object>} Transcription result with text and detected language
   */
  transcribeAudio: async (audioFilePath, language = null) => {
    try {
      const settings = await openAiFmService.getSettings();
      
      // Make sure the file exists
      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }
      
      // Convert audio to proper format for Whisper API if needed
      const convertedFilePath = await openAiFmService.ensureProperAudioFormat(audioFilePath);
      
      // Create form data with the audio file
      const formData = new FormData();
      formData.append('file', fs.createReadStream(convertedFilePath));
      formData.append('model', 'whisper-1');
      
      // Add language hint if provided
      if (language) {
        formData.append('language', language);
      }
      
      // Request options
      const config = {
        headers: {
          'Authorization': `Bearer ${settings.apiKey}`,
          ...formData.getHeaders()
        },
        timeout: 20000 // 30 second timeout for larger audio files
      };
      
      // Make the API call
      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        config
      );
      
      // Clean up temporary converted file if different from original
      if (convertedFilePath !== audioFilePath && fs.existsSync(convertedFilePath)) {
        fs.unlinkSync(convertedFilePath);
      }
      
      // Extract detected language from response
      const detectedLanguage = response.data.language || 
        (response.data.text.match(/[\u0900-\u097F]/) ? 'hi-IN' : 'en-US');
      
      return {
        text: response.data.text,
        language: detectedLanguage
      };
    } catch (error) {
      console.error(`Error transcribing audio: ${error.message}`);
      
      // Return empty result on error
      return {
        text: '',
        language: 'en-US'
      };
    }
  },
  
  /**
   * Detect language from audio file
   * @param {string} audioFilePath - Path to audio file
   * @returns {Promise<Object>} Detection result with language and confidence
   */
  detectLanguageFromAudio: async (audioFilePath) => {
    try {
      // Use Whisper transcription to detect language
      const result = await openAiFmService.transcribeAudio(audioFilePath);
      
      // If no text was transcribed, default to English with low confidence
      if (!result.text.trim()) {
        return {
          language: 'en-US',
          confidence: 0.5
        };
      }
      
      // If text was transcribed, analyze it to confirm language
      // For more accurate detection, we can also use the language detected by Whisper
      
      // Check for Hindi characters
      const hindiPattern = /[\u0900-\u097F]/;
      const hasHindi = hindiPattern.test(result.text);
      
      // Check for mixed language
      const englishPattern = /[A-Za-z]{2,}/;
      const hasEnglish = englishPattern.test(result.text);
      
      if (hasHindi && hasEnglish) {
        return {
          language: 'mixed',
          confidence: 0.8
        };
      } else if (hasHindi) {
        return {
          language: 'hi-IN',
          confidence: 0.9
        };
      } else {
        return {
          language: 'en-US',
          confidence: 0.9
        };
      }
    } catch (error) {
      console.error(`Error detecting language from audio: ${error.message}`);
      
      // Default to English on error
      return {
        language: 'en-US',
        confidence: 0.5
      };
    }
  },
  
  /**
   * Ensure audio file is in a format acceptable by Whisper API
   * @param {string} audioFilePath - Path to input audio file
   * @returns {Promise<string>} Path to properly formatted audio file
   */
  ensureProperAudioFormat: async (audioFilePath) => {
    try {
      // Check file extension
      const ext = path.extname(audioFilePath).toLowerCase();
      
      // If already in an acceptable format (mp3, mp4, mpeg, mpga, m4a, wav, webm), return as is
      if (['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'].includes(ext)) {
        return audioFilePath;
      }
      
      console.log(`Converting audio file ${audioFilePath} to WAV format`);
      
      // Create output path
      const outputPath = `${audioFilePath.substring(0, audioFilePath.lastIndexOf('.'))}_converted.wav`;
      
      // Get ffmpeg path
      const ffmpegPath = path.join(__dirname, '../../tools/ffmpeg/bin/ffmpeg.exe');
      
      // Use ffmpeg to convert the file
      const execFilePromise = util.promisify(execFile);
      await execFilePromise(ffmpegPath, [
        '-i', audioFilePath,
        '-ar', '16000', // 16kHz sample rate
        '-ac', '1',     // Mono
        '-c:a', 'pcm_s16le', // 16-bit PCM
        '-y',           // Overwrite output
        outputPath
      ]);
      
      return outputPath;
    } catch (error) {
      console.error(`Error converting audio format: ${error.message}`);
      return audioFilePath; // Return original on error
    }
  },

  // Create streaming synthesis for real-time audio generation
  createStreamingSynthesis: async (text, options = {}) => {
    try {
      const {
        language = 'en-US',
        emotion = 'neutral',
        streaming = true,
        voice = null
      } = options;
      
      console.log(`[OpenAI FM] Creating streaming synthesis for: "${text.substring(0, 50)}..."`);
      
      // Get settings
      const settings = await openAiFmService.getSettings();
      
      // Select voice based on emotion and language
      let voiceId = voice || settings.voiceId;
      
      const emotionalVoiceMap = {
        'warm': 'nova',
        'cheerful': 'shimmer', 
        'authoritative': 'onyx',
        'neutral': 'alloy',
        'empathetic': 'echo',
        'storytelling': 'fable'
      };
      
      if (emotionalVoiceMap[emotion]) {
        voiceId = emotionalVoiceMap[emotion];
      }
      
      // Prepare request data
      const data = {
        model: "tts-1", // Use standard model for faster streaming
        input: text,
        voice: voiceId,
        response_format: "mp3",
        speed: language.startsWith('hi') ? 0.95 : 1.0
      };
      
      const headers = {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      };
      
      // Create streaming request
      const response = await axios({
        method: 'post',
        url: 'https://api.openai.com/v1/audio/speech',
        data,
        headers,
        responseType: 'stream',
        timeout: 20000
      });
      
      // Return the stream directly for real-time processing
      return response.data;
      
    } catch (error) {
      console.error('[OpenAI FM] Streaming synthesis error:', error);
      throw error;
    }  },
  // Generate streaming audio for real-time communication (interface method)
  generateStreamingAudio: async (text, language = 'en-US', options = {}) => {
    try {
      console.log(`[OpenAI FM] Generating streaming audio for: "${text.substring(0, 50)}..."`);
      
      // Use the existing streaming method (fixed to call createStreamingSynthesis)
      return await openAiFmService.createStreamingSynthesis(text, {
        language,
        streaming: true,
        ...options
      });
    } catch (error) {
      console.error('[OpenAI FM] Streaming audio generation error:', error.message);
      throw new Error(`OpenAI FM streaming failed: ${error.message}`);
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
        voice = 'alloy',
        language = 'en-US', 
        emotion = 'neutral',
        streaming = true
      } = options;
      
      console.log(`[OpenAI FM] Starting stream synthesis with voice: ${voice}`);
      
      // Get settings
      const settings = await openAiFmService.getSettings();
      
      // OpenAI API endpoint
      const url = 'https://api.openai.com/v1/audio/speech';
      
      // Request body optimized for streaming
      const data = {
        model: "tts-1", // Use faster model for real-time streaming
        input: text,
        voice: voice,
        response_format: "mp3", // MP3 for compatibility with existing pipeline
        speed: settings.speechSpeed || 1.0
      };
      
      // Request headers
      const headers = {
        'Authorization': `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json'
      };
      
      // Make streaming request
      const response = await axios.post(url, data, {
        headers,
        responseType: 'stream', // Important for streaming
        timeout: 10000 // Shorter timeout for real-time
      });
      
      console.log(`[OpenAI FM] Stream synthesis started successfully for voice: ${voice}`);
      return response.data; // Return the stream directly
      
    } catch (error) {
      console.error('[OpenAI FM] Stream synthesis error:', error);
      throw new Error(`OpenAI FM stream synthesis failed: ${error.message}`);
    }
  },
};

module.exports = openAiFmService;
