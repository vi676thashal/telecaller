const express = require('express');
const router = express.Router();
const { logger } = require('../services/loggingService');
const path = require('path');
const fs = require('fs');

// Health status storage
let healthStatus = {
  status: 'initializing',
  lastCheck: null,
  modelStatus: {},
  errors: []
};

// Check if voice cloning model files exist
function checkModelFiles() {
  const modelPath = path.join(__dirname, '../voice_cloning_service/models');
  try {
    const files = fs.readdirSync(modelPath);
    return files.length > 0;
  } catch (error) {
    logger.error('Error checking model files:', error);
    return false;
  }
}

// Check system resources
async function checkResources() {
  const resources = {
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  };
  
  return {
    memoryOk: resources.memory.heapUsed < 1.5 * 1024 * 1024 * 1024, // 1.5GB limit
    cpuOk: true // Add proper CPU check if needed
  };
}

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    // Check model files
    const modelsExist = checkModelFiles();
    
    // Check system resources
    const resources = await checkResources();
    
    // Update health status
    healthStatus = {
      status: modelsExist && resources.memoryOk && resources.cpuOk ? 'healthy' : 'unhealthy',
      lastCheck: new Date(),
      modelStatus: {
        modelsExist,
        modelPath: path.join(__dirname, '../voice_cloning_service/models')
      },
      resources,
      errors: []
    };
    
    // Log health check
    logger.info('Voice cloning health check:', healthStatus);
    
    res.json(healthStatus);
  } catch (error) {
    logger.error('Health check failed:', error);
    
    healthStatus = {
      status: 'error',
      lastCheck: new Date(),
      errors: [error.message]
    };
    
    res.status(500).json(healthStatus);
  }
});

// Detailed diagnostics endpoint
router.get('/diagnostics', async (req, res) => {
  try {
    const diagnostics = {
      system: {
        platform: process.platform,
        arch: process.arch,
        version: process.version,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      },
      models: {
        path: path.join(__dirname, '../voice_cloning_service/models'),
        files: fs.readdirSync(path.join(__dirname, '../voice_cloning_service/models'))
      },
      runtime: {
        uptime: process.uptime(),
        pid: process.pid
      }
    };
    
    res.json(diagnostics);
  } catch (error) {
    logger.error('Diagnostics failed:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
