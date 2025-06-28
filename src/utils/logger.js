const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define the custom logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'voice-provider-service' },
  transports: [
    // Write logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service }) => {
          return `${timestamp} [${service}] ${level}: ${message}`;
        })
      )
    }),
    // Write all logs to consolidated log file
    new winston.transports.File({ 
      filename: path.join(logsDir, 'voice-provider-service.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    // Write error logs to separate error log file
    new winston.transports.File({ 
      filename: path.join(logsDir, 'errors.log'), 
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ],
});

// If we're not in production, also log to console with simpler format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Add startTimer and endTimer utility functions
const activeTimers = new Map();

logger.startTimer = function(label, metadata = {}) {
  const timerId = `${label}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const start = Date.now();
  
  activeTimers.set(timerId, {
    start,
    label,
    metadata
  });
  
  return timerId;
};

logger.endTimer = function(timerId, additionalMetadata = {}) {
  const timerData = activeTimers.get(timerId);
  if (!timerData) {
    logger.warn(`Timer with ID ${timerId} not found`);
    return 0;
  }
  
  const duration = Date.now() - timerData.start;
  activeTimers.delete(timerId);
  
  return duration;
};

module.exports = { logger };
