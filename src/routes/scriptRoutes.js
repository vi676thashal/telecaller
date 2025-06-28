const express = require('express');
const router = express.Router();
const scriptController = require('../controllers/scriptController');

// Routes for script management
router.get('/', scriptController.getAllScripts);
router.get('/:id', scriptController.getScript);
router.post('/', scriptController.createScript);
router.put('/:id', scriptController.updateScript);
router.delete('/:id', scriptController.deleteScript);

// Optional route for validation endpoint - only if the controller has this method
if (typeof scriptController.validateSpeakEndpoint === 'function') {
  router.get('/:id/validate', scriptController.validateSpeakEndpoint);
} 

module.exports = router;
