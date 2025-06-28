const elevenlabsService = require('./simpleElevenlabsService'); // Use simple service to bypass MongoDB
const openAiFmService = require('./openAiFmService');
// Removed voiceCloneService import as it's no longer needed
const rimeTtsService = require('./simpleRimeTtsService'); // Add Rime TTS service
const enhancedTTSFallbackService = require('./enhancedTTSFallbackService'); // CRITICAL FIX
const ultraFastResponseOptimizer = require('./ultraFastResponseOptimizer'); // CRITICAL FIX for telecaller behavior
const { logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');
// Removed torchInstall reference as it's no longer needed

// Create a built-in fallback mechanism for when all providers fail
const fallbackAudio = {
  // Map of common phrases to pre-generated audio buffers
  phrases: {},
  
  // Initialize with some built-in audio
  init: () => {
    // Create the directories we need
    const audioDir = path.join(__dirname, '../storage/audio');
    const fallbackDir = path.join(__dirname, '../storage/fallback');
    
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
      
      // Create a simple silent MP3 as absolute fallback
      const silentMp3Header = Buffer.from([
        0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ID3v2 header
        0xff, 0xfb, 0x90, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // MP3 frame header
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00  // Minimal data
      ]);
      
      fs.writeFileSync(path.join(fallbackDir, 'silence.mp3'), silentMp3Header);
    }
  }
};

// Initialize fallback mechanism
fallbackAudio.init();

// PyTorch check removed as it's no longer needed
(async () => {
  try {
    // Log that PyTorch is not being checked
    logger.info('PyTorch check skipped - not required for basic operation');
  } catch (err) {
    logger.error(`Error in startup: ${err.message}`);
  }
})();

