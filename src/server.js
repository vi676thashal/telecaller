require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { logger } = require('./utils/logger');
const voiceHandler = require('./controllers/voiceHandler');
const WebSocketHandler = require('./services/webSocketHandler');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Initialize WebSocket handler
const wsHandler = new WebSocketHandler(server);

// Voice webhook endpoint
app.post('/voice', (req, res) => {
    voiceHandler.handleIncomingCall(req, res);
});

// Status webhook endpoint
app.post('/status', (req, res) => {
    voiceHandler.handleCallStatus(req, res);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Error handling
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5002;
server.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`Webhook URL: ${process.env.NGROK_URL}/voice`);
    logger.info(`WebSocket URL: wss://${process.env.NGROK_URL.replace('https://', '')}/ws/twilio`);
});
