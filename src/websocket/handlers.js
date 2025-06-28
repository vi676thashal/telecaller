const WebSocket = require('ws');

// WebSocket server handlers
const setupWebSocketServer = (wss) => {
  if (!wss) {
    throw new Error('WebSocket.Server instance is required');
  }

  console.log('Setting up WebSocket server...');
  
  // Store active connections
  const clients = new Map();
  
  // Heartbeat to keep connections alive
  const heartbeat = (ws) => {
    ws.isAlive = true;
    ws.lastPing = Date.now();
  };
  
  // Handle new connections
  wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection established');
    
    // Setup heartbeat
    ws.isAlive = true;
    ws.lastPing = Date.now();
    ws.on('pong', () => heartbeat(ws));
    
    // Add client to map with a unique ID
    const clientId = Date.now();
    clients.set(clientId, ws);
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to SecureVoice AI WebSocket Server'
    }));
    
    // Handle incoming messages
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        console.log('Received WebSocket message:', data);
        
        // Handle different message types
        switch (data.type) {
          case 'ping':
            heartbeat(ws);
            ws.send(JSON.stringify({ 
              type: 'pong',
              timestamp: Date.now()
            }));
            break;
            
          case 'start_call':
            try {
              // Handle call start
              ws.send(JSON.stringify({
                type: 'call_status',
                status: 'started',
                callId: data.callId
              }));
            } catch (error) {
              console.error('Error handling start_call:', error);
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Failed to start call'
              }));
            }
            break;
            
          default:
            console.log('Unknown message type:', data.type);
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Unknown message type'
            }));
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process message'
        }));
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      console.log('Client disconnected');
      clients.delete(clientId);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(clientId);
    });
  });

  // Ping clients every 30 seconds to keep connections alive
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false || Date.now() - ws.lastPing > 90000) { // 90 seconds timeout
        clients.forEach((client, id) => {
          if (client === ws) {
            console.log('Terminating inactive connection');
            clients.delete(id);
          }
        });
        return ws.terminate();
      }
      
      ws.isAlive = false;
      try {
        ws.ping();
      } catch (error) {
        console.error('Error sending ping:', error);
        ws.terminate();
      }
    });
  }, 30000);

  // Clean up on server close
  wss.on('close', () => {
    clearInterval(interval);
    clients.forEach((ws) => {
      try {
        ws.close();
      } catch (error) {
        console.error('Error closing connection:', error);
      }
    });
    clients.clear();
  });

  return {
    clients,
    broadcast: (message) => {
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(JSON.stringify(message));
          } catch (error) {
            console.error('Error broadcasting message:', error);
          }
        }
      });
    }
  };
};

// Export the setup function
module.exports = setupWebSocketServer;