// Main voice provider service object
const voiceProviderService = {
  // Enhanced emergency audio generator - CRITICAL FIX
  generateEmergencyAudio: (text = 'I apologize for the technical difficulty. Please hold on.', callId = null) => {
    // CRITICAL FIX: Ensure emergency messages follow telecaller script
    // Replace assistant-like phrases with telecaller-appropriate phrasing
    const defaultEmergencyMessages = {
      default: "There seems to be a temporary issue processing your request. Let me continue with the credit card application. Where were we?",
      greeting: "Welcome to our credit card application service. I'm having a temporary issue, but I'll be with you shortly to discuss our card benefits.",
      language_check: "I apologize for the delay. Let's continue our credit card discussion. Which language would you prefer for our conversation?",
      benefits: "There's a brief technical issue, but I'd like to continue telling you about our exclusive credit card benefits shortly.",
      collect_name: "Thank you for your interest in our credit card. To continue your application, I'll need your full name. Could you please share it?",
      closing: "Thank you for your interest in our credit card services. Is there anything else about our credit card offerings I can help with?"
    };
    
    // Apply telecaller workflow if callId is provided
    if (callId) {
      try {
        // Get appropriate telecaller message
        text = ultraFastResponseOptimizer.enforceStrictTelecallerResponse(text, callId) || 
               defaultEmergencyMessages.default;
      } catch (err) {
        logger.error(`Error applying telecaller workflow to emergency audio: ${err.message}`);
        // Fall back to appropriate telecaller message
        text = defaultEmergencyMessages.default;
      }
    }
    
    // Create a proper MP3 with adequate size for Twilio
    const frames = [];
    
    // ID3v2 header
    frames.push(Buffer.from([
      0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]));
    
    // Calculate target size (minimum 15KB for Twilio reliability)
    const targetSize = 15 * 1024;
    const frameSize = 320;
    const frameCount = Math.ceil(targetSize / frameSize);
    
    for (let i = 0; i < frameCount; i++) {
      const frame = Buffer.alloc(frameSize);
      
      // MP3 frame header
      frame[0] = 0xff; frame[1] = 0xfb; frame[2] = 0x90; frame[3] = 0x44;
      
      // Add variation to prevent detection as invalid
      for (let j = 4; j < frameSize; j++) {
        frame[j] = (i + j) % 256;
      }
      
      frames.push(frame);
    }
    
    const audioBuffer = Buffer.concat(frames);
    logger.info(`Generated enhanced emergency audio: ${audioBuffer.length} bytes`);
    return audioBuffer;
  },
  
  // Route to the appropriate voice service based on provider name
  generateSpeech: async (text, options = {}, language = 'en-US') => {
    try {
      // CRITICAL FIX: Enforce strict telecaller workflow before generating speech
      // This ensures the response follows the proper workflow and never sounds like a generic assistant
      if (typeof options === 'object' && options !== null && options.callId) {
        // Extract callId and stepType if available
        const callId = options.callId;
        const stepType = options.stepType || null;
        
        // Apply strict telecaller workflow enforcement
        logger.info(`🔒 Enforcing strict telecaller workflow for call ${callId} before TTS generation`);
        text = ultraFastResponseOptimizer.enforceStrictTelecallerResponse(text, callId, stepType);
      }
      
      // Handle both old parameter format and new options format
      let voiceProvider, forceProvider, actualLanguage, voiceId;
      
      if (typeof options === 'string') {
        // Old format: generateSpeech(text, provider, language)
        voiceProvider = options;
        forceProvider = false;
        actualLanguage = language;
        voiceId = null;
      } else if (typeof options === 'object' && options !== null) {
        // New format: generateSpeech(text, { provider, forceProvider, language, voiceId })
        voiceProvider = options.provider || 'elevenlabs';
        forceProvider = options.forceProvider || false;
        actualLanguage = options.language || language;
        voiceId = options.voiceId || null; // Extract voice ID
      } else {
        // Fallback
        voiceProvider = 'elevenlabs';
        forceProvider = false;
        actualLanguage = language;
        voiceId = null;
      }
        logger.info(`Generating speech with provider: ${voiceProvider}, voiceId: ${voiceId}, forceProvider: ${forceProvider}`);
      
      // Enhanced timeout configuration per provider - CRITICAL FIX
      const timeoutMs = enhancedTTSFallbackService.getTimeout(voiceProvider);
      const startTime = Date.now();
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Speech generation timed out after ${timeoutMs}ms`)), timeoutMs)
      );
      
      let result;
        switch (voiceProvider) {
        case 'openai_fm':
        case 'chatgpt_tts': // Map chatgpt_tts to openai_fm
          result = await Promise.race([
            openAiFmService.generateSpeech(text, actualLanguage, voiceId),
            timeoutPromise
          ]);
          return result;
        
        // Removed clone_voice case as it's no longer needed
            case 'elevenlabs':
          result = await Promise.race([
            elevenlabsService.generateSpeech(text, voiceId, { language: actualLanguage }),
            timeoutPromise
          ]);
          return result;
          case 'rime':
        case 'rime_tts': // Add support for rime_tts mapping
          result = await Promise.race([
            rimeTtsService.generateSpeech(text, actualLanguage, { voiceId: voiceId }),
            timeoutPromise
          ]);
          return result;
          default: 
          // Default to ElevenLabs if provider not specified or not recognized
          logger.warn(`Unrecognized voice provider: ${voiceProvider}. Defaulting to ElevenLabs.`);
          result = await Promise.race([
            elevenlabsService.generateSpeech(text, voiceId, { language: actualLanguage }),
            timeoutPromise
          ]);      }
      
      // Track successful generation
      const duration = Date.now() - startTime;
      enhancedTTSFallbackService.updateStats(voiceProvider, true, duration);
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Error in voice provider service: ${error.message}`);
      
      // Track failure
      enhancedTTSFallbackService.updateStats(voiceProvider, false, duration);
      
      // If forceProvider is true, don't use fallbacks - respect user's choice
      if (typeof forceProvider !== 'undefined' && forceProvider) {
        logger.warn(`Provider ${voiceProvider} failed and forceProvider is true. Not using fallbacks.`);
        throw new Error(`Voice provider ${voiceProvider} failed and fallbacks are disabled: ${error.message}`);
      }
      
      // Enhanced error handling with smart fallback selection
      const fallbackResult = await enhancedTTSFallbackService.handleTTSError(error, voiceProvider, text, options);
      
      if (fallbackResult.shouldRetry && fallbackResult.nextProvider) {
        logger.info(`Trying fallback provider: ${fallbackResult.nextProvider}`);
        
        try {
          const fallbackTimeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Fallback speech generation timed out`)), fallbackResult.timeout)
          );
            let fallbackAudioResult;
          switch (fallbackResult.nextProvider) {
            case 'openai_fm':
            case 'chatgpt_tts':
              fallbackAudioResult = await Promise.race([
                openAiFmService.generateSpeech(text, actualLanguage, voiceId),
                fallbackTimeoutPromise
              ]);
              break;
            case 'elevenlabs':
              fallbackAudioResult = await Promise.race([
                elevenlabsService.generateSpeech(text, actualLanguage, voiceId),
                fallbackTimeoutPromise
              ]);
              break;
            case 'rime':
            case 'rime_tts':
              fallbackAudioResult = await Promise.race([
                rimeTtsService.generateSpeech(text, actualLanguage, { voiceId: voiceId }),
                fallbackTimeoutPromise
              ]);
              break;
          }
          
          const fallbackDuration = Date.now() - startTime;
          enhancedTTSFallbackService.updateStats(fallbackResult.nextProvider, true, fallbackDuration);
          logger.info(`Successfully generated audio with fallback provider: ${fallbackResult.nextProvider}`);
          
          return fallbackAudioResult;
          
        } catch (fallbackError) {
          logger.error(`Fallback provider ${fallbackResult.nextProvider} also failed: ${fallbackError.message}`);
          enhancedTTSFallbackService.updateStats(fallbackResult.nextProvider, false, Date.now() - startTime);
        }
      }
      
      // All providers failed, use enhanced fallback audio
      logger.warn(`All voice providers failed, using enhanced fallback audio`);
      return fallbackResult.fallbackAudio || enhancedTTSFallbackService.getFallbackAudio();
    }
  },
  
  // Generate a publicly accessible audio URL for Twilio to play
  generateTwilioAudioUrl: async (text, options = {}, language, callId) => {
    try {
      // Handle both old parameter format and new options format for backward compatibility
      const voiceProvider = typeof options === 'string' ? options : (options.provider || 'elevenlabs');
      const forceProvider = typeof options === 'object' ? (options.forceProvider || false) : false;
      const actualLanguage = typeof options === 'string' ? language : (options.language || language || 'en-US');
      const actualCallId = typeof options === 'string' ? callId : (options.callId || callId);
      const voiceId = typeof options === 'object' ? options.voiceId : null; // Extract voice ID
      
      logger.info(`Generating Twilio audio URL with provider: ${voiceProvider}, voiceId: ${voiceId}, forceProvider: ${forceProvider} for call ${actualCallId}`);
      
      // Make sure storage directory structure exists
      const fs = require('fs');
      const path = require('path');
      const storageDir = path.join(__dirname, '../storage');
      const audioDir = path.join(__dirname, '../storage/audio');
      const fallbackDir = path.join(__dirname, '../storage/fallback');
      
      // Create storage and audio directories if they don't exist
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
        logger.info(`Created storage directory: ${storageDir}`);
      }
      
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
        logger.info(`Created audio directory: ${audioDir}`);
      }

      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
        logger.info(`Created fallback directory: ${fallbackDir}`);
        
        // Create fallback MP3 files of various sizes to ensure Twilio compatibility
        const createFallbackFile = (name, size) => {
          const frames = [Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])]; // ID3v2 header
          const frameCount = Math.max(Math.floor(size / 20), 500); // Ensure at least 10KB
          
          for (let i = 0; i < frameCount; i++) {
            frames.push(Buffer.from([
              0xff, 0xfb, 0x90, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
              0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
            ]));
          }
          
          const buffer = Buffer.concat(frames);
          fs.writeFileSync(path.join(fallbackDir, name), buffer);
          logger.info(`Created fallback file: ${name} (${buffer.length} bytes)`);
          return buffer;
        };
        
        // Create fallback files of different sizes (small, medium, large)
        createFallbackFile('silence.mp3', 10 * 1024); // 10KB
        createFallbackFile('silence_small.mp3', 15 * 1024); // 15KB
        createFallbackFile('silence_medium.mp3', 30 * 1024); // 30KB
        createFallbackFile('silence_large.mp3', 50 * 1024); // 50KB
      }
        
      // Try to generate audio with the selected provider
      let audioBuffer;
      try {        audioBuffer = await voiceProviderService.generateSpeech(text, {
          provider: voiceProvider,
          language: actualLanguage,
          forceProvider: forceProvider,
          voiceId: voiceId // Pass voice ID to speech generation
        });
        
        // Verify the audio buffer size - must be at least 10KB for Twilio
        if (!audioBuffer || audioBuffer.length < 10 * 1024) {
          logger.warn(`Generated audio is too small (${audioBuffer?.length || 0} bytes), enhancing to meet Twilio requirements`);
          
          // If buffer exists but is too small, pad it to at least 10KB
          if (audioBuffer && audioBuffer.length > 0) {
            const padding = Buffer.alloc(10 * 1024 - audioBuffer.length + 1024); // Add extra 1KB margin
            audioBuffer = Buffer.concat([audioBuffer, padding]);
            logger.info(`Enhanced audio buffer size to ${audioBuffer.length} bytes`);
          } else {
            // If no buffer, generate emergency audio
            audioBuffer = voiceProviderService.generateEmergencyAudio(text);
          }
        }
      } catch (speechError) {
        logger.error(`Failed to generate speech with ${voiceProvider}: ${speechError.message}`);
      // Try each provider in sequence - removed clone_voice from the list
        const providers = ['openai_fm', 'elevenlabs', 'rime'].filter(p => p !== voiceProvider);
        
        for (const fallbackProvider of providers) {
          try {
            logger.info(`Trying fallback provider: ${fallbackProvider}`);
            audioBuffer = await voiceProviderService.generateSpeech(text, {
              provider: fallbackProvider,
              language: actualLanguage,
              forceProvider: false
            });
            
            // Check if the buffer is valid and large enough
            if (audioBuffer && audioBuffer.length >= 10 * 1024) {
              logger.info(`Successfully generated audio with fallback provider: ${fallbackProvider}`);
              break;
            } else if (audioBuffer && audioBuffer.length > 0) {
              // Buffer exists but is too small, pad it to meet Twilio requirements
              const padding = Buffer.alloc(10 * 1024 - audioBuffer.length + 1024);
              audioBuffer = Buffer.concat([audioBuffer, padding]);
              logger.info(`Enhanced fallback audio buffer size to ${audioBuffer.length} bytes`);
              break;
            }
          } catch (fallbackError) {
            logger.error(`Fallback provider ${fallbackProvider} also failed: ${fallbackError.message}`);
          }
        }
      }
        
      // If all providers failed, use built-in fallback
      if (!audioBuffer || audioBuffer.length < 10 * 1024) {
        logger.warn(`Audio generation failed or buffer too small (${audioBuffer?.length || 0} bytes), using built-in fallback audio`);
        
        // Use appropriate fallback audio based on context
        const fallbackOptions = [
          { type: 'context', path: path.join(fallbackDir, 'greeting.mp3') },
          { type: 'error', path: path.join(fallbackDir, 'error.mp3') },
          { type: 'medium', path: path.join(fallbackDir, 'silence_medium.mp3') },
          { type: 'large', path: path.join(fallbackDir, 'silence_large.mp3') },
          { type: 'small', path: path.join(fallbackDir, 'silence_small.mp3') },
          { type: 'minimal', path: path.join(fallbackDir, 'silence.mp3') },
        ];
        
        // Try each fallback option in order
        let fallbackFound = false;
        for (const option of fallbackOptions) {
          if (fs.existsSync(option.path)) {
            try {
              const stats = fs.statSync(option.path);
              // Verify file size meets Twilio requirements
              if (stats.size >= 10 * 1024) {
                audioBuffer = fs.readFileSync(option.path);
                logger.info(`Using ${option.type} fallback audio (${audioBuffer.length} bytes)`);
                fallbackFound = true;
                break;
              } else {
                logger.warn(`Fallback file ${option.path} is too small (${stats.size} bytes), trying next option`);
              }
            } catch (readError) {
              logger.error(`Error reading fallback file ${option.path}: ${readError.message}`);
            }
          }
        }
        
        // If none of the fallback files worked, generate emergency audio
        if (!fallbackFound) {
          audioBuffer = voiceProviderService.generateEmergencyAudio(text);
          logger.info(`Created emergency audio buffer (${audioBuffer.length} bytes)`);
        }
      }
      
      // Generate a unique filename to prevent caching issues
      const fileName = `${actualCallId || 'unknown'}_${Date.now()}.mp3`;
      const filePath = path.join(audioDir, fileName);
      
      // Write the buffer to a file and ensure it completes fully before continuing
      return new Promise((resolve, reject) => {
        fs.writeFile(filePath, audioBuffer, async (writeErr) => {
          if (writeErr) {
            logger.error(`Error writing audio file: ${writeErr.message}`);
            return reject(writeErr);
          }
          
          try {
            // Verify the file was written correctly and meets size requirements
            const stats = fs.statSync(filePath);
            if (stats.size < 10 * 1024) {
              logger.warn(`Written file size ${stats.size} bytes is too small for Twilio, enhancing`);
              
              // Enhance the file to meet Twilio size requirements
              const emergencyBuffer = voiceProviderService.generateEmergencyAudio(text);
              await fs.promises.writeFile(filePath, emergencyBuffer);
              logger.info(`Enhanced audio file to ${emergencyBuffer.length} bytes`);
            }
            
            // Create a metadata file to help with Content-Type
            const metaFilePath = path.join(audioDir, `${fileName}.meta`);
            const metadata = {
              contentType: 'audio/mpeg',
              created: new Date().toISOString(),
              size: fs.statSync(filePath).size,
              text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
              provider: voiceProvider
            };
            
            await fs.promises.writeFile(metaFilePath, JSON.stringify(metadata, null, 2));
            
            // Return URL that Twilio can access
            let ngrokUrl = process.env.NGROK_URL;
            if (!ngrokUrl) {
              logger.warn('NGROK_URL not found in environment, using localhost fallback');
              ngrokUrl = 'http://localhost:5002';
            }
            
            // Ensure we don't have double slashes in the URL
            const baseUrl = ngrokUrl.endsWith('/') ? ngrokUrl.slice(0, -1) : ngrokUrl;
            const audioUrl = `${baseUrl}/audio/${fileName}`;
            logger.info(`Generated audio URL: ${audioUrl} with file size: ${metadata.size} bytes`);
            
            // Test URL accessibility to ensure Twilio can access it
            try {
              const http = require('http');
              const https = require('https');
              const testUrl = new URL(audioUrl);
              const client = testUrl.protocol === 'https:' ? https : http;
              
              const req = client.request(testUrl, { method: 'HEAD' }, (res) => {
                if (res.statusCode === 200) {
                  logger.info(`Audio URL is accessible with status: ${res.statusCode}`);
                } else {
                  logger.warn(`Audio URL returned status: ${res.statusCode}, Twilio may have issues accessing it`);
                }
                resolve(audioUrl);
              });
              
              req.on('error', (err) => {
                logger.warn(`Unable to verify audio URL accessibility: ${err.message}`);
                // Still return the URL even if the test fails
                resolve(audioUrl);
              });
              
              req.end();
            } catch (testError) {
              logger.warn(`Error testing audio URL: ${testError.message}`);
              resolve(audioUrl);
            }
          } catch (error) {
            logger.error(`Error preparing audio URL: ${error.message}`);
            reject(error);
          }
        });
      });
    } catch (error) {
      logger.error(`Error generating Twilio audio URL: ${error.message}`);
      
      try {
        // Last resort fallback - return a silent audio file
        const fs = require('fs');
        const path = require('path');
        const audioDir = path.join(__dirname, '../storage/audio');
        const fallbackDir = path.join(__dirname, '../storage/fallback');
        
        // Ensure the audio directory exists
        if (!fs.existsSync(audioDir)) {
          fs.mkdirSync(audioDir, { recursive: true });
        }
        
        // Generate filename for the fallback audio
        const fileName = `fallback_${callId || 'unknown'}_${Date.now()}.mp3`;
        const filePath = path.join(audioDir, fileName);
        
        // Try to find an existing fallback file to copy
        let fallbackSource = path.join(fallbackDir, 'silence_medium.mp3');
        if (!fs.existsSync(fallbackSource)) {
          fallbackSource = path.join(fallbackDir, 'silence.mp3');
        }
        
        let audioBuffer;
        if (fs.existsSync(fallbackSource)) {
          // Copy the fallback file
          audioBuffer = fs.readFileSync(fallbackSource);
          fs.writeFileSync(filePath, audioBuffer);
          logger.info(`Copied fallback audio from ${fallbackSource} (${audioBuffer.length} bytes)`);
        } else {
          // Create minimal MP3 (at least 10KB)
          audioBuffer = voiceProviderService.generateEmergencyAudio('Fallback audio');
          fs.writeFileSync(filePath, audioBuffer);
          logger.info(`Generated emergency fallback audio (${audioBuffer.length} bytes)`);
        }
        
        // Create metadata file
        const metaFilePath = path.join(audioDir, `${fileName}.meta`);
        fs.writeFileSync(metaFilePath, JSON.stringify({
          contentType: 'audio/mpeg',
          created: new Date().toISOString(),
          size: audioBuffer.length,
          isEmergencyFallback: true
        }));
        
        const ngrokUrl = process.env.NGROK_URL || 'http://localhost:5002';
        const baseUrl = ngrokUrl.endsWith('/') ? ngrokUrl.slice(0, -1) : ngrokUrl;
        const audioUrl = `${baseUrl}/audio/${fileName}`;
        logger.info(`Generated emergency fallback audio URL: ${audioUrl}`);
        
        return audioUrl;
      } catch (fallbackError) {
        logger.error(`Even emergency fallback audio creation failed: ${fallbackError.message}`);
        throw error; // Re-throw the original error
      }
    }
  },
    // Check status of a specific voice provider
  checkProviderStatus: async (voiceProvider) => {
    try {
      switch (voiceProvider) {        case 'openai_fm':
          return await openAiFmService.checkApiStatus();
        
        // Removed clone_voice case as it's no longer supported
            case 'elevenlabs':
          try {
            const apiKey = await elevenlabsService.getApiKey();
            if (!apiKey) {
              return { status: 'error', message: 'ElevenLabs API key not configured' };
            }
            // Test connection by getting voices as a simple availability check
            await elevenlabsService.getAvailableVoices();
            return { 
              status: 'available',
              tier: 'standard',
              message: 'ElevenLabs API connection successful'
            };
          } catch (err) {
            return { status: 'error', message: 'ElevenLabs service error: ' + err.message };
          }
          case 'rime':
        case 'rime_tts': // Add support for rime_tts mapping
          try {
            const apiKey = await rimeTtsService.getApiKey();
            if (!apiKey) {
              return { status: 'error', message: 'Rime TTS API key not configured' };
            }
            // Check if we can get voices as a simple connection test
            await rimeTtsService.getAvailableVoices();
            return { 
              status: 'available',
              tier: 'standard',
              message: 'Rime TTS API connection successful'
            };
          } catch (err) {
            return { status: 'error', message: 'Rime TTS service error: ' + err.message };
          }
        
        default:
          return { status: 'unknown', message: 'Invalid provider specified' };
      }
    } catch (error) {
      logger.error(`Error checking provider status for ${voiceProvider}: ${error.message}`);
      return { 
        status: 'error',
        provider: voiceProvider,
        message: error.message
      };
    }  },  // Check status of all voice providers
  checkAllProviders: async () => {
    const results = {};
    
    try {      // Check OpenAI FM
      results.openai_fm = await voiceProviderService.checkProviderStatus('openai_fm')
        .catch(err => ({ status: 'error', message: err.message }));
      
      // Removed Clone Voice check as it's no longer supported
      
      // Check ElevenLabs
      results.elevenlabs = await voiceProviderService.checkProviderStatus('elevenlabs')
        .catch(err => ({ status: 'error', message: err.message }));
      
      // Check Rime TTS
      results.rime = await voiceProviderService.checkProviderStatus('rime')
        .catch(err => ({ status: 'error', message: err.message }));
      
      return {
        status: 'completed',
        providers: results,
        recommendedProvider: voiceProviderService.determineBestProvider(results)
      };
    } catch (error) {
      logger.error(`Error checking all providers: ${error.message}`);      
      return {
        status: 'error',
        message: error.message,
        providers: results
      };
    }
  },
    // Helper function to determine the best provider based on status results
  determineBestProvider: (results) => {    // If OpenAI FM is available, use it as it's generally most reliable
    if (results.openai_fm && results.openai_fm.status === 'available') {
      return 'openai_fm';
    }
    
    // Removed Clone Voice check as it's no longer supported
    
    // If ElevenLabs is available, use it as last option of the available ones
    if (results.elevenlabs && results.elevenlabs.status === 'available') {
      return 'elevenlabs';
    }
    
    // If none are definitively available, default to OpenAI FM as most likely to work
    return 'openai_fm';
  }
};

// Generate emergency audio when all providers fail
voiceProviderService.generateEmergencyAudio = (text) => {
  try {
    logger.warn('Generating emergency fallback audio');
    
    // Create a minimal valid MP3 buffer that's large enough for Twilio playback
    const duration = Math.min(Math.max(text.length * 50, 1000), 10000); // 50ms per char, 1-10 sec
    const frameCount = Math.floor(duration / 26); // ~26ms per MP3 frame
    
    const frames = [];
    
    // Add ID3v2 header
    frames.push(Buffer.from([
      0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]));
    
    // Add MP3 frames for approximate duration (at least 10KB)
    for (let i = 0; i < Math.max(frameCount, 500); i++) {
      frames.push(Buffer.from([
        0xff, 0xfb, 0x90, 0x44, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
      ]));
    }
    
    const audioBuffer = Buffer.concat(frames);
    logger.info(`Generated emergency audio buffer (${audioBuffer.length} bytes)`);
    
    return audioBuffer;
  } catch (error) {
    logger.error(`Emergency audio generation failed: ${error.message}`);
    throw error;
  }
};

// Generate emergency audio when all providers fail
voiceProviderService.generateEmergencyAudio = (text) => {
  // Create a minimal valid MP3 file instead of noise
  // This ensures compatibility with Twilio while avoiding noise
  const fs = require('fs');
  const path = require('path');
  
  // Create a larger, more compatible MP3 header and data
  const mp3Header = Buffer.from([
    // ID3v2 Header
    0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    // Additional ID3 data
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ]);
  
  // Generate multiple MP3 frames for better compatibility
  const mp3Frames = [];
  const targetSize = Math.max(15 * 1024, text.length * 100); // At least 15KB
  const frameSize = 144; // Standard MP3 frame size
  const frameCount = Math.ceil(targetSize / frameSize);
  
  for (let i = 0; i < frameCount; i++) {
    // MP3 frame header for 128kbps, 44.1kHz, stereo
    const frame = Buffer.alloc(frameSize);
    frame[0] = 0xff; // Frame sync
    frame[1] = 0xfb; // MPEG Audio Layer III
    frame[2] = 0x90; // 128kbps bitrate
    frame[3] = 0x44; // 44.1kHz sample rate
    
    // Fill rest with valid MP3 data (silence)
    for (let j = 4; j < frameSize; j++) {
      frame[j] = 0x00; // Silence data
    }
    
    mp3Frames.push(frame);
  }
  
  // Combine header and frames
  const finalBuffer = Buffer.concat([mp3Header, ...mp3Frames]);
  
  logger.info(`Generated emergency MP3 audio: ${finalBuffer.length} bytes for text: "${text.substring(0, 50)}..."`);
  return finalBuffer;
};

// Generate streaming audio for real-time communication (no MP3 files)
voiceProviderService.generateStreamingAudio = async (text, voiceProvider = 'elevenlabs', language = 'en-US', options = {}) => {
  try {    logger.info(`Generating streaming audio with provider: ${voiceProvider}, language: ${language}`);
    
    // Increased timeout for streaming TTS generation
    const timeoutDuration = options.timeout || 5000; // OPTIMIZED: 5 second timeout for faster conversation flow
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Voice generation timeout after ${timeoutDuration}ms`)), timeoutDuration);
    });
    
    let audioStream;
    
    switch (voiceProvider.toLowerCase()) {
      case 'openai_fm':
        // Use OpenAI FM for streaming
        audioStream = await Promise.race([
          openAiFmService.generateStreamingAudio(text, language, options),
          timeoutPromise
        ]);
        break;
        
      case 'elevenlabs':
        // Use ElevenLabs for streaming
        audioStream = await Promise.race([
          elevenlabsService.generateStreamingAudio(text, language, options),
          timeoutPromise
        ]);
        break;
          case 'rime':
      case 'rime_tts': // Add support for rime_tts mapping
        // Use Rime TTS for streaming
        audioStream = await Promise.race([
          rimeTtsService.generateStreamingAudio(text, language, options),
          timeoutPromise
        ]);
        break;
        
      default:
        logger.warn(`Unrecognized streaming provider: ${voiceProvider}. Defaulting to ElevenLabs.`);
        audioStream = await Promise.race([
          elevenlabsService.generateStreamingAudio(text, language, options),
          timeoutPromise
        ]);
        break;
    }
    
    return audioStream;
  } catch (error) {
    logger.error(`Error generating streaming audio: ${error.message}`);
    
    // Try fallback providers for streaming
    if (voiceProvider !== 'elevenlabs') {
      logger.info(`Attempting ElevenLabs fallback for streaming`);
      try {
        return await elevenlabsService.generateStreamingAudio(text, language, options);
      } catch (fallbackError) {
        logger.error(`ElevenLabs streaming fallback failed: ${fallbackError.message}`);
      }
    }
    
    if (voiceProvider !== 'openai_fm') {
      logger.info(`Attempting OpenAI FM fallback for streaming`);
      try {
        return await openAiFmService.generateStreamingAudio(text, language, options);
      } catch (fallbackError) {
        logger.error(`OpenAI FM streaming fallback failed: ${fallbackError.message}`);
      }
    }
    
    // If all streaming fails, generate a simple audio buffer
    logger.warn(`All streaming providers failed, generating silent audio buffer`);
    const silentBuffer = Buffer.alloc(8000); // 1 second of silence at 8kHz
    return silentBuffer;
  }
};

// Get all available voice providers
voiceProviderService.getProviders = () => {
  return ['openai_fm', 'elevenlabs', 'rime'];
};

// Test a specific provider
voiceProviderService.testProvider = async (provider) => {
  return await voiceProviderService.checkProviderStatus(provider);
};

module.exports = voiceProviderService;