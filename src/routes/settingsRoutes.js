const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');

// Routes for settings management
router.get('/', settingsController.getSettings);
router.put('/', settingsController.updateSettings);

module.exports = router;
