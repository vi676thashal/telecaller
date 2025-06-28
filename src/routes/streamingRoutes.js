const express = require('express');
const router = express.Router();
const audioStreamService = require('../services/audioStreamService');
const { callCoordinator } = require('../services/CallCoordinator');
const { interruptionHandler } = require('../services/interruption-handler');
const { realTimeAudioManager } = require('../services/realTimeAudioManager');
const creditCardSalesController = require('../services/creditCardSalesController');
const { logger } = require('../utils/logger');
const Call = require('../models/Call');

/**
 * Real-time audio streaming routes for Twilio WebSocket connections
 * Enhanced for credit card sales agent with 2-second latency interruption handling
 */
router.get('/call/:callId/audio', async (req, res) => {
  try {
    const { callId } = req.params;
    
    console.log(`[StreamingRoutes] Audio stream requested for call: ${callId}`);
    
    // Get the audio stream for this call
    const audioStream = audioStreamService.getStream(callId);
    if (!audioStream) {
      console.error(`[StreamingRoutes] No audio stream found for call: ${callId}`);
      return res.status(404).json({ error: 'Audio stream not found' });
    }
    
    // Set headers for audio streaming
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Pipe the audio stream output to the response
    audioStream.output.pipe(res);
    
    // Handle stream events
    audioStream.output.on('error', (error) => {
      console.error(`[StreamingRoutes] Stream error for call ${callId}:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Streaming error' });
      }
    });
    
    audioStream.output.on('end', () => {
      console.log(`[StreamingRoutes] Stream ended for call: ${callId}`);
      if (!res.headersSent) {
        res.end();
      }
    });
    
    // Handle client disconnect
    req.on('close', () => {
      console.log(`[StreamingRoutes] Client disconnected from stream: ${callId}`);
      // Don't close the stream as other clients might be connected
    });
    
    req.on('error', (error) => {
      console.error(`[StreamingRoutes] Request error for call ${callId}:`, error);
    });
    
  } catch (error) {
    console.error('[StreamingRoutes] Error in audio streaming route:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * REST endpoint to initialize audio streaming for a call
 * Enhanced for credit card sales with real-time interruption handling
 */
router.post('/call/:callId/init', async (req, res) => {
  const { callId } = req.params;
  
  logger.info(`[StreamingRoutes] Initialize streaming for credit card sales call: ${callId}`);
  
  try {
    // Get call from database
    const call = await Call.findById(callId).populate('scriptId').populate('promptId');
    if (!call) {
      logger.error(`Call ${callId} not found in database`);
      return res.status(404).json({ 
        success: false, 
        error: 'Call not found in database' 
      });
    }
    
    // Initialize both traditional and real-time audio streams
    let audioStream = audioStreamService.getStream(callId);
    if (!audioStream) {
      audioStream = audioStreamService.createStream(callId);
      logger.info(`[StreamingRoutes] Created new audio stream for call: ${callId}`);
    }
    
    // Create real-time low-latency stream
    const realTimeStream = realTimeAudioManager.createStream(callId);
    logger.info(`[StreamingRoutes] Created real-time stream with 2-second latency for call: ${callId}`);
    
    // Initialize call in coordinator
    await callCoordinator.initializeCall(callId, {
      phoneNumber: call.customerNumber,
      scriptId: call.scriptId ? call.scriptId._id : null,
      promptId: call.promptId ? call.promptId._id : null,
      language: call.language || 'mixed',
      cardType: call.cardType || 'premium',
      enableInterruptions: true,
      ttsProvider: 'openai_fm',
      sttProvider: 'deepgram'
    });
    
    // Initialize call in credit card sales controller
    await creditCardSalesController.initializeCall(callId, {
      phoneNumber: call.customerNumber,
      scriptId: call.scriptId ? call.scriptId._id : null,
      promptId: call.promptId ? call.promptId._id : null,
      language: call.language || 'mixed',
      cardType: call.cardType || 'premium'
    });
    
    // Initialize interruption handler
    interruptionHandler.initializeCall(callId);
    interruptionHandler.configure({
      latencyMs: 2000, // 2-second latency
      sensitivityLevel: 0.7 // Higher sensitivity for credit card sales
    });
    
    res.json({ 
      success: true, 
      message: 'Credit card sales audio stream initialized with 2-second latency',
      callId: callId,
      streamReady: true,
      callType: 'credit_card_sales',
      cardType: call.cardType || 'premium',
      language: call.language || 'mixed'
    });
    
  } catch (error) {
    logger.error(`[StreamingRoutes] Error initializing stream for call ${callId}:`, error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to initialize audio stream',
      message: error.message 
    });
  }
});

/**
 * Get stream status for a call
 */
router.get('/call/:callId/status', async (req, res) => {
  try {
    const { callId } = req.params;
    
    const audioStream = audioStreamService.getStream(callId);
    const status = {
      callId,
      streamExists: !!audioStream,
      timestamp: Date.now()
    };
    
    if (audioStream) {
      status.streamActive = audioStream.active;
      status.streamReady = audioStream.ready;
    }
    
    res.json(status);
  } catch (error) {
    console.error('[StreamingRoutes] Error getting stream status:', error);
    res.status(500).json({ error: 'Failed to get stream status' });
  }
});

/**
 * Health check for streaming service
 */
router.get('/health', (req, res) => {
  const activeStreams = audioStreamService.getActiveStreamCount();
  res.json({
    status: 'ok',
    activeStreams,
    timestamp: Date.now()
  });
});

/**
 * Get streaming metrics for monitoring
 */
router.get('/metrics', (req, res) => {
  const metrics = audioStreamService.getMetrics();
  res.json(metrics);
});

// Note: WebSocket endpoints are handled at the server level
// Express router does not support router.ws() by default
// WebSocket handling is configured in server.js with proper WebSocket server setup

module.exports = router;
