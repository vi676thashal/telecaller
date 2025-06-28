const express = require('express');
const router = express.Router();
const voiceProviderService = require('../services/voiceProviderService');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const elevenlabsService = require('../services/elevenlabsService');
const axios = require('axios');

// Helper to ensure audio directory exists
const ensureAudioDirExists = () => {
  const audioDir = path.join(__dirname, '..', 'storage', 'audio');
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }
  return audioDir;
};

/**
 * @route GET /api/voice-providers/status
 * @description Get status of all voice providers
 * @access Public
 */
router.get('/status', async (req, res) => {
  try {
    const result = await voiceProviderService.checkAllProviders();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error getting voice provider status:', error);
    res.status(500).json({ message: 'Failed to get voice provider status', error: error.message });
  }
});

/**
 * @route GET /api/voice-providers/:provider/status
 * @description Get status of a specific voice provider
 * @access Public
 */
router.get('/:provider/status', async (req, res) => {
  try {
    const { provider } = req.params;
    const result = await voiceProviderService.checkProviderStatus(provider);
    res.status(200).json(result);
  } catch (error) {
    console.error(`Error getting status for provider ${req.params.provider}:`, error);
    res.status(500).json({ message: `Failed to get status for provider ${req.params.provider}`, error: error.message });
  }
});

/**
 * @route GET /api/voice-providers/check-audio-dir
 * @description Check if the audio directory exists and has proper permissions
 * @access Public
 */
