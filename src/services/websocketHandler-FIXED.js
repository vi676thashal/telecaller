const WebSocket = require('ws');
const { logger } = require('../utils/logger');

class WebSocketHandler {
    constructor(server) {
        // Configure WebSocket server with proper Twilio protocol support
        this.wss = new WebSocket.Server({
            server,
            path: '/ws/twilio',
            perMessageDeflate: false,
            skipUTF8Validation: true,
            fragmentOutgoingMessages: false,
            maxPayload: 65536,
            handleProtocols: (protocols) => {
                // Accept Twilio's protocol
                if (protocols.includes('audio.ws.twilio.com')) {
                    return 'audio.ws.twilio.com';
                }
                return false;
            }
        });

        this.setupWebSocketServer();
    }

    setupWebSocketServer() {
        this.wss.on('connection', (ws, req) => {
            logger.info('New WebSocket connection', {
                protocol: ws.protocol,
                headers: req.headers
            });
            
            // Set up connection state
            ws.isAlive = true;
            ws.mediaBuffer = Buffer.from('');
            ws.streamSid = null;
            
            ws.on('pong', () => {
                ws.isAlive = true;
            });

            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data);
                    
                    switch (message.event) {
                        case 'start':
                            ws.streamSid = message.start.streamSid;
                            logger.info('Stream started', { streamSid: ws.streamSid });
                            break;
                            
                        case 'media':
                            if (message.media && message.media.payload) {
                                // Process media without sending audio back
                                await this.handleMedia(ws, message);
                            }
                            break;
                            
                        case 'stop':
                            logger.info('Stream stopped', { streamSid: ws.streamSid });
                            this.cleanup(ws);
                            break;

                        case 'mark':
                            logger.info('Mark received', { streamSid: ws.streamSid, mark: message.mark });
                            break;
                    }
                } catch (error) {
                    logger.error('Error processing WebSocket message', { 
                        error: error.message,
                        data: typeof data === 'string' ? data : 'binary data'
                    });
                }
            });

            ws.on('error', (error) => {
                logger.error('WebSocket error', { 
                    error: error.message,
                    streamSid: ws.streamSid
                });
                this.cleanup(ws);
            });

            ws.on('close', () => {
                logger.info('WebSocket connection closed', { streamSid: ws.streamSid });
                this.cleanup(ws);
            });
        });

        // Keep-alive ping/pong
        const interval = setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    logger.info('Terminating inactive connection', { streamSid: ws.streamSid });
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);

        this.wss.on('close', () => {
            clearInterval(interval);
        });
    }

    cleanup(ws) {
        ws.mediaBuffer = null;
        ws.streamSid = null;
        ws.isAlive = false;
    }

    async handleMedia(ws, message) {
        try {
            // Process the audio without sending anything back through WebSocket
            const audioData = Buffer.from(message.media.payload, 'base64');
            
            // Here you would typically:
            // 1. Send to STT service
            // 2. Process the text
            // 3. Generate response
            // 4. Use Twilio REST API to <Say> or <Play> the response
            // DO NOT send audio back through WebSocket
            
            logger.debug('Processed media chunk', {
                streamSid: ws.streamSid,
                bytes: audioData.length
            });
        } catch (error) {
            logger.error('Error handling media', {
                error: error.message,
                streamSid: ws.streamSid
            });
        }
    }
}

module.exports = WebSocketHandler;
