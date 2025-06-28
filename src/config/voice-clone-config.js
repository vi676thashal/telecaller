// Voice cloning service port configuration
// This dynamically selects the port for voice cloning service
// by checking the active_voice_clone_port.txt file first, 
// then config/voice-service-config.js, or defaults to 8000

const fs = require('fs');
const path = require('path');

function getVoiceClonePort() {
    try {
        // First check if we have an active port file
        const activePortPath = path.join(__dirname, '..', 'active_voice_clone_port.txt');
        if (fs.existsSync(activePortPath)) {
            const port = parseInt(fs.readFileSync(activePortPath, 'utf8').trim());
            if (!isNaN(port)) {
                console.log(`[VoiceCloneConfig] Using port ${port} from active_voice_clone_port.txt`);
                return port;
            }
        }
        
        // Then check the config file
        const configPath = path.join(__dirname, 'config', 'voice-service-config.js');
        if (fs.existsSync(configPath)) {
            try {
                const config = require(configPath);
                if (config && config.port) {
                    console.log(`[VoiceCloneConfig] Using port ${config.port} from config file`);
                    return config.port;
                }
            } catch (err) {
                // Config file exists but couldn't be parsed
            }
        }
        
        // Default value
        console.log('[VoiceCloneConfig] Using default port 8000');
        return 8000;
    } catch (err) {
        console.error('[VoiceCloneConfig] Error getting voice clone port:', err);
        return 8000; // Default fallback
    }
}

// Export the voice cloning port
module.exports = {
    port: getVoiceClonePort()
};
