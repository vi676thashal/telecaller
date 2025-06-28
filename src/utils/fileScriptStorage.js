const fs = require('fs');
const path = require('path');

// File paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const SCRIPTS_FILE = path.join(DATA_DIR, 'scripts.json');

// Make sure the data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`Created data directory: ${DATA_DIR}`);
}

// Initialize with empty array if file doesn't exist
if (!fs.existsSync(SCRIPTS_FILE)) {
  fs.writeFileSync(SCRIPTS_FILE, JSON.stringify([], null, 2));
  console.log(`Created empty scripts file: ${SCRIPTS_FILE}`);
}

// File-based script storage
const FileScriptStorage = {
  // Get all scripts
  getAllScripts: () => {
    try {
      const data = fs.readFileSync(SCRIPTS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading scripts file:', error);
      return [];
    }
  },
  
  // Get script by id
  getScript: (id) => {
    try {
      const scripts = FileScriptStorage.getAllScripts();
      return scripts.find(script => script.id === id);
    } catch (error) {
      console.error('Error getting script by id:', error);
      return null;
    }
  },
  
  // Create new script
  createScript: (scriptData) => {
    try {
      const scripts = FileScriptStorage.getAllScripts();
      const newScript = {
        id: Date.now().toString(), // Simple unique ID
        ...scriptData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      scripts.push(newScript);
      fs.writeFileSync(SCRIPTS_FILE, JSON.stringify(scripts, null, 2));
      
      return newScript;
    } catch (error) {
      console.error('Error creating script:', error);
      return null;
    }
  },
  
  // Update script
  updateScript: (id, scriptData) => {
    try {
      let scripts = FileScriptStorage.getAllScripts();
      const scriptIndex = scripts.findIndex(script => script.id === id);
      
      if (scriptIndex === -1) {
        return null;
      }
      
      const updatedScript = {
        ...scripts[scriptIndex],
        ...scriptData,
        updatedAt: new Date().toISOString()
      };
      
      scripts[scriptIndex] = updatedScript;
      fs.writeFileSync(SCRIPTS_FILE, JSON.stringify(scripts, null, 2));
      
      return updatedScript;
    } catch (error) {
      console.error('Error updating script:', error);
      return null;
    }
  },
  
  // Delete script
  deleteScript: (id) => {
    try {
      let scripts = FileScriptStorage.getAllScripts();
      const scriptIndex = scripts.findIndex(script => script.id === id);
      
      if (scriptIndex === -1) {
        return false;
      }
      
      scripts = scripts.filter(script => script.id !== id);
      fs.writeFileSync(SCRIPTS_FILE, JSON.stringify(scripts, null, 2));
      
      return true;
    } catch (error) {
      console.error('Error deleting script:', error);
      return false;
    }
  }
};

// Add some sample scripts if the file is empty
const initSampleScripts = () => {
  const scripts = FileScriptStorage.getAllScripts();
  if (scripts.length === 0) {
    console.log('Adding sample scripts to file storage...');
    
    const sampleScripts = [
      {
        name: 'Sales Introduction',
        content: 'Hello, this is [Agent Name] from SecureVoice AI. I\'m calling to discuss our innovative AI solutions that can help streamline your business operations. Do you have a few minutes to chat?',
        language: 'english',
        category: 'sales'
      },
      {
        name: 'Customer Support Follow-up',
        content: 'Hello, I\'m calling from SecureVoice AI customer support team. I wanted to follow up on your recent service request and ensure that everything was resolved to your satisfaction. Do you have any feedback for us?',
        language: 'english',
        category: 'support'
      },
      {
        name: 'Appointment Reminder',
        content: 'Hello, this is an automated reminder from SecureVoice AI. You have an upcoming appointment scheduled for [Date] at [Time]. Please call us back at [Phone Number] if you need to reschedule or have any questions.',
        language: 'english',
        category: 'reminder'
      }
    ];
    
    sampleScripts.forEach(script => {
      FileScriptStorage.createScript(script);
    });
    
    console.log('Sample scripts added successfully');
  }
};

// Initialize with sample data
initSampleScripts();

module.exports = FileScriptStorage;
