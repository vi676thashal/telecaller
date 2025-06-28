/**
 * Twilio Routes
 *
 * Routes for handling Twilio webhook requests
 */

const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { logger } = require('../utils/logger');
const { callCoordinator } = require('../services/CallCoordinator');

// Handle incoming voice calls
router.post('/voice', async (req, res) => {
  try {
    logger.info('Received incoming call webhook', { 
      callSid: req.body.CallSid,
      from: req.body.From,
      to: req.body.To
    });
      const twiml = new twilio.twiml.VoiceResponse();
    
    // Connect to websocket for real-time streaming - FIXED FOR ERROR 31920
    const ngrokUrl = process.env.NGROK_URL;
    let wsUrl;
    
    if (ngrokUrl) {
      // Properly construct WebSocket URL from NGROK_URL
      if (ngrokUrl.startsWith('https://')) {
        wsUrl = ngrokUrl.replace('https://', 'wss://') + '/ws/twilio';
      } else if (ngrokUrl.startsWith('http://')) {
        wsUrl = ngrokUrl.replace('http://', 'ws://') + '/ws/twilio';
      } else {
        wsUrl = 'wss://' + ngrokUrl + '/ws/twilio';
      }
    } else {
      // Fallback to request hostname
      wsUrl = `wss://${req.hostname}/ws/twilio`;
    }
    
    twiml.connect().stream({
      url: wsUrl,
      track: 'inbound_track'  // Specify track for better compatibility
    });
    
    res.type('text/xml');
    res.send(twiml.toString());
    
    logger.info('Sent TwiML response for voice webhook', { callSid: req.body.CallSid });
  } catch (error) {
    logger.error('Error handling voice webhook', { 
      error: error.message, 
      stack: error.stack,
      callSid: req.body.CallSid
    });
    
    const fallbackTwiml = new twilio.twiml.VoiceResponse();
    fallbackTwiml.say('We encountered an error processing your call. Please try again later.');
    res.type('text/xml');
    res.send(fallbackTwiml.toString());
  }
});

// Handle call status updates
router.post('/call-status', async (req, res) => {
  try {
    const { CallSid, CallStatus } = req.body;
    
    logger.info('Call status updated', { callSid: CallSid, status: CallStatus });
    
    if (CallStatus === 'completed' || CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
      await callCoordinator.handleCallEnd(CallSid);
    }
    
    res.sendStatus(200);
  } catch (error) {
    logger.error('Error handling call status webhook', { 
      error: error.message, 
      stack: error.stack,
      callSid: req.body.CallSid,
      callStatus: req.body.CallStatus
    });
    res.sendStatus(500);
  }
});

// Export the router
module.exports = router;
