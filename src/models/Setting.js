const mongoose = require('mongoose');

// List of keys that should never be stored in the database
const restrictedKeys = ['ngrokUrl', 'NGROK_URL', 'websocketUrl', 'WebSocketUrl', 'WS_URL'];

const SettingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(key) {
        // Don't allow storing WebSocket/ngrok URLs in the database
        // These must be configured through the .env file only
        return !restrictedKeys.includes(key);
      },
      message: props => `${props.value} is a restricted key. WebSocket URLs must be configured in the .env file only.`
    }
  },
  value: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Setting', SettingSchema);
