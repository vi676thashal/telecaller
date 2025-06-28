const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fileUpload = require('express-fileupload');
const WebSocket = require('ws');
const routes = require('./routes');
const setupWebSocketServer = require('./websocket/handlers'); // For general /ws
const MediaWebSocketHandler = require('./websocket/mediaHandler'); // For Twilio /media
const twilioWebSocketHandler = require('./services/twilioWebSocketHandler'); // For real-time Twilio streaming
const callController = require('./controllers/callController'); // Singleton instance
// Voice cloning components removed

const app = express();
const PORT = process.env.PORT || 5000;

// Startup logging
console.log('Starting server with configuration:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: PORT,
  MONGODB_URI: process.env.MONGODB_URI,
});

// Express middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// File upload configuration
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: path.join(__dirname, 'storage/uploads'),
  createParentPath: true
}));

// Ensure storage directories exist
const uploadDir = path.join(__dirname, 'storage/uploads');
const transcriptDir = path.join(__dirname, 'storage/transcripts');
if (!require('fs').existsSync(uploadDir)) {
  require('fs').mkdirSync(uploadDir, { recursive: true });
}

const fs = require('fs');
const { exec } = require('child_process');

// FFmpeg check for audio processing
const checkFfmpegInstallation = () => {
  return new Promise((resolve) => {
    exec('ffmpeg -version', (error, stdout) => {
      if (error) {
        console.log('[app] FFmpeg not found in system PATH, will check local installation');
        resolve(false);
        return;
      }
      console.log('[app] FFmpeg found in system PATH:', stdout.split('\n')[0]);
      resolve(true);
    });
  });
};

// Check for FFmpeg which is needed for audio processing
(async () => {
  try {
    console.log('[app] Checking FFmpeg availability...');
    const ffmpegInPath = await checkFfmpegInstallation();
    
    if (!ffmpegInPath) {
      // Check if FFmpeg is in the expected directories
      const ffmpegPaths = [
        path.join(__dirname, '..', '..', 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe'),
        path.join(__dirname, '..', 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe')
      ];
      
      let ffmpegFound = false;
      for (const ffmpegPath of ffmpegPaths) {
        if (fs.existsSync(ffmpegPath)) {
          console.log(`[app] FFmpeg found at: ${ffmpegPath}`);
          ffmpegFound = true;
          
          // Add FFmpeg to process environment PATH
          process.env.PATH = `${path.dirname(ffmpegPath)}${path.delimiter}${process.env.PATH}`;
          break;
        }
      }
      
      if (!ffmpegFound) {
        console.error('[app] FFmpeg not found in expected locations, audio processing may not work correctly');
      }
    }
  } catch (error) {
    console.error('[app] FFmpeg check error:', error);
  }
})();
if (!require('fs').existsSync(transcriptDir)) {
  require('fs').mkdirSync(transcriptDir, { recursive: true });
}

// Static files
const audioDir = path.join(__dirname, 'storage/audio');
const publicDir = path.join(__dirname, 'public');
if (!require('fs').existsSync(audioDir)) {
  require('fs').mkdirSync(audioDir, { recursive: true });
}
if (!require('fs').existsSync(publicDir)) {
  require('fs').mkdirSync(publicDir, { recursive: true });
}

app.use('/uploads', express.static(uploadDir));
app.use('/transcripts', express.static(transcriptDir));

// Custom middleware for serving audio files with correct Content-Type headers for Twilio
app.use('/audio', (req, res, next) => {
  const filePath = path.join(audioDir, req.path);
  
  // Check if file exists
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'application/octet-stream'; // Default content type
    
    // Try to read metadata file if it exists
    const metaFilePath = `${filePath}.meta`;
    if (fs.existsSync(metaFilePath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metaFilePath, 'utf8'));
        if (metadata.contentType) {
          contentType = metadata.contentType;
          console.log(`Using content type from metadata: ${contentType} for ${path.basename(filePath)}`);
        }
      } catch (err) {
        console.error(`Error reading metadata for ${path.basename(filePath)}:`, err.message);
      }
    } else {
      // Set the correct Content-Type based on file extension
      if (ext === '.mp3') {
        contentType = 'audio/mpeg';
      } else if (ext === '.wav') {
        contentType = 'audio/wav';
      } else if (ext === '.ogg') {
        contentType = 'audio/ogg';
      }
      console.log(`Using content type from extension: ${contentType} for ${path.basename(filePath)}`);
    }
    
    // Get file stats to set Content-Length header
    const stats = fs.statSync(filePath);
    
    // Use writeHead instead of setHeader to ensure headers are properly set
    // This is critical for Twilio which requires proper Content-Type headers
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'  // Prevents browsers from MIME-sniffing
    });
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } else {
    // File not found
    console.error(`Audio file not found: ${filePath}`);
    res.status(404).send('Audio file not found');
  }
});

