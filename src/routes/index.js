const express = require('express');
const router = express.Router();

// Import all route modules
const authRoutes = require('./authRoutes');
const callRoutes = require('./callRoutes');
const customerRoutes = require('./customerRoutes');
const customerDataRoutes = require('./customerData');
const dashboardRoutes = require('./dashboardRoutes');
const promptRoutes = require('./promptRoutes');
const recordingRoutes = require('./recordingRoutes');
const scriptRoutes = require('./scriptRoutes');
const settingsRoutes = require('./settingsRoutes');
const voiceProviderRoutes = require('./voiceProviderRoutes');
const streamingRoutes = require('./streamingRoutes');
const analyticsRoutes = require('./analyticsRoutes');

// New workflow and AI-driven call flow routes
const workflowRoutes = require('./workflowRoutes');
const callFlowRoutes = require('./callFlowRoutes');
const knowledgeBaseRoutes = require('./knowledgeBaseRoutes');

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Mount all routes
router.use('/auth', authRoutes);
router.use('/calls', callRoutes);
router.use('/customers', customerRoutes);
router.use('/customer-data', customerDataRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/prompts', promptRoutes);
router.use('/recordings', recordingRoutes);
router.use('/scripts', scriptRoutes);
router.use('/settings', settingsRoutes);
router.use('/voice-providers', voiceProviderRoutes);
router.use('/voice-provider', voiceProviderRoutes); // Add compatibility alias
router.use('/stream', streamingRoutes);
router.use('/audio-stream', streamingRoutes); // Add alias for audio-stream endpoints
router.use('/analytics', analyticsRoutes);

// New AI-driven call flow routes
router.use('/workflows', workflowRoutes);
router.use('/call-flows', callFlowRoutes);
router.use('/knowledge-base', knowledgeBaseRoutes);

// Direct voice synthesis endpoints
router.post('/voice-synthesis/test', async (req, res) => {
  try {
    const { text, provider, language } = req.body;
    if (!text) {
      return res.status(400).json({ message: 'Text is required' });
    }
    
    const selectedProvider = provider || 'openai_fm';
    const selectedLanguage = language || 'en-US';
    const voiceProviderService = require('../services/voiceProviderService');
    
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

router.post('/voice-synthesis/twilio', async (req, res) => {
  try {
    const { text, provider, language, callId } = req.body;
    if (!text) {
      return res.status(400).json({ message: 'Text is required' });
    }
    
    const selectedProvider = provider || 'openai_fm';
    const selectedLanguage = language || 'en-US';
    const uniqueId = callId || `call_${Date.now()}`;
    const voiceProviderService = require('../services/voiceProviderService');
    
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

module.exports = router;
