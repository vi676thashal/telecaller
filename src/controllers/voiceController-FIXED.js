const VoiceResponse = require('twilio').twiml.VoiceResponse;

class VoiceController {
    handleCall(req, res) {
        try {
            console.log('Incoming voice call:', {
                callSid: req.body.CallSid,
                from: req.body.From,
                to: req.body.To
            });

            // Construct clean WebSocket URL without port number
            const wsUrl = `wss://${new URL(process.env.NGROK_URL).host}/ws/twilio`;
            
            const twiml = new VoiceResponse();
            
            // Use Connect with Stream, using inbound_track as required
            const connect = twiml.connect();
            connect.stream({
                url: wsUrl,
                track: 'inbound_track'
            });

            // Validate TwiML before sending
            const twimlString = twiml.toString();
            console.log('Generated TwiML:', twimlString);

            res.type('text/xml');
            res.send(twimlString);
        } catch (error) {
            console.error('Error in voice handler:', error);
            // Return valid TwiML even in error case
            const twiml = new VoiceResponse();
            twiml.say('An error occurred. Please try again later.');
            res.type('text/xml');
            res.send(twiml.toString());
        }
    }
}

module.exports = new VoiceController();