router.get('/check-audio-dir', async (req, res) => {
  try {
    const audioDir = path.join(__dirname, '..', 'storage', 'audio');
    const testResults = {
      directoryExists: false,
      writable: false,
      readable: false,
      files: []
    };
    
    // Check if directory exists
    if (fs.existsSync(audioDir)) {
      testResults.directoryExists = true;
      
      // Check if directory is writable by creating a test file
      try {
        const testFile = path.join(audioDir, `test-${Date.now()}.txt`);
        fs.writeFileSync(testFile, 'Test write permission');
        testResults.writable = true;
        
        // Check if file is readable
        try {
          fs.readFileSync(testFile, 'utf8');
          testResults.readable = true;
        } catch (readError) {
          console.error('Error reading test file:', readError);
        }
        
        // Clean up test file
        try {
          fs.unlinkSync(testFile);
        } catch (deleteError) {
          console.error('Error deleting test file:', deleteError);
        }
      } catch (writeError) {
        console.error('Error writing to audio directory:', writeError);
      }
      
      // List files in the directory
      try {
        const files = fs.readdirSync(audioDir);
        testResults.files = files.slice(0, 10).map(file => {
          return {
            name: file,
            size: fs.statSync(path.join(audioDir, file)).size,
            url: `/audio/${file}`
          };
        });
        testResults.fileCount = files.length;
      } catch (listError) {
        console.error('Error listing files in audio directory:', listError);
      }
    }
    
    res.status(200).json({
      audioDir,
      testResults,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking audio directory:', error);
    res.status(500).json({ 
      message: 'Failed to check audio directory', 
      error: error.message 
    });
  }
});

/**
 * @route GET /api/voice-providers/openai-fm/voices
 * @description Get available voices for OpenAI FM
 * @access Public
 */
router.get('/openai-fm/voices', async (req, res) => {
  try {
    const openAiFmService = require('../services/openAiFmService');
    const voices = await openAiFmService.getAvailableVoices();
    res.status(200).json(voices);
  } catch (error) {
    console.error('Error getting OpenAI FM voices:', error);
    res.status(500).json({ message: 'Failed to get voices', error: error.message });
  }
});

/**
 * @route GET /api/voice-providers/openai_fm/voices
 * @description Get available voices for OpenAI TTS
 * @access Public
 */
router.get('/openai_fm/voices', async (req, res) => {
  try {
    const openAiFmService = require('../services/openAiFmService');
    const voices = await openAiFmService.getAvailableVoices();
    res.json({
      success: true,
      voices: voices
    });
  } catch (error) {
    console.error('Error fetching OpenAI voices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch voices from OpenAI'
    });
  }
});

/**
 * @route POST /api/voice-providers/voice-synthesis/test
 * @description Test endpoint for voice synthesis
 * @access Public
 */
router.post('/voice-synthesis/test', async (req, res) => {
  try {
    const { text, provider, language } = req.body;
    if (!text) {
      return res.status(400).json({ message: 'Text is required' });
    }
    
    const selectedProvider = provider || 'openai_fm';
    const selectedLanguage = language || 'en-US';
    
    console.log(`Processing voice synthesis test for provider: ${selectedProvider}, language: ${selectedLanguage}`);
    
    const audioBuffer = await voiceProviderService.generateSpeech(text, selectedProvider, selectedLanguage);
    
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', audioBuffer.length);
    res.send(audioBuffer);
  } catch (error) {
    console.error('Error in voice synthesis test:', error);
    res.status(500).json({ message: 'Voice synthesis failed', error: error.message });
  }
});

/**
 * @route POST /api/voice-providers/voice-synthesis/twilio
 * @description Generate a Twilio-compatible URL for voice synthesis
 * @access Public
 */
router.post('/voice-synthesis/twilio', async (req, res) => {
  try {
    const { text, provider, language, callId } = req.body;
    if (!text) {
      return res.status(400).json({ message: 'Text is required' });
    }
    
    const selectedProvider = provider || 'openai_fm';
    const selectedLanguage = language || 'en-US';
    const uniqueId = callId || `call_${Date.now()}`;
      console.log(`Processing Twilio audio URL for provider: ${selectedProvider}, language: ${selectedLanguage}`);
    
    const audioUrl = await voiceProviderService.generateTwilioAudioUrl(text, {
      provider: selectedProvider,
      language: selectedLanguage,
      callId: uniqueId
    });
    
    res.json({ audioUrl });
  } catch (error) {
    console.error('Error generating Twilio audio URL:', error);
    res.status(500).json({ message: 'Failed to generate Twilio audio URL', error: error.message });
  }
});

/**
 * @route GET /api/voice-providers/test
 * @description Test voice generation with ElevenLabs
 * @access Public
 */
router.get('/test', async (req, res) => {
  const testText = "This is a test of the voice synthesis system. If you can hear this message clearly, your voice provider is configured correctly.";
  const language = req.query.language || 'en-US';
  const provider = req.query.provider || 'elevenlabs';
  
  try {
    // Test voice provider directly
    const audioFilePath = path.join(__dirname, '../storage/audio', `voice-test-${Date.now()}.mp3`);
    const audioBuffer = await voiceProviderService.generateSpeech(testText, provider, language);
    fs.writeFileSync(audioFilePath, audioBuffer);
    
    // Return success with path to audio file
    const audioUrl = `/audio/${path.basename(audioFilePath)}`;
    res.json({
      success: true,
      message: 'Voice provider test successful',
      audioUrl: audioUrl,
      provider: provider
    });
  } catch (error) {
    logger.error(`Voice provider test failed for ${provider}: ${error.message}`);
    res.status(500).json({
      success: false,
      message: `Voice provider test failed: ${error.message}`,
      error: error.message,
      provider: provider
    });
  }
});

/**
 * @route GET /api/voice-providers/check-audio-dir
 * @description Check if audio directory exists and has proper permissions
 * @access Public
 */
router.get('/check-audio-dir', async (req, res) => {
  try {
    const audioDir = path.join(__dirname, '..', 'storage', 'audio');
    const testResults = {
      directoryExists: false,
      writable: false,
      readable: false,
      testFileCreated: false,
      testFileReadable: false
    };
    
    // Check if directory exists
    if (fs.existsSync(audioDir)) {
      testResults.directoryExists = true;
      
      // Check write permissions
      try {
        const testFilePath = path.join(audioDir, `permission-test-${Date.now()}.txt`);
        fs.writeFileSync(testFilePath, 'Test write permissions');
        testResults.writable = true;
        testResults.testFileCreated = true;
        
        // Check read permissions
        try {
          const content = fs.readFileSync(testFilePath, 'utf8');
          testResults.readable = true;
          testResults.testFileReadable = content === 'Test write permissions';
          
          // Clean up
          fs.unlinkSync(testFilePath);
        } catch (readError) {
          logger.error(`Cannot read from audio directory: ${readError.message}`);
        }
      } catch (writeError) {
        logger.error(`Cannot write to audio directory: ${writeError.message}`);
      }
    } else {
      // Try to create the directory
      try {
        fs.mkdirSync(audioDir, { recursive: true });
        testResults.directoryExists = true;
      } catch (mkdirError) {
        logger.error(`Cannot create audio directory: ${mkdirError.message}`);
      }
    }
    
    res.json({
      success: true,
      audioDir: audioDir,
      testResults: testResults
    });
  } catch (error) {
    logger.error(`Audio directory check failed: ${error.message}`);
    res.status(500).json({
      success: false,
      message: `Audio directory check failed: ${error.message}`,
      error: error.message
    });
  }
});

/**
 * @route POST /api/voice-providers/generate
 * @description Generate speech from text with a specific provider
 * @access Public
 */
router.post('/generate', async (req, res) => {
  const { text, provider = 'elevenlabs', language = 'en-US' } = req.body;
  
  if (!text) {
    return res.status(400).json({ 
      success: false, 
      message: 'Text is required' 
    });
  }
  
  try {
    const audioBuffer = await voiceProviderService.generateSpeech(text, provider, language);
    const filename = `${uuidv4()}_${Date.now()}.mp3`;
    const audioFilePath = path.join(__dirname, '../storage/audio', filename);
    
    fs.writeFileSync(audioFilePath, audioBuffer);
    
    // Return audio URL
    const audioUrl = `/audio/${filename}`;
    res.json({
      success: true,
      message: 'Speech generated successfully',
      provider: provider,
      audioUrl: audioUrl
    });
  } catch (error) {
    logger.error(`Speech generation failed: ${error.message}`);
    res.status(500).json({
      success: false,
      message: `Speech generation failed: ${error.message}`,
      error: error.message
    });
  }
});

/**
 * @route POST /api/voice-providers/voice-synthesis/stream
 * @description Create real-time streaming synthesis for voice providers
 * @access Public
 */
router.post('/voice-synthesis/stream', async (req, res) => {
  try {
    const { text, provider, language, callId, emotion } = req.body;
    if (!text) {
      return res.status(400).json({ message: 'Text is required' });
    }
    
    if (!callId) {
      return res.status(400).json({ message: 'Call ID is required for streaming' });
    }
    
    const selectedProvider = provider || process.env.DEFAULT_VOICE_PROVIDER || 'openai_fm';
    const selectedLanguage = language || 'en-US';
    const selectedEmotion = emotion || 'neutral';
    
    console.log(`[VoiceProviderRoutes] Starting streaming synthesis - Provider: ${selectedProvider}, Language: ${selectedLanguage}, Call: ${callId}`);
    
    // Check if streaming is enabled
    const enableStreaming = process.env.ENABLE_REAL_TIME_STREAMING === 'true';
    if (!enableStreaming) {
      return res.status(400).json({ 
        message: 'Real-time streaming is disabled', 
        fallback: 'Use /voice-synthesis/twilio for MP3 generation' 
      });
    }
    
    // Create or get audio stream for this call
    const audioStreamService = require('../services/audioStreamService');
    let audioStream = audioStreamService.getStream(callId);
    
    if (!audioStream) {
      audioStream = audioStreamService.createStream(callId);
      console.log(`[VoiceProviderRoutes] Created new audio stream for call: ${callId}`);
    }
    
    // Start real-time synthesis and streaming
    const streamResult = await audioStream.synthesizeAndStream(text, {
      language: selectedLanguage,
      emotion: selectedEmotion,
      voiceProvider: selectedProvider,
      latencyTarget: parseInt(process.env.STREAMING_LATENCY_TARGET) || 200,
      chunkSize: parseInt(process.env.STREAMING_CHUNK_SIZE) || 1024
    });
    
    if (streamResult && streamResult.streamUrl) {
      console.log(`[VoiceProviderRoutes] ✓ Streaming synthesis successful for call: ${callId}`);
      
      res.status(200).json({
        success: true,
        streaming: true,
        streamUrl: streamResult.streamUrl,
        provider: selectedProvider,
        language: selectedLanguage,
        emotion: selectedEmotion,
        latencyTarget: streamResult.latencyTarget,
        callId: callId,
        startTime: streamResult.startTime
      });
    } else {
      throw new Error('Failed to create streaming synthesis');
    }
    
  } catch (error) {
    console.error('[VoiceProviderRoutes] Error in streaming synthesis:', error);
    res.status(500).json({ 
      message: 'Streaming synthesis failed', 
      error: error.message,
      fallback: 'Consider using MP3 generation endpoint as fallback'
    });
  }
});

/**
 * @route GET /api/voice-providers/elevenlabs/voices
 * @description Get available voices from ElevenLabs
 * @access Public
 */
router.get('/elevenlabs/voices', async (req, res) => {
  try {
    const voices = await elevenlabsService.listVoices();
    res.json({
      success: true,
      voices: voices
    });
  } catch (error) {
    console.error('Error fetching ElevenLabs voices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch voices from ElevenLabs'
    });
  }
});

