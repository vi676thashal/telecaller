const express = require('express');
const router = express.Router();
const CallController = require('../controllers/callController');
// Import the class and create an instance
const callController = new CallController();

// Debug: Verify the callController instance
console.log('[callRoutes] CallController instance created');
console.log('[callRoutes] activeCallState type:', typeof callController.activeCallState);
console.log('[callRoutes] realTimeService type:', typeof callController.realTimeService);
console.log('[callRoutes] resetCallState type:', typeof callController.resetCallState);
console.log('[callRoutes] initiateCall type:', typeof callController.initiateCall);

// Add validation endpoint
router.get('/upload/validate', callController.validateUpload);

// Routes for call management with debugging wrapper
router.post('/initiate', async (req, res) => {
  console.log('[callRoutes] /initiate route called');
  console.log('[callRoutes] Pre-call check - callController type:', typeof callController);
  console.log('[callRoutes] Pre-call check - initiateCall type:', typeof callController.initiateCall);
  console.log('[callRoutes] Pre-call check - activeCallState type:', typeof callController.activeCallState);
  console.log('[callRoutes] Pre-call check - realTimeService type:', typeof callController.realTimeService);
  
  try {
    await callController.initiateCall(req, res);
  } catch (error) {
    console.error('[callRoutes] Error in initiateCall wrapper:', error);
    res.status(500).json({ message: 'Route wrapper error', error: error.message });
  }
});
router.post('/bulk', callController.uploadBulkCalls);
router.get('/active', callController.getActiveCalls);
router.get('/', callController.getAllCalls);
router.get('/:id', callController.getCall);

// Twilio webhook routes
router.post('/:id/status', callController.handleCallStatus);
router.post('/:id/voice', callController.handleVoiceWebhook);
router.post('/:id/recording', callController.handleRecordingWebhook);
router.post('/:id/input', callController.handleSpeechInput);

module.exports = router;
