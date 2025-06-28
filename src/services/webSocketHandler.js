const WebSocket = require('ws');
const { Deepgram } = require('@deepgram/sdk');
const { Configuration, OpenAIApi } = require('openai');
const { logger } = require('../utils/logger');
const voiceHandler = require('../controllers/voiceHandler');
const { Readable } = require('stream');

class WebSocketHandler {
    constructor(server) {
        this.deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
        this.openai = new OpenAIApi(new Configuration({
            apiKey: process.env.OPENAI_API_KEY
        }));

        // Create WebSocket server with proper Twilio protocol settings
        this.wss = new WebSocket.Server({
            server,
            path: '/ws/twilio',
            perMessageDeflate: false,
            skipUTF8Validation: true,
            fragmentOutgoingMessages: false,
            maxPayload: 65536
        });

        this.setupWebSocketServer();
    }

    setupWebSocketServer() {
        this.wss.on('connection', (ws, req) => {
            logger.info('Step 3: New WebSocket connection established');
            
            ws.isAlive = true;
            ws.audioBuffer = Buffer.from('');
            let deepgramConnection = null;
            let callContext = {
                transcripts: [],
                lastResponse: null
            };

            ws.on('pong', () => {
                ws.isAlive = true;
            });

            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data);
                    
                    switch (message.event) {
                        case 'start':
                            logger.info('Start event received:', message);
                            ws.streamSid = message.start.streamSid;
                            await this.handleStart(ws, message);
                            break;
                            
                        case 'media':
                            await this.handleMedia(ws, message, deepgramConnection, callContext);
                            break;
                            
                        case 'stop':
                            logger.info('Stop event received');
                            if (deepgramConnection) {
                                deepgramConnection.finish();
                            }
                            break;
                    }
                } catch (error) {
                    logger.error('Error handling WebSocket message:', error);
                }
            });

            ws.on('error', (error) => {
                logger.error('WebSocket error:', error);
            });

            ws.on('close', () => {
                logger.info('WebSocket connection closed');
                if (deepgramConnection) {
                    deepgramConnection.finish();
                }
            });

            // Start Deepgram connection
            deepgramConnection = this.setupDeepgram(ws, callContext);
        });

        // Keep-alive mechanism
        setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) return ws.terminate();
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);
    }

    async handleStart(ws, message) {
        try {
            logger.info('Step 3: WebSocket stream started', { streamSid: ws.streamSid });
        } catch (error) {
            logger.error('Error in handleStart:', error);
        }
    }

    async handleMedia(ws, message, deepgramConnection, callContext) {
        try {
            // Step 4: Forward audio to Deepgram
            const audioChunk = Buffer.from(message.media.payload, 'base64');
            if (deepgramConnection && deepgramConnection.getReadyState() === 1) {
                deepgramConnection.send(audioChunk);
            }
        } catch (error) {
            logger.error('Error in handleMedia:', error);
        }
    }

    setupDeepgram(ws, callContext) {
        // Step 4: Setup Deepgram streaming
        const deepgramLive = this.deepgram.transcription.live({
            encoding: 'mulaw',
            sample_rate: 8000,
            language: 'en-US',
            smart_format: true,
            interim_results: false
        });

        deepgramLive.addListener('transcriptReceived', async (transcription) => {
            try {
                // Step 5: Process transcript with GPT-4
                if (transcription?.is_final && transcription?.channel?.alternatives?.[0]?.transcript) {
                    const transcript = transcription.channel.alternatives[0].transcript;
                    logger.info('Transcript received:', transcript);

                    // Get GPT response
                    const gptResponse = await this.getGPTResponse(transcript, callContext);
                    
                    // Step 6: Convert GPT response to speech
                    const audioResponse = await this.convertToSpeech(gptResponse);
                    
                    // Step 7: Send audio response back to user
                    await this.playAudioToUser(ws, audioResponse);
                    
                    // Update context
                    callContext.transcripts.push({
                        role: 'user',
                        content: transcript
                    });
                    callContext.transcripts.push({
                        role: 'assistant',
                        content: gptResponse
                    });
                }
            } catch (error) {
                logger.error('Error processing transcript:', error);
            }
        });

        return deepgramLive;
    }

    async getGPTResponse(transcript, context) {
        try {
            const completion = await this.openai.createChatCompletion({
                model: 'gpt-4',
                messages: [
                    { role: 'system', content: 'You are a helpful AI assistant.' },
                    ...context.transcripts,
                    { role: 'user', content: transcript }
                ]
            });

            return completion.data.choices[0].message.content;
        } catch (error) {
            logger.error('Error getting GPT response:', error);
            return 'I apologize, but I encountered an error processing your request.';
        }
    }

    async convertToSpeech(text) {
        try {
            const response = await this.openai.createSpeech({
                model: 'tts-1',
                voice: 'alloy',
                input: text
            });

            return response.data;
        } catch (error) {
            logger.error('Error converting to speech:', error);
            throw error;
        }
    }

    async playAudioToUser(ws, audioData) {
        try {
            // Convert audio to base64 and proper format for Twilio
            const response = {
                event: 'media',
                streamSid: ws.streamSid,
                media: {
                    payload: audioData.toString('base64')
                }
            };
            ws.send(JSON.stringify(response));
        } catch (error) {
            logger.error('Error playing audio to user:', error);
        }
    }
}

module.exports = WebSocketHandler;