/**
 * @route GET /api/voice-providers/rime/voices
 * @description Get available voices from Rime TTS
 * @access Public
 */
router.get('/rime/voices', async (req, res) => {
  try {
    const rimeTtsService = require('../services/simpleRimeTtsService');
    const voices = await rimeTtsService.getAvailableVoices();
    res.json({
      success: true,
      voices: voices
    });
  } catch (error) {
    console.error('Error fetching Rime TTS voices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch voices from Rime TTS'
    });
  }
});

/**
 * @route POST /api/voice-providers/preview
 * @description Generate a preview audio for a selected voice
 * @access Public
 */
router.post('/preview', async (req, res) => {
  try {
    const { voiceId, text, provider } = req.body;

    if (!voiceId || !text || !provider) {
      return res.status(400).json({
        success: false,
        error: 'Voice ID, text, and provider are required'
      });
    }    // Ensure audio directory exists
    const audioDir = path.join(__dirname, '..', 'storage', 'audio');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    const outputFileName = `preview_${Date.now()}.mp3`;
    const outputPath = path.join(audioDir, outputFileName);

    let audioBuffer;
    if (provider === 'elevenlabs') {
      // Check if ElevenLabs service is properly configured
      const settings = await elevenlabsService.getSettings();
      if (!settings.apiKey) {
        throw new Error('ElevenLabs API key is not configured');
      }

      audioBuffer = await elevenlabsService.generateSpeech(text, 'en-US', {
        voiceId: voiceId
      });
    } else if (provider === 'openai_fm') {
      // Add openAiFm support
      const openAiFmService = require('../services/openAiFmService');
      audioBuffer = await openAiFmService.generateSpeech(text, 'en-US', {
        voiceId: voiceId
      });
    } else if (provider === 'rime') {
      // Add Rime TTS support
      const rimeTtsService = require('../services/simpleRimeTtsService');
      const apiKey = await rimeTtsService.getApiKey();
      if (!apiKey) {
        throw new Error('Rime TTS API key is not configured');
      }
      
      audioBuffer = await rimeTtsService.generateSpeech(text, 'en-US', {
        voiceId: voiceId
      });
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }if (!audioBuffer) {
      throw new Error('Failed to generate preview audio - no audio data received');
    }    // Save the audio buffer to file
    try {
      // Ensure audio directory exists one more time right before writing
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }

      console.log(`Writing audio file to: ${outputPath}`);
      
      // Use async file write with explicit error handling for better reliability
      await new Promise((resolve, reject) => {
        fs.writeFile(outputPath, audioBuffer, (err) => {
          if (err) {
            console.error('Error writing audio file:', err);
            reject(err);
          } else {
            console.log(`Audio file size: ${audioBuffer.length} bytes`);
            resolve();
          }
        });
      });
      
      // Double check the file exists and has content
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure file system has completed write
      
      // Ensure the audio file was created successfully
      if (!fs.existsSync(outputPath)) {
        throw new Error('Failed to save audio file - file does not exist after write');
      }

      const stats = fs.statSync(outputPath);
      if (stats.size === 0) {
        throw new Error('Generated audio file is empty (0 bytes)');
      } else {
        console.log(`Confirmed audio file created successfully: ${stats.size} bytes, provider: ${provider}`);
      }
    } catch (writeError) {
      console.error(`Error writing audio file for provider ${provider}:`, writeError);
      throw new Error(`Failed to save audio file for ${provider}: ${writeError.message}`);
    }

    res.json({
      success: true,
      audioUrl: `/audio/${outputFileName}`
    });  } catch (error) {
    console.error(`Error generating voice preview for provider ${provider}:`, error);
    
    let errorMessage = 'Failed to generate voice preview. ';
    let statusCode = 500;

    // Improved error handling with more specific error messages
    if (error.response) {
      if (error.response.status === 401) {
        statusCode = 401;
        errorMessage += `Invalid ${provider} API key - please check your settings.`;
      } else if (error.response.status === 429) {
        statusCode = 429;
        errorMessage += `API rate limit exceeded for ${provider}. Please try again later.`;
      } else if (error.response.status === 404) {
        statusCode = 404;
        errorMessage += `Voice ID not found: ${voiceId}. Please select a different voice.`;
      } else {
        errorMessage += error.response.data?.error || error.message;
      }
    } else if (error.message.includes('API key')) {
      statusCode = 401;
      errorMessage += `Missing or invalid ${provider} API key - please check your settings.`;
    } else if (error.message.includes('audio file')) {
      statusCode = 500;
      errorMessage += 'Failed to create audio file. Please check server storage permissions.';
    } else {
      errorMessage += error.message;
    }

    // Log the detailed error for server-side debugging
    logger.error(`Voice preview failed - Provider: ${provider}, Voice ID: ${voiceId}, Error: ${errorMessage}`);

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      provider: provider
    });
  }
});

