const express = require('express');
const router = express.Router();
const recordingController = require('../controllers/recordingController');

// Routes for recording management
router.get('/', recordingController.getAllRecordings);
router.get('/analytics', recordingController.getRecordingAnalytics);
router.get('/:id', recordingController.getRecording);
router.get('/:id/transcript', recordingController.getTranscript);

module.exports = router;
