const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Controller for authentication
const authController = {
  // Login user
  login: async (req, res) => {
    try {
      const { username, password } = req.body;
      
      // Check if user exists
      const user = await User.findOne({ username });
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Check password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Generate JWT token
      const token = jwt.sign(
        { id: user._id, username: user.username, role: user.role },
        process.env.JWT_SECRET || 'securevoice_secret',
        { expiresIn: '1d' }
      );
      
      res.json({
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  
  // Register new user
  register: async (req, res) => {
    try {
      const { username, email, password, role } = req.body;
      
      // Check if user already exists
      let user = await User.findOne({ $or: [{ username }, { email }] });
      if (user) {
        return res.status(400).json({ message: 'User already exists' });
      }
      
      // Create new user
      user = new User({
        username,
        email,
        password,
        role: role || 'user'
      });
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
      
      // Save user
      await user.save();
      
      // Generate JWT token
      const token = jwt.sign(
        { id: user._id, username: user.username, role: user.role },
        process.env.JWT_SECRET || 'securevoice_secret',
        { expiresIn: '1d' }
      );
      
      res.status(201).json({
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
};

module.exports = authController;
