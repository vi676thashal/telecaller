const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5002;

// Startup logging
console.log('Starting simplified server for voice selection testing:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: PORT,
  MONGODB_URI: process.env.MONGODB_URI,
});

// Express middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Basic health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Simplified SecureVoiceAI server is running',
    timestamp: new Date().toISOString()
  });
});

// Import and use the core routes we need for testing
const voiceProviderRoutes = require('./routes/voiceProviderRoutes');
const apiRoutes = require('./routes/apiRoutes');

// Use routes
app.use('/api/voice-providers', voiceProviderRoutes);
app.use('/api', apiRoutes);

// Test route for voice providers
app.get('/test/voice-providers', async (req, res) => {
  try {
    console.log('Testing voice provider services...');
    
    // Test OpenAI FM Service
    try {
      const openAiFmService = require('./services/openAiFmService');
      const openAiVoices = await openAiFmService.getAvailableVoices();
      console.log('OpenAI FM voices:', openAiVoices);
    } catch (error) {
      console.error('OpenAI FM service error:', error.message);
    }

    // Test ElevenLabs Service
    try {
      const elevenLabsService = require('./services/elevenLabsService');
      const elevenLabsVoices = await elevenLabsService.getAvailableVoices();
      console.log('ElevenLabs voices:', elevenLabsVoices);
    } catch (error) {
      console.error('ElevenLabs service error:', error.message);
    }

    // Test Voice Provider Service
    try {
      const voiceProviderService = require('./services/voiceProviderService');
      const allVoices = await voiceProviderService.getAllVoices();
      console.log('All voices from provider service:', allVoices);
      
      res.json({
        success: true,
        message: 'Voice provider testing completed',
        voices: allVoices
      });
    } catch (error) {
      console.error('Voice provider service error:', error.message);
      res.json({
        success: false,
        message: 'Voice provider testing failed',
        error: error.message
      });
    }
  } catch (error) {
    console.error('Voice provider test error:', error);
    res.status(500).json({
      success: false,
      message: 'Voice provider test failed',
      error: error.message
    });
  }
});

// Test route for language detection
app.get('/test/language-detection', async (req, res) => {
  try {
    const languageManager = require('./services/languageManager');
    
    const testTexts = [
      'Hello, how are you today?',
      'नमस्ते, आप कैसे हैं?',
      'Hi there, this is a test message',
      'मैं अच्छा हूँ, धन्यवाद'
    ];

    const results = [];
    for (const text of testTexts) {
      const language = languageManager.detectLanguage(text);
      const prompt = languageManager.getPromptForLanguage(language, 'greeting');
      results.push({
        text,
        detectedLanguage: language,
        samplePrompt: prompt
      });
    }

    res.json({
      success: true,
      message: 'Language detection testing completed',
      results
    });
  } catch (error) {
    console.error('Language detection test error:', error);
    res.status(500).json({
      success: false,
      message: 'Language detection test failed',
      error: error.message
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Express error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: error.message
  });
});

// MongoDB connection (optional for basic testing)
const connectToMongoDB = async () => {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB successfully');
    } else {
      console.log('MongoDB URI not provided, skipping database connection');
    }
  } catch (error) {
    console.warn('MongoDB connection failed:', error.message);
    console.log('Continuing without database connection for testing...');
  }
};

// Start the server
const startServer = async () => {
  try {
    // Optional MongoDB connection
    await connectToMongoDB();
    
    const server = app.listen(PORT, () => {
      console.log(`✅ Simplified SecureVoiceAI server running on port ${PORT}`);
      console.log(`🔗 Test endpoints:`);
      console.log(`   - Health: http://localhost:${PORT}/health`);
      console.log(`   - Voice Providers: http://localhost:${PORT}/test/voice-providers`);
      console.log(`   - Language Detection: http://localhost:${PORT}/test/language-detection`);
      console.log(`   - Voice Provider API: http://localhost:${PORT}/api/voice-providers/voices`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      server.close(() => {
        mongoose.connection.close(false, () => {
          console.log('Server and database connections closed');
          process.exit(0);
        });
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
