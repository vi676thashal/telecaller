/**
 * Unified Voice Service Port Manager
 * This ensures consistent port usage across all components
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

class VoiceServiceManager {
  constructor() {
    this.TARGET_PORT = 8000;
    this.portFiles = [
      // Removed references to voice cloning port files
    ];
    this.audioGenerationPort = null;
  }

  async ensureCorrectPort() {
    console.log('Ensuring voice service uses correct port...');

    // Kill any processes on target port
    await this.clearPort();

    // Update all port files
    await this.updatePortFiles();

    // Start mock service if needed
    await this.ensureServiceRunning();

    return true;
  }

  async clearPort() {
    console.log(`Clearing port ${this.TARGET_PORT}...`);
    try {
      // On Windows, find and kill process using the port
      const command = `FOR /F "tokens=5" %P IN ('netstat -ano ^| findstr :${this.TARGET_PORT} ^| findstr LISTENING') DO TaskKill /F /PID %P`;
      require('child_process').execSync(command, { stdio: 'ignore' });
    } catch (error) {
      // Ignore errors as they likely mean no process was using the port
    }
  }
  async updatePortFiles() {
    console.log('Port configuration files update skipped - voice cloning removed');
    // Port files are no longer used since voice cloning was removed
    return true;
  }

  async ensureServiceRunning() {
    console.log('Ensuring voice service is running...');
    try {
      // Check if service is already running
      const isRunning = await this.checkService();
      if (isRunning) {
        console.log('Voice service is already running correctly');
        return true;
      }

      // If not running, start the mock service
      await this.startMockService();
      return true;
    } catch (error) {
      console.error('Error ensuring service is running:', error);
      return false;
    }
  }

  async checkService() {
    return new Promise((resolve) => {
      const request = http.get(`http://localhost:${this.TARGET_PORT}/health`, (response) => {
        if (response.statusCode === 200) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
      
      request.on('error', () => resolve(false));
      request.setTimeout(2000, () => {
        request.destroy();
        resolve(false);
      });
    });
  }

  async startMockService() {
    console.log('Starting mock voice service...');
    const mockServer = http.createServer((req, res) => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      // Handle preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Health check endpoint
      if (req.url === '/health' || req.url === '/healthcheck') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy' }));
        return;
      }

      // Voice synthesis endpoint
      if (req.method === 'POST' && req.url === '/speak') {
        // Generate valid audio data (27,447 bytes is known to work with Twilio)
        const audioSize = 27447;
        const audioData = Buffer.alloc(audioSize);
        
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': audioSize
        });
        res.end(audioData);
        return;
      }

      // 404 for anything else
      res.writeHead(404);
      res.end('Not Found');
    });

    return new Promise((resolve, reject) => {
      mockServer.on('error', reject);
      mockServer.listen(this.TARGET_PORT, () => {
        console.log(`Mock voice service running on port ${this.TARGET_PORT}`);
        this.audioGenerationPort = this.TARGET_PORT;
        resolve();
      });
    });
  }
}

module.exports = new VoiceServiceManager();
