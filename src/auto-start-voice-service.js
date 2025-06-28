/**
 * Auto-start voice service script
 * This script automatically starts the voice cloning service and ensures it's running
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Configuration
const VOICE_SERVICE_PATH = path.join(__dirname, 'services', 'voiceCloneService.js');
const VOICE_SERVER_PATH = path.join(__dirname, '..', 'voice-server');
const ACTIVE_PORT_FILE = path.join(__dirname, '..', 'active_voice_clone_port.txt');
const START_PORT = 8000;
const END_PORT = 8020;
const MAX_STARTUP_TIME = 20000; // 20 seconds
const CHECK_INTERVAL = 500; // 500ms

// Function to check if a port is available
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = http.createServer();
        
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(false); // Port is in use
            } else {
                resolve(true); // Other error, still consider port available
            }
        });
        
        server.once('listening', () => {
            server.close();
            resolve(true); // Port is free
        });
        
        server.listen(port);
    });
}

// Function to find an available port
async function findAvailablePort() {
    console.log('Scanning for available ports...');
    for (let port = START_PORT; port <= END_PORT; port++) {
        const available = await isPortAvailable(port);
        if (available) {
            console.log(`Found available port: ${port}`);
            return port;
        }
    }
    throw new Error('No available ports found in range');
}

// Function to check if voice service is responding
async function checkVoiceService(port, maxAttempts = 10) {
    return new Promise((resolve) => {
        let attempts = 0;
        const checkInterval = setInterval(async () => {
            attempts++;
            try {
                const response = await fetch(`http://localhost:${port}/healthcheck`);
                if (response.ok) {
                    clearInterval(checkInterval);
                    console.log(`Voice service is running on port ${port}`);
                    resolve(true);
                    return;
                }
            } catch (error) {
                // Service not ready yet
            }
            
            if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                console.log(`Voice service not responding after ${attempts} attempts on port ${port}`);
                resolve(false);
            }
        }, CHECK_INTERVAL);
    });
}

// Function to start the voice cloning service
async function startVoiceService(port) {
    console.log(`Starting voice service on port ${port}...`);
    
    // First try to find the voice clone server binary directly
    const paths = [
        path.join(__dirname, '..', 'voice-server'),
        path.join(__dirname, '..', '..', 'voice-server'),
        path.join(__dirname, '..', '..', '..', 'voice-server')
    ];
    
    let voiceServerPath = null;
    
    for (const testPath of paths) {
        if (fs.existsSync(testPath)) {
            const packagePath = path.join(testPath, 'package.json');
            if (fs.existsSync(packagePath)) {
                try {
                    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
                    if (packageData && packageData.name && packageData.name.includes('voice')) {
                        voiceServerPath = testPath;
                        break;
                    }
                } catch (e) {
                    console.warn(`Error reading package.json at ${packagePath}: ${e.message}`);
                }
            }
        }
    }
    
    if (!voiceServerPath) {
        console.warn("Voice server directory not found in common locations. Using default path.");
        voiceServerPath = VOICE_SERVER_PATH;
    }
    
    // Check if the voice server directory exists
    if (!fs.existsSync(voiceServerPath)) {
        console.error(`Voice server directory not found: ${voiceServerPath}`);
        // Try direct binary approach instead
        try {
            console.log("Trying to start voice service directly...");
            // Look for the executable in common locations
            const possibleBinaries = [
                path.join(__dirname, '..', 'bin', 'voice-server.exe'),
                path.join(__dirname, '..', 'bin', 'voice-clone-server.exe'),
                path.join(__dirname, '..', 'voice-server.exe'),
                path.join(__dirname, '..', '..', 'bin', 'voice-server.exe')
            ];
            
            let binaryPath = null;
            for (const bin of possibleBinaries) {
                if (fs.existsSync(bin)) {
                    binaryPath = bin;
                    break;
                }
            }
            
            if (binaryPath) {
                const voiceProcess = spawn(binaryPath, [`--port=${port}`], {
                    detached: true,
                    stdio: 'ignore'
                });
                voiceProcess.unref();
                console.log(`Started voice binary from ${binaryPath} with port ${port}`);
            } else {
                return false;
            }
        } catch (e) {
            console.error(`Failed to start voice binary: ${e.message}`);
            return false;
        }
    } else {
        // We'll use npm start to start the voice service
        try {
            const voiceProcess = spawn('npm', ['run', 'start', '--', `--port=${port}`], {
                cwd: voiceServerPath,
                shell: true,
                detached: true,
                stdio: 'ignore'
            });
            
            // Unref the process so it can run independently
            voiceProcess.unref();
            
            console.log(`Voice service process started from ${voiceServerPath}`);
        } catch (e) {
            console.error(`Error starting npm process: ${e.message}`);
            return false;
        }
    }
    
    // Update the active port file
    try {
        fs.writeFileSync(ACTIVE_PORT_FILE, port.toString(), 'utf8');
        console.log(`Updated active port file to use port ${port}`);
    } catch (error) {
        console.error(`Error updating active port file: ${error.message}`);
    }
    
    // Check if the service is responding
    console.log(`Waiting for service to respond on port ${port}...`);
    const isResponding = await checkVoiceService(port, 30); // Increased attempts
    return isResponding;
}

// Function to ensure voice service is ready
async function ensureVoiceServiceRunning() {
    try {
        // First try to find an unused port
        const port = await findAvailablePort();
        
        // Start the voice service on the available port
        const serviceStarted = await startVoiceService(port);
        
        if (serviceStarted) {
            console.log(`Voice service successfully started on port ${port}`);
            return port;
        } else {
            console.error('Failed to start voice service');
            throw new Error('Voice service failed to start');
        }
    } catch (error) {
        console.error(`Error ensuring voice service is running: ${error.message}`);
        throw error;
    }
}

// Main function
async function main() {
    try {
        console.log('Starting voice service automation...');
        const port = await ensureVoiceServiceRunning();
        console.log(`Voice service is running on port ${port}`);
    } catch (error) {
        console.error('Failed to ensure voice service is running:', error);
        process.exit(1);
    }
}

// Run the main function
main();
