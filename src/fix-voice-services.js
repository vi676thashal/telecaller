/**
 * Script to fix voice services and ensure they're properly configured
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const START_PORT = 8000;
const END_PORT = 8005;
const ACTIVE_PORT_FILE = path.join(__dirname, 'active_voice_clone_port.txt');

// Function to check if a port is in use
function isPortInUse(port) {
    try {
        const command = process.platform === 'win32' 
            ? `netstat -ano | find "LISTENING" | find "${port}"` 
            : `lsof -i:${port} | grep LISTEN`;
            
        const result = execSync(command, { encoding: 'utf8' });
        return result.trim() !== '';
    } catch (error) {
        return false;
    }
}

// Function to find an available port
function findAvailablePort() {
    for (let port = START_PORT; port <= END_PORT; port++) {
        if (!isPortInUse(port)) {
            console.log(`Found available port: ${port}`);
            return port;
        }
    }
    return START_PORT; // Default if all are in use
}

// Function to update the active port file
function updateActivePort(port) {
    try {
        fs.writeFileSync(ACTIVE_PORT_FILE, port.toString(), 'utf8');
        console.log(`Updated active port file to use port ${port}`);
        return true;
    } catch (error) {
        console.error(`Error updating active port file: ${error.message}`);
        return false;
    }
}

// Main function to fix voice services
async function fixVoiceServices() {
    console.log('Starting voice services fix...');
    
    // Find available port
    const port = findAvailablePort();
    
    // Update active port file
    updateActivePort(port);
    
    console.log(`Voice services configured to use port ${port}`);
    console.log('Fix completed.');
}

// Run the fix
fixVoiceServices().catch(error => {
    console.error(`Error fixing voice services: ${error.message}`);
    process.exit(1);
});
