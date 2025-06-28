/**
 * Content Management Controller
 *
 * Handles content management for voice scripts and prompts
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');

// Get all scripts
router.get('/scripts', (req, res) => {
  res.status(200).json({ 
    scripts: [],
    message: 'Content management controller is working'
  });
});

// Get all prompts
router.get('/prompts', (req, res) => {
  res.status(200).json({ 
    prompts: [],
    message: 'Content management controller is working'
  });
});

module.exports = router;
