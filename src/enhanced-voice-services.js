/**
 * Enhanced script to fix voice services and ensure they're properly configured
 */
const fs = require('fs');
const path = require('path');
const { execSync, exec } = require('child_process');
const http = require('http');

// Configuration
const START_PORT = 8000;
const END_PORT = 8050; // Expanded port range for more options
const ACTIVE_PORT_FILE = path.join(__dirname, 'active_voice_clone_port.txt');
const CONFIG_FILE = path.join(__dirname, 'config', 'voice_service.json');

// Function to check if a port is in use
function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = http.createServer();
        
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true); // Port is in use
            } else {
                resolve(false); // Other error, assume port is free
            }
        });
        
        server.once('listening', () => {
            server.close();
            resolve(false); // Port is free
        });
        
        server.listen(port);
    });
}

// Function to find an available port
async function findAvailablePort() {
    console.log('Scanning for available ports...');
    for (let port = START_PORT; port <= END_PORT; port++) {
        const inUse = await isPortInUse(port);
        if (!inUse) {
            console.log(`Found available port: ${port}`);
            return port;
        }
    }
    console.warn('No available ports found in range, using default');
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

// Function to update configuration file if it exists
function updateConfigFile(port) {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            config.voiceServicePort = port;
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
            console.log(`Updated configuration file with port ${port}`);
        } else {
            console.log('Configuration file not found, creating...');
            // Create directory if it doesn't exist
            const configDir = path.dirname(CONFIG_FILE);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            // Create basic config
            const config = { 
                voiceServicePort: port,
                retryAttempts: 3,
                timeout: 10000
            };
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
            console.log(`Created new configuration file with port ${port}`);
        }
        return true;
    } catch (error) {
        console.error(`Error updating config file: ${error.message}`);
        return false;
    }
}

// Function to check and fix any process blocking voice ports
async function terminateBlockingProcesses() {
    try {
        console.log('Checking for processes blocking voice service ports...');
        for (let port = START_PORT; port <= END_PORT; port++) {
            if (await isPortInUse(port)) {
                console.log(`Port ${port} is in use, attempting to free it...`);
                
                try {
                    if (process.platform === 'win32') {
                        // Find PID using the port on Windows
                        const command = `netstat -ano | findstr :${port} | findstr LISTENING`;
                        const output = execSync(command, { encoding: 'utf8' });
                        
                        if (output) {
                            const lines = output.trim().split('\n');
                            if (lines.length > 0) {
                                const pid = lines[0].trim().split(/\s+/).pop();
                                
                                if (pid && /^\d+$/.test(pid)) {
                                    console.log(`Found process ${pid} using port ${port}, terminating...`);
                                    execSync(`taskkill /F /PID ${pid}`);
                                    console.log(`Successfully terminated process ${pid}`);
                                }
                            }
                        }
                    } else {
                        // Unix-like systems
                        const command = `lsof -i:${port} -t`;
                        const output = execSync(command, { encoding: 'utf8' });
                        
                        if (output) {
                            const pid = output.trim();
                            if (pid) {
                                console.log(`Found process ${pid} using port ${port}, terminating...`);
                                execSync(`kill -9 ${pid}`);
                                console.log(`Successfully terminated process ${pid}`);
                            }
                        }
                    }
                } catch (execError) {
                    console.warn(`Could not terminate process on port ${port}: ${execError.message}`);
                }
            }
        }
    } catch (error) {
        console.error(`Error checking for blocking processes: ${error.message}`);
    }
}

// Function to test if a port is actually available for the voice service
async function testVoiceService(port) {
    return new Promise((resolve) => {
        const request = http.request({
            host: 'localhost',
            port: port,
            path: '/health',
            method: 'GET',
            timeout: 3000
        }, (response) => {
            let data = '';
            
            response.on('data', (chunk) => {
                data += chunk;
            });
            
            response.on('end', () => {
                try {
                    if (response.statusCode === 200) {
                        console.log(`Voice service is responding on port ${port}`);
                        resolve(true);
                    } else {
                        console.log(`Voice service returned status ${response.statusCode} on port ${port}`);
                        resolve(false);
                    }
                } catch (error) {
                    console.log(`Error parsing voice service response: ${error.message}`);
                    resolve(false);
                }
            });
        });
        
        request.on('error', () => {
            console.log(`Voice service not available on port ${port}`);
            resolve(false);
        });
        
        request.on('timeout', () => {
            request.destroy();
            console.log(`Voice service connection timed out on port ${port}`);
            resolve(false);
        });
        
        request.end();
    });
}

// Main function to fix voice services
async function fixVoiceServices() {
    console.log('Starting enhanced voice services fix...');
    
    // Check and terminate any processes blocking our ports
    await terminateBlockingProcesses();
    
    // Wait a bit for ports to be freed
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Find available port
    const port = await findAvailablePort();
    
    // Update active port file
    updateActivePort(port);
    
    // Update config file if it exists
    updateConfigFile(port);
    
    // Test the voice service on this port
    const isServiceWorking = await testVoiceService(port);
    
    console.log(`Voice services configured to use port ${port}`);
    console.log(`Voice service is ${isServiceWorking ? 'working' : 'not responding'}`);
    console.log('Fix completed.');
    
    return {
        port,
        isWorking: isServiceWorking
    };
}

// Run the fix
fixVoiceServices().then(result => {
    console.log(`Voice service fix completed with port ${result.port} (working: ${result.isWorking})`);
}).catch(error => {
    console.error(`Error fixing voice services: ${error.message}`);
    process.exit(1);
});
