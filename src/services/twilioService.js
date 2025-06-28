const twilio = require('twilio');
require('dotenv').config();

// Twilio service for making calls
const twilioService = {
  // Initialize Twilio client with environment variables
  getClient: async () => {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      
      if (!accountSid || !authToken) {
        throw new Error('Twilio credentials not found in environment variables');
      }
      
      return twilio(accountSid, authToken);
    } catch (error) {
      console.error('Error initializing Twilio client:', error);
      throw error;
    }
  },
  
  // Generate TwiML for incoming calls with WebSocket streaming
  generateTwiMLForIncomingCall: (options) => {
    try {
      const { callSid, streamUrl, trackingParams = {} } = options;
      console.log(`Generating TwiML for incoming call ${callSid} with stream URL: ${streamUrl}`);
      
      // Create TwiML response
      const twiml = new twilio.twiml.VoiceResponse();
      
      // Add <Connect> with <Stream> for real-time audio processing
      const connect = twiml.connect();
      connect.stream({
        url: streamUrl,
        track: 'inbound_track' // IMPORTANT: Must be 'inbound_track' for bidirectional Connect streams
      });
      
      return twiml.toString();
    } catch (error) {
      console.error('Error generating TwiML for incoming call:', error);
      
      // Return a fallback TwiML if there's an error
      const fallbackTwiml = new twilio.twiml.VoiceResponse();
      fallbackTwiml.say('We are experiencing technical difficulties. Please try again later.');
      return fallbackTwiml.toString();
    }
  },
  
  // Make outbound call
  makeCall: async (callId, phoneNumber, language) => {
    try {
      // Log all environment variables needed for debugging
      console.log('ENVIRONMENT VARIABLES CHECK:');
      console.log(`TWILIO_ACCOUNT_SID present: ${!!process.env.TWILIO_ACCOUNT_SID}`);
      console.log(`TWILIO_AUTH_TOKEN present: ${!!process.env.TWILIO_AUTH_TOKEN}`);
      console.log(`TWILIO_PHONE_NUMBER: ${process.env.TWILIO_PHONE_NUMBER}`);
      console.log(`NGROK_URL: ${process.env.NGROK_URL}`);
      
      const client = await twilioService.getClient();
      const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
      
      if (!twilioPhoneNumber) {
        throw new Error('Twilio phone number not found in environment variables');
      }
      
      // Create call with TwiML URL for dynamic conversation using ngrok public URL
      const ngrokUrl = process.env.NGROK_URL;
      if (!ngrokUrl) {
        console.error('NGROK_URL not set in environment variables');
        throw new Error('Missing NGROK_URL configuration');
      }
      console.log(`[twilioService] Making outbound call to ${phoneNumber} for callId ${callId}`);
      console.log(`[twilioService] Using webhooks with base URL: ${ngrokUrl}`);
      
      // Convert string callId to proper ObjectId string format if needed
      const formattedCallId = callId.toString();
      
      // Make sure URLs don't have double slashes
      const apiBaseUrl = ngrokUrl.endsWith('/') ? ngrokUrl.slice(0, -1) : ngrokUrl;
      
      const callOptions = {
        to: phoneNumber,
        from: twilioPhoneNumber,
        url: `${apiBaseUrl}/api/calls/${formattedCallId}/voice`,
        method: 'POST',
        statusCallback: `${apiBaseUrl}/api/calls/${formattedCallId}/status`,
        statusCallbackMethod: 'POST',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        record: true,
        recordingStatusCallback: `${apiBaseUrl}/api/calls/${formattedCallId}/recording`
      };
      
      console.log(`[twilioService] Call options:`, JSON.stringify(callOptions, null, 2));
      
      const call = await client.calls.create(callOptions);
      console.log(`[twilioService] Twilio call created successfully with SID: ${call.sid}`);
      
      return call;
    } catch (error) {
      console.error('Error making Twilio call:', error);
      console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      
      // Add more specific error handling
      if (error.code === 20404) {
        throw new Error('Invalid phone number');
      } else if (error.code === 20003) {
        throw new Error('Authentication failed. Please check Twilio credentials');
      } else {
        throw new Error(error.message || 'Failed to make call');
      }
    }
  },
  
  // Handle incoming call
  handleIncomingCall: async (callSid) => {
    try {
      const client = await twilioService.getClient();
      
      // Get call details
      const call = await client.calls(callSid).fetch();
      
      return call;
    } catch (error) {
      console.error('Error handling incoming call:', error);
      throw error;
    }
  },
  
  // End a call
  endCall: async (callSid) => {
    try {
      const client = await twilioService.getClient();
      
      // Update call to status=completed to end it
      const call = await client.calls(callSid)
        .update({status: 'completed'});
      
      return call;
    } catch (error) {
      console.error('Error ending call:', error);
      throw error;
    }
  }
};

module.exports = twilioService;
