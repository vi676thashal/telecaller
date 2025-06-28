/**
 * Audio Utils
 * 
 * Utilities for audio format conversion and processing
 */

const { spawn } = require('child_process');
const { Readable, PassThrough } = require('stream');

// Audio utilities
const audioUtils = {
  /**
   * Convert an audio stream to 8kHz mulaw format for Twilio
   * @param {Stream} inputStream - Audio input stream
   * @returns {Stream} - Converted audio stream
   */
  convertToMulaw: (inputStream) => {
    try {
      // Create a pass-through stream to return to the caller
      const outputStream = new PassThrough();
      
      // Use ffmpeg to convert audio to 8kHz mulaw format
      const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0',          // Input from stdin
        '-ar', '8000',           // 8kHz sample rate (required by Twilio)
        '-ac', '1',              // Mono audio
        '-codec:a', 'pcm_mulaw', // Mulaw codec
        '-f', 'mulaw',           // Mulaw format
        'pipe:1'                 // Output to stdout
      ]);
      
      // Handle ffmpeg process errors
      ffmpeg.on('error', (err) => {
        console.error('Error converting audio to mulaw:', err);
        outputStream.emit('error', err);
      });
      
      // Pipe the input to ffmpeg's stdin
      inputStream.pipe(ffmpeg.stdin);
      
      // Pipe ffmpeg's stdout to our output stream
      ffmpeg.stdout.pipe(outputStream);
      
      // Handle process exit
      ffmpeg.on('exit', (code, signal) => {
        if (code !== 0) {
          console.error(`ffmpeg exited with code ${code} and signal ${signal}`);
          outputStream.emit('error', new Error(`ffmpeg exited with code ${code}`));
        }
      });
      
      return outputStream;
    } catch (error) {
      console.error('Error in convertToMulaw:', error);
      // Return an empty stream on error as fallback
      const emptyStream = new Readable();
      emptyStream.push(null);
      return emptyStream;
    }
  },
  
  /**
   * Generate a silent audio buffer
   * @param {number} durationMs - Duration in milliseconds
   * @param {number} sampleRate - Sample rate in Hz
   * @returns {Buffer} - Silent audio buffer
   */
  generateSilence: (durationMs = 1000, sampleRate = 8000) => {
    // Calculate buffer size based on duration and sample rate
    const bufferSize = Math.floor((sampleRate * durationMs) / 1000);
    
    // Create a buffer filled with the silent PCM value for mulaw (0x7F)
    const silenceBuffer = Buffer.alloc(bufferSize, 0x7F);
    return silenceBuffer;
  }
};

module.exports = audioUtils;
