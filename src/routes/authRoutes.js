const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Routes for authentication
router.post('/login', authController.login);
router.post('/register', authController.register);

module.exports = router;
