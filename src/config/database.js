const mongoose = require('mongoose');
require('dotenv').config();

const connectToDatabase = async () => {
  try {
    console.log('Connecting to MongoDB...');
    
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/secureVoiceAI';
    
    const connectionOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT) || 30000,
      socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT) || 45000,
      connectTimeoutMS: parseInt(process.env.MONGODB_CONNECT_TIMEOUT) || 30000,
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 10,
      bufferMaxEntries: parseInt(process.env.MONGODB_BUFFER_MAX_ENTRIES) || 0,
      family: 4,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      retryReads: true
    };

    await mongoose.connect(mongoUri, connectionOptions);

    console.log('✅ MongoDB connected successfully!');
    console.log(`   Database: ${mongoose.connection.name}`);
    console.log(`   Host: ${mongoose.connection.host}`);
    console.log(`   Port: ${mongoose.connection.port}`);
    
    return mongoose.connection;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
};

const disconnectFromDatabase = async () => {
  try {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error);
  }
};

module.exports = {
  connect: connectToDatabase,
  disconnect: disconnectFromDatabase,
  connection: mongoose.connection
};
