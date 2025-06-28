const Script = require('../models/Script');
const FileScriptStorage = require('../utils/fileScriptStorage');

// Helper function to check if MongoDB is available
function isMongoDBAvailable() {
  // Use the global MongoDB availability check if it exists
  if (typeof global.isMongoDBAvailable === 'function') {
    return global.isMongoDBAvailable();
  }
  
  // Otherwise, assume MongoDB is available unless we know it isn't
  return global.mongoDBAvailable !== false;
}

// Controller for script management with file fallback capability
const scriptController = {
  // Get all scripts
  getAllScripts: async (req, res) => {
    try {
      if (isMongoDBAvailable()) {
        // Try to use MongoDB
        const scripts = await Script.find().sort({ createdAt: -1 });
        return res.json(scripts);
      } else {
        // Fall back to file storage
        console.log('MongoDB unavailable, using file fallback for getAllScripts');
        const scripts = FileScriptStorage.getAllScripts();
        return res.json(scripts);
      }
    } catch (error) {
      console.error('Error fetching scripts:', error);
      
      // If we get here with a MongoDB error, try the file fallback
      try {
        console.log('Error with MongoDB, using file fallback for getAllScripts');
        const scripts = FileScriptStorage.getAllScripts();
        return res.json(scripts);
      } catch (fallbackError) {
        // If even the fallback fails, return an error
        console.error('File fallback also failed:', fallbackError);
        return res.status(500).json({ message: 'Server error' });
      }
    }
  },
  
  // Get single script
  getScript: async (req, res) => {
    try {
      if (isMongoDBAvailable()) {
        // Try to use MongoDB
        const script = await Script.findById(req.params.id);
        
        if (!script) {
          // If not found in MongoDB, try file storage as fallback
          const fileScript = FileScriptStorage.getScript(req.params.id);
          if (fileScript) {
            return res.json(fileScript);
          }
          return res.status(404).json({ message: 'Script not found' });
        }
        
        return res.json(script);
      } else {
        // MongoDB unavailable, use file storage
        console.log('MongoDB unavailable, using file fallback for getScript');
        const script = FileScriptStorage.getScript(req.params.id);
        
        if (!script) {
          return res.status(404).json({ message: 'Script not found' });
        }
        
        return res.json(script);
      }
    } catch (error) {
      console.error('Error fetching script:', error);
      
      // Try file fallback if MongoDB error
      try {
        const script = FileScriptStorage.getScript(req.params.id);
        if (script) {
          return res.json(script);
        }
        return res.status(404).json({ message: 'Script not found' });
      } catch (fallbackError) {
        return res.status(500).json({ message: 'Server error' });
      }
    }
  },
  
  // Create new script
  createScript: async (req, res) => {
    try {
      const { name, content, language, category } = req.body;
      
      // Validate input
      if (!name || !content || !language) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      if (isMongoDBAvailable()) {
        // Try to use MongoDB
        const script = new Script({
          name,
          content,
          language,
          category: category || 'general'
        });
        
        await script.save();
        return res.status(201).json(script);
      } else {
        // Fall back to file storage
        console.log('MongoDB unavailable, using file fallback for createScript');
        const script = FileScriptStorage.createScript({
          name,
          content,
          language,
          category: category || 'general',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        return res.status(201).json(script);
      }
    } catch (error) {
      console.error('Error creating script:', error);
      
      // Try file fallback if MongoDB error
      try {
        console.log('Error with MongoDB, using file fallback for createScript');
        const { name, content, language, category } = req.body;
        
        const script = FileScriptStorage.createScript({
          name,
          content,
          language,
          category: category || 'general',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        return res.status(201).json(script);
      } catch (fallbackError) {
        console.error('File fallback also failed:', fallbackError);
        return res.status(500).json({ message: 'Server error' });
      }
    }
  },
  
  // Update script
  updateScript: async (req, res) => {
    try {
      // Allow partial updates
      const updates = {};
      ['name', 'content', 'language', 'category'].forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: 'No valid fields to update' });
      }
      
      if (isMongoDBAvailable()) {
        // Try to use MongoDB
        const script = await Script.findByIdAndUpdate(
          req.params.id,
          updates,
          { new: true }
        );
        
        if (!script) {
          // If not found in MongoDB, try file storage
          const fileScript = FileScriptStorage.updateScript(req.params.id, updates);
          if (fileScript) {
            return res.json(fileScript);
          }
          return res.status(404).json({ message: 'Script not found' });
        }
        
        return res.json(script);
      } else {
        // MongoDB unavailable, use file storage
        console.log('MongoDB unavailable, using file fallback for updateScript');
        const script = FileScriptStorage.updateScript(req.params.id, updates);
        
        if (!script) {
          return res.status(404).json({ message: 'Script not found' });
        }
        
        return res.json(script);
      }
    } catch (error) {
      console.error('Error updating script:', error);
      
      // Try file fallback if MongoDB error
      try {
        const script = FileScriptStorage.updateScript(req.params.id, req.body);
        if (script) {
          return res.json(script);
        }
        return res.status(404).json({ message: 'Script not found' });
      } catch (fallbackError) {
        console.error('File fallback also failed:', fallbackError);
        return res.status(500).json({ message: 'Server error' });
      }
    }
  },
  
  // Delete script
  deleteScript: async (req, res) => {
    try {
      if (isMongoDBAvailable()) {
        // Try to use MongoDB
        const script = await Script.findByIdAndDelete(req.params.id);
        
        if (!script) {
          // If not found in MongoDB, try file storage
          const result = FileScriptStorage.deleteScript(req.params.id);
          if (result) {
            return res.json({ message: 'Script deleted successfully' });
          }
          return res.status(404).json({ message: 'Script not found' });
        }
        
        return res.json({ message: 'Script deleted successfully' });
      } else {
        // MongoDB unavailable, use file storage
        console.log('MongoDB unavailable, using file fallback for deleteScript');
        const result = FileScriptStorage.deleteScript(req.params.id);
        
        if (!result) {
          return res.status(404).json({ message: 'Script not found' });
        }
        
        return res.json({ message: 'Script deleted successfully' });
      }
    } catch (error) {
      console.error('Error deleting script:', error);
      
      // Try file fallback if MongoDB error
      try {
        const result = FileScriptStorage.deleteScript(req.params.id);
        if (result) {
          return res.json({ message: 'Script deleted successfully' });
        }
        return res.status(404).json({ message: 'Script not found' });
      } catch (fallbackError) {
        console.error('File fallback also failed:', fallbackError);
        return res.status(500).json({ message: 'Server error' });
      }
    }
  },
  
  // Validate speak endpoint for text-to-speech functionality
  validateSpeakEndpoint: async (req, res) => {
    try {
      let script;
      
      if (isMongoDBAvailable()) {
        // Try to get from MongoDB first
        script = await Script.findById(req.params.id);
      }
      
      // If not found in MongoDB or MongoDB unavailable, try file storage
      if (!script) {
        script = FileScriptStorage.getScript(req.params.id);
      }
      
      if (!script) {
        return res.status(404).json({ message: 'Script not found' });
      }
      
      // Just validate that the endpoint exists and can find the script
      res.json({ 
        status: 'ok',
        message: 'Script speak endpoint is available and configured correctly',
        scriptId: req.params.id,
        scriptFound: true
      });
    } catch (error) {
      console.error('Error validating script endpoint:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
};

module.exports = scriptController;
