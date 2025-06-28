/**
 * Utility to manage the active voice clone port file
 * This helps with consistent reading and writing of the port file
 * to avoid issues with file formatting
 */
const fs = require('fs');
const path = require('path');

class PortFileManager {
  constructor() {
    this.portFilePath = path.join(__dirname, '..', '..', 'active_voice_clone_port.txt');
  }

  /**
   * Read the active port from the file
   * @returns {number|null} The port number or null if not found
   */
  readActivePort() {
    try {
      if (fs.existsSync(this.portFilePath)) {
        const content = fs.readFileSync(this.portFilePath, 'utf8').trim();
        const port = parseInt(content, 10);
        if (!isNaN(port) && port > 0) {
          return port;
        }
      }
      return null;
    } catch (error) {
      console.error(`[PortFileManager] Error reading active port file: ${error.message}`);
      return null;
    }
  }

  /**
   * Write the port number to the file
   * @param {number} port - The port number to save
   * @returns {boolean} Whether the operation was successful
   */
  writeActivePort(port) {
    try {
      if (port && !isNaN(port) && port > 0) {
        fs.writeFileSync(this.portFilePath, port.toString(), 'utf8');
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[PortFileManager] Error writing active port file: ${error.message}`);
      return false;
    }
  }

  /**
   * Ensure the port file exists with a valid port number
   * @param {number} defaultPort - The default port to use if file doesn't exist
   * @returns {number|null} The port number or null on failure
   */
  ensurePortFile(defaultPort = 8001) {
    const existingPort = this.readActivePort();
    if (existingPort) {
      return existingPort;
    }
    
    if (this.writeActivePort(defaultPort)) {
      return defaultPort;
    }
    
    return null;
  }
}

module.exports = new PortFileManager();