app.use('/js', express.static(path.join(publicDir, 'js')));
app.use('/css', express.static(path.join(publicDir, 'css')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      MONGODB_STATUS: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      TWILIO_CONFIGURED: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      TWILIO_PHONE: process.env.TWILIO_PHONE_NUMBER || 'not set'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error occurred:', err);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Connect to MongoDB and start server
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB successfully');
    
    // Setup API routes after MongoDB connection is established
    app.use('/api', routes);
    console.log('API routes initialized successfully');

    // Start HTTP server first
    const server = app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });

    // Initialize WebSocket server after HTTP server is ready
    server.on('listening', () => {
      try {
        const wss = new WebSocket.Server({ 
          server,
          path: '/ws',
          perMessageDeflate: false,        // Disable compression to prevent frame issues
          skipUTF8Validation: true,        // Allow binary audio data
          fragmentOutgoingMessages: false, // Prevent control frame fragmentation
          maxPayload: 65536                // Set appropriate payload size
        });
        console.log('WebSocket server created');

        if (typeof setupWebSocketServer !== 'function') {
          throw new Error('setupWebSocketServer is not available');
        }

        global.wsServer = setupWebSocketServer(wss); // This is for the /ws path
        console.log('General WebSocket server (/ws) initialized successfully');

        // LEGACY: Initialize WebSocket server for streaming audio
        const streamingWss = new WebSocket.Server({
          server,
          path: '/stream',
          clientTracking: true,
          maxPayload: 65536, // 64KB for audio chunks
          perMessageDeflate: false,        // Disable compression to prevent frame issues
          skipUTF8Validation: true,        // Allow binary audio data
          fragmentOutgoingMessages: false, // Prevent control frame fragmentation
          handleProtocols: (protocols) => {
            // Accept standard audio streaming protocols
            if (protocols && protocols.length > 0) {
              return protocols[0];
            }
            return false;
          }
        });
        console.log('Legacy streaming WebSocket server created on /stream path');

        // Set up legacy streaming WebSocket handlers
        const audioStreamService = require('./services/audioStreamService');
        
        streamingWss.on('connection', (ws, req) => {
          console.log('New legacy streaming WebSocket connection established');
          
          // Parse the URL to get call ID if available
          const url = new URL(req.url, `http://${req.headers.host}`);
          const pathParts = url.pathname.split('/');
          
          if (pathParts.length >= 4 && pathParts[3] === 'call') {
            // Handle /stream/call/:callId/audio pattern
            const callId = pathParts[4];
            console.log(`Legacy streaming WebSocket connected for call: ${callId}`);
            
            // Get or create audio stream
            let audioStream = audioStreamService.getStream(callId);
            if (!audioStream) {
              audioStream = audioStreamService.createStream(callId);
            }
            
            // Handle messages from client
            ws.on('message', (data) => {
              try {
                if (Buffer.isBuffer(data)) {
                  // Raw audio data from client
                  audioStream.push(data);
                } else {
                  // Control messages
                  const message = JSON.parse(data);
                  console.log(`Streaming control message for ${callId}:`, message.type);
                  
                  switch (message.type) {
                    case 'start':
                      audioStream.emit('streamingStart');
                      break;
                    case 'stop':
                      audioStream.emit('streamingStop');
                      break;
                    case 'barge_in':
                      audioStream.userBargedIn = true;
                      audioStream.emit('bargeIn');
                      break;
                  }
                }
              } catch (error) {
                console.error('Error processing streaming message:', error);
              }
            });
            
            // Send audio stream output to client
            audioStream.output.on('data', (chunk) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(chunk);
              }
            });
            
            // Handle stream events
            audioStream.on('streamingComplete', (data) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'complete', data }));
              }
            });
            
            audioStream.on('streamingInterrupted', (data) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'interrupted', data }));
              }
            });
            
            audioStream.on('latencyMetrics', (metrics) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'metrics', data: metrics }));
              }
            });
            
            // Send connection confirmation
            ws.send(JSON.stringify({
              type: 'connected',
              callId: callId,
              timestamp: Date.now()
            }));
          }
          
          ws.on('close', () => {
            console.log('Legacy streaming WebSocket connection closed');
          });
          
          ws.on('error', (error) => {
            console.error('Legacy streaming WebSocket error:', error);
          });
        });
        
        // NEW: Initialize enhanced real-time streaming WebSocket server
        const realTimeStreamingWss = new WebSocket.Server({
          server,
          path: '/realtime',
          clientTracking: true,
          maxPayload: 65536, // 64KB for audio chunks
          perMessageDeflate: false, // Disable compression for real-time audio
          skipUTF8Validation: true, // Skip UTF-8 validation for binary audio data
          fragmentOutgoingMessages: false // CRITICAL: Prevent control frame fragmentation (fixes Error 31924)
        });
        console.log('Enhanced real-time streaming WebSocket server created on /realtime path');
        
        // Set up enhanced real-time streaming service
        const realTimeStreamingService = require('./services/realTimeStreamingService');
        
        // Initialize real-time streaming service with WebSocket server
        realTimeStreamingService.initializeWebSocketServer(realTimeStreamingWss);
        console.log('Real-time streaming service initialized successfully');

        // Initialize WebSocket server for Twilio media streams
        const mediaWss = new WebSocket.Server({
          server,
          path: '/media',
          clientTracking: true,
          maxPayload: 65536, // 64KB for audio chunks
          perMessageDeflate: false,        // Disable compression to prevent frame issues
          skipUTF8Validation: true,        // Allow binary audio data
          fragmentOutgoingMessages: false, // CRITICAL: Prevent control frame fragmentation (fixes Error 31924)
          handleProtocols: (protocols) => {
            // Accept any protocol from Twilio
            if (protocols && protocols.length > 0) {
              console.log('Accepting protocol:', protocols[0]);
              return protocols[0];
            }
            return '';
          }
        });
        console.log('Media WebSocket server created on /media path with Twilio-specific configuration');
        
        // Use new MediaWebSocketHandler
        new MediaWebSocketHandler(mediaWss, callController);
        console.log('Twilio Media WebSocket Handler initialized successfully');
        
        // Initialize WebSocket server for Twilio streaming at /ws/twilio
        const TwilioWebSocketHandler = require('./websocket/twilioHandler');
        
        // Create single WebSocket server for bidirectional Twilio streaming
        const twilioWss = new WebSocket.Server({
          server,
          path: '/ws/twilio',
          clientTracking: true,
          maxPayload: 65536, // 64KB for audio chunks
          perMessageDeflate: false,        // CRITICAL: Disable compression to prevent frame issues
          skipUTF8Validation: true,        // Allow binary audio data
          fragmentOutgoingMessages: false, // CRITICAL: Prevent control frame fragmentation (fixes Error 31924)
          verifyClient: (info, callback) => {
            console.log('[WebSocket] Verifying client connection:', {
              origin: info.origin,
              secure: info.secure,
              url: info.req.url,
              headers: {
                upgrade: info.req.headers.upgrade,
                connection: info.req.headers.connection,
                'sec-websocket-key': info.req.headers['sec-websocket-key'] ? 'present' : 'missing',
                'sec-websocket-version': info.req.headers['sec-websocket-version'],
                'twilio-streaming-sid': info.req.headers['twilio-streaming-sid'] || 'missing'
              }
            });
            
            // Always accept the connection, even with missing headers
            callback(true, 200, 'Connection accepted');
            return true;
          },
          handleProtocols: (protocols) => {
            console.log('Twilio WebSocket protocols offered:', protocols);
            if (protocols && protocols.length > 0) {
              console.log('Accepting Twilio protocol:', protocols[0]);
              return protocols[0];
            }
            return '';
          },
          // Critical options for Twilio media streaming compatibility
          perMessageDeflate: false, // Disable compression for real-time audio
          skipUTF8Validation: true  // Skip UTF-8 validation for binary audio data
        });
        
        console.log('Twilio streaming WebSocket server created on /ws/twilio path');
        
        // Initialize Twilio WebSocket handler
        new TwilioWebSocketHandler(twilioWss, callController);
        console.log('Twilio streaming WebSocket Handler initialized successfully');
        
      } catch (wsError) {
        console.error('Failed to initialize WebSocket server:', wsError);
        // Continue running even if WebSocket setup fails
      }
    });

    // Handle server shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      server.close(() => {
        mongoose.connection.close();
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only start the server directly if this file is run directly
if (require.main === module) {
  startServer();
}

// Export the startServer function to be called from other modules
module.exports = startServer;

// Export both the app and the startServer function
module.exports = process.env.MONGODB_READY === 'true' ? startServer : app;