/**
 * @route POST /api/voice-providers/preview-no-db
 * @description Generate a preview audio without requiring database connection
 * @access Public
 */
router.post('/preview-no-db', async (req, res) => {
  try {
    const { voiceId, text, provider } = req.body;

    if (!voiceId || !text || !provider) {
      return res.status(400).json({
        success: false,
        error: 'Voice ID, text, and provider are required'
      });
    }

    // Ensure audio directory exists
    const audioDir = path.join(__dirname, '..', 'storage', 'audio');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }
    const outputFileName = `preview_${Date.now()}.mp3`;
    const outputPath = path.join(audioDir, outputFileName);

    // Simple "static" API key handling that doesn't require database access
    let audioBuffer;
    if (provider === 'elevenlabs') {
      // Use environment variable directly
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        throw new Error('ElevenLabs API key is not configured in environment variables');
      }

      // Direct API call to ElevenLabs
      const response = await axios({
        method: 'post',
        url: `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        data: {
          text: text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75
          }
        },
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        responseType: 'arraybuffer',
        timeout: 15000
      });
      
      audioBuffer = response.data;
    } else if (provider === 'openai_fm') {
      // Use environment variable directly
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OpenAI API key is not configured in environment variables');
      }

      // Direct API call to OpenAI
      const openai = new (require('openai')).OpenAI({ apiKey });
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: voiceId,
        input: text
      });

      const buffer = await response.arrayBuffer();
      audioBuffer = Buffer.from(buffer);
    } else {
      throw new Error(`Unsupported provider: ${provider} (in no-db mode)`);
    }

    if (!audioBuffer) {
      throw new Error('Failed to generate preview audio - no audio data received');
    }

    // Save the audio buffer to file with enhanced error handling
    try {
      // Ensure audio directory exists one more time right before writing
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }

      console.log(`Writing audio file to: ${outputPath}`);
      fs.writeFileSync(outputPath, audioBuffer);
      console.log(`Audio file size: ${audioBuffer.length} bytes`);

      // Ensure the audio file was created successfully
      if (!fs.existsSync(outputPath)) {
        throw new Error('Failed to save audio file - file does not exist after write');
      }

      const stats = fs.statSync(outputPath);
      if (stats.size === 0) {
        throw new Error('Generated audio file is empty (0 bytes)');
      } else {
        console.log(`Confirmed audio file created successfully: ${stats.size} bytes, provider: ${provider}`);
      }
    } catch (writeError) {
      console.error(`Error writing audio file for provider ${provider}:`, writeError);
      throw new Error(`Failed to save audio file for ${provider}: ${writeError.message}`);
    }

    res.json({
      success: true,
      audioUrl: `/audio/${outputFileName}`
    });
  } catch (error) {
    console.error(`Error generating voice preview (no-db mode) for provider ${req.body.provider}:`, error);
    
    let errorMessage = 'Failed to generate voice preview. ';
    let statusCode = 500;

    // Improved error handling with more specific error messages
    if (error.response) {
      if (error.response.status === 401) {
        statusCode = 401;
        errorMessage += `Invalid ${req.body.provider} API key - please check your settings.`;
      } else if (error.response.status === 429) {
        statusCode = 429;
        errorMessage += `API rate limit exceeded for ${req.body.provider}. Please try again later.`;
      } else if (error.response.status === 404) {
        statusCode = 404;
        errorMessage += `Voice ID not found: ${req.body.voiceId}. Please select a different voice.`;
      } else {
        errorMessage += error.response.data?.error || error.message;
      }
    } else if (error.message.includes('API key')) {
      statusCode = 401;
      errorMessage += `Missing or invalid ${req.body.provider} API key - please check your settings.`;
    } else if (error.message.includes('audio file')) {
      statusCode = 500;
      errorMessage += 'Failed to create audio file. Please check server storage permissions.';
    } else {
      errorMessage += error.message;
    }

    // Log the detailed error for server-side debugging
    console.error('Voice preview error details:', {
      message: errorMessage,
      originalError: error.message,
      stack: error.stack
    });

    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * @route POST /api/voice-providers/audio-direct/:voiceId
 * @description Generate audio directly from text without saving to file system
 * @access Public
 */
router.post('/audio-direct/:voiceId', async (req, res) => {
  try {
    const voiceId = req.params.voiceId;
    const { text, provider } = req.body;

    if (!voiceId || !text || !provider) {
      return res.status(400).json({
        success: false,
        error: 'Voice ID, text, and provider are required'
      });
    }

    // Generate audio buffer based on provider
    let audioBuffer;
    if (provider === 'elevenlabs') {
      const settings = await elevenlabsService.getSettings();
      if (!settings.apiKey) {
        throw new Error('ElevenLabs API key is not configured');
      }

      audioBuffer = await elevenlabsService.generateSpeech(text, 'en-US', {
        voiceId: voiceId
      });
    } else if (provider === 'openai_fm') {
      const openAiFmService = require('../services/openAiFmService');
      audioBuffer = await openAiFmService.generateSpeech(text, 'en-US', {
        voiceId: voiceId
      });
    } else if (provider === 'rime') {
      const rimeTtsService = require('../services/simpleRimeTtsService');
      audioBuffer = await rimeTtsService.generateSpeech(text, 'en-US', {
        voiceId: voiceId
      });
    } else {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    if (!audioBuffer) {
      throw new Error('Failed to generate audio - no audio data received');
    }

    // Return audio directly as base64 for browser to play
    const base64Audio = audioBuffer.toString('base64');
    const dataUri = `data:audio/mp3;base64,${base64Audio}`;
    
    res.json({
      success: true,
      audioUrl: dataUri,
      format: 'base64'
    });
  } catch (error) {
    console.error(`Error generating direct audio for provider ${req.body.provider}:`, error);
    
    let errorMessage = 'Failed to generate voice audio. ';
    let statusCode = 500;

    // Improved error handling with more specific error messages
    if (error.response) {
      if (error.response.status === 401) {
        statusCode = 401;
        errorMessage += `Invalid ${req.body.provider} API key - please check your settings.`;
      } else if (error.response.status === 429) {
        statusCode = 429;
        errorMessage += `API rate limit exceeded for ${req.body.provider}. Please try again later.`;
      } else {
        errorMessage += error.response.data?.error || error.message;
      }
    } else {
      errorMessage += error.message;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
});

/**
 * @route GET /api/voice-providers/openai/voices
 * @description Get available voices for OpenAI (alias for OpenAI FM)
 * @access Public
 */
router.get('/openai/voices', async (req, res) => {
  try {
    const openAiFmService = require('../services/openAiFmService');
    const voices = await openAiFmService.getAvailableVoices();
    res.json({
      success: true,
      voices: voices
    });
  } catch (error) {
    console.error('Error fetching OpenAI voices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch voices from OpenAI'
    });
  }
});

/**
 * @route GET /api/voice-providers/chatgpt/voices
 * @description Get available voices for ChatGPT TTS (alias for OpenAI FM)
 * @access Public
 */
router.get('/chatgpt/voices', async (req, res) => {
  try {
    const openAiFmService = require('../services/openAiFmService');
    const voices = await openAiFmService.getAvailableVoices();
    res.json({
      success: true,
      voices: voices
    });
  } catch (error) {
    console.error('Error fetching ChatGPT voices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch voices from ChatGPT TTS'
    });
  }
});

/**
 * @route POST /api/voice-provider/test-voice
 * @description Test voice synthesis with a specific provider and voice
 * @access Public
 */
router.post('/test-voice', async (req, res) => {
  try {
    const { text, provider, voiceId, language } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required for voice testing'
      });
    }

    const selectedProvider = provider || 'openai_fm';
    const selectedLanguage = language || 'en-US';
    const testText = text || 'Hello, this is a voice test from SecureVoiceAI.';

    logger.info('Voice test request received', {
      provider: selectedProvider,
      voiceId,
      language: selectedLanguage,
      textLength: testText.length
    });    // Use the voice provider service to generate test audio
    const voiceProviderService = require('../services/voiceProviderService');
    
    const audioBuffer = await voiceProviderService.generateSpeech(
      testText,
      {
        provider: selectedProvider,
        language: selectedLanguage,
        voiceId: voiceId,
        format: 'mp3',
        quality: 'standard'
      }
    );

    if (!audioBuffer) {
      throw new Error('Failed to generate audio buffer');
    }

    // Set response headers for audio playback
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type'
    });

    // Send the audio buffer directly
    res.send(audioBuffer);

  } catch (error) {
    logger.error('Error in voice test endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate test voice',
      details: error.message
    });
  }
});

module.exports = router;