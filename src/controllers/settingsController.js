const Setting = require('../models/Setting');

// Controller for settings management
const settingsController = {
  // Get all settings
  getSettings: async (req, res) => {
    try {
      const settings = await Setting.find();
      
      // Add a note about WebSocket configuration
      const response = {
        settings: settings,
        _note: "WebSocket ngrok URL is configured only through the .env file, not from the database."
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching settings:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  
  // Update settings
  updateSettings: async (req, res) => {
    try {
      const settingsArray = req.body;
      
      if (!Array.isArray(settingsArray)) {
        return res.status(400).json({ message: 'Settings must be provided as an array' });
      }
      
      const updatedSettings = [];
      
      // Update each setting
      for (const setting of settingsArray) {
        const { key, value } = setting;
        
        if (!key || value === undefined) {
          continue;
        }
        
        // Prevent storing WebSocket/ngrok URL in the database
        // This must be configured through the .env file only
        if (key === 'ngrokUrl' || key === 'websocketUrl' || key === 'NGROK_URL') {
          console.warn('Attempt to store ngrok/websocket URL in database rejected. This must be set in the .env file.');
          continue;
        }
        
        // Find existing setting or create new one
        let existingSetting = await Setting.findOne({ key });
        
        if (existingSetting) {
          existingSetting.value = value;
          await existingSetting.save();
          updatedSettings.push(existingSetting);
        } else {
          const newSetting = new Setting({ key, value });
          await newSetting.save();
          updatedSettings.push(newSetting);
        }
      }
      
      res.json(updatedSettings);
    } catch (error) {
      console.error('Error updating settings:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
};

module.exports = settingsController;
