const Prompt = require('../models/Prompt');

// Controller for prompt management
const promptController = {
  // Get all prompts
  getAllPrompts: async (req, res) => {
    try {
      const prompts = await Prompt.find().sort({ createdAt: -1 });
      res.json(prompts);
    } catch (error) {
      console.error('Error fetching prompts:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  
  // Get single prompt
  getPrompt: async (req, res) => {
    try {
      const prompt = await Prompt.findById(req.params.id);
      
      if (!prompt) {
        return res.status(404).json({ message: 'Prompt not found' });
      }
      
      res.json(prompt);
    } catch (error) {
      console.error('Error fetching prompt:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  
  // Create new prompt
  createPrompt: async (req, res) => {
    try {
      const { name, content } = req.body;
      
      // Validate input
      if (!name || !content) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      // Create prompt
      const prompt = new Prompt({
        name,
        content
      });
      
      await prompt.save();
      
      res.status(201).json(prompt);
    } catch (error) {
      console.error('Error creating prompt:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  
  // Update prompt
  updatePrompt: async (req, res) => {
    try {
      const { name, content } = req.body;
      
      // Validate input
      if (!name || !content) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      // Find and update prompt
      const prompt = await Prompt.findByIdAndUpdate(
        req.params.id,
        { name, content },
        { new: true }
      );
      
      if (!prompt) {
        return res.status(404).json({ message: 'Prompt not found' });
      }
      
      res.json(prompt);
    } catch (error) {
      console.error('Error updating prompt:', error);
      res.status(500).json({ message: 'Server error' });
    }
  },
  
  // Delete prompt
  deletePrompt: async (req, res) => {
    try {
      const prompt = await Prompt.findByIdAndDelete(req.params.id);
      
      if (!prompt) {
        return res.status(404).json({ message: 'Prompt not found' });
      }
      
      res.json({ message: 'Prompt deleted successfully' });
    } catch (error) {
      console.error('Error deleting prompt:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
};

module.exports = promptController;
