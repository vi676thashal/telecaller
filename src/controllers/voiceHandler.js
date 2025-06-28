const VoiceResponse = require('twilio').twiml.VoiceResponse;
const { logger } = require('../utils/logger');

class VoiceHandler {
    constructor() {
        this.activeCalls = new Map();
    }

    handleIncomingCall(req, res) {
        try {
            const callSid = req.body.CallSid;
            logger.info(`Step 1: Incoming call received - CallSid: ${callSid}`, {
                from: req.body.From,
                to: req.body.To,
                status: req.body.CallStatus
            });

            // Create TwiML response with Stream
            const twiml = new VoiceResponse();
            
            // Add a small pause to ensure stable connection
            twiml.pause({ length: 1 });

            // Create Connect and Stream for WebSocket
            const connect = twiml.connect();
            connect.stream({
                url: `wss://${process.env.NGROK_URL.replace('https://', '')}/ws/twilio`,
                track: 'inbound_track'
            });

            // Add fallback Say in case of stream issues
            twiml.say({
                voice: 'Polly.Amy-Neural',
                language: 'en-US'
            }, 'Hello! Please wait while I connect you.');

            // Log the TwiML for verification
            logger.info('Step 2: TwiML Stream Response:', {
                twiml: twiml.toString(),
                callSid
            });

            // Store call in active calls
            this.activeCalls.set(callSid, {
                status: 'initiated',
                startTime: new Date(),
                transcripts: [],
                language: 'en-US'
            });

            res.type('text/xml');
            res.send(twiml.toString());

        } catch (error) {
            logger.error('Error in voice handler:', error);
            const twiml = new VoiceResponse();
            twiml.say('An error occurred. Please try again later.');
            res.type('text/xml');
            res.send(twiml.toString());
        }
    }

    handleCallStatus(req, res) {
        const callSid = req.body.CallSid;
        const status = req.body.CallStatus;

        logger.info(`Call status update - SID: ${callSid}, Status: ${status}`, {
            duration: req.body.CallDuration,
            timestamp: new Date().toISOString()
        });

        if (status === 'completed' || status === 'busy' || status === 'failed') {
            // Cleanup call resources
            if (this.activeCalls.has(callSid)) {
                const call = this.activeCalls.get(callSid);
                logger.info('Call ended - Final Summary:', {
                    callSid,
                    duration: (new Date() - call.startTime) / 1000,
                    transcriptCount: call.transcripts.length
                });
                this.activeCalls.delete(callSid);
            }
        }

        res.sendStatus(200);
    }

    getActiveCall(callSid) {
        return this.activeCalls.get(callSid);
    }
}

module.exports = new VoiceHandler();
