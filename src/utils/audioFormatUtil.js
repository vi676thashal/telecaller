/**
 * Audio Format Utility for Twilio
 * Ensures audio meets Twilio's requirements:
 * - Mono
 * - 8000 Hz sample rate
 * - µ-law encoding
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const FFMPEG_PATH = path.join(__dirname, '..', '..', '..', 'ffmpeg-master-latest-win64-gpl', 'bin', 'ffmpeg.exe');

class AudioFormatUtil {
    /**
     * Convert audio to Twilio-compatible format
     * @param {string} inputPath Path to input audio file
     * @param {string} outputPath Path to output audio file
     * @returns {Promise<boolean>} Success status
     */
    static async convertForTwilio(inputPath, outputPath) {
        return new Promise((resolve, reject) => {
            // Ensure output directory exists
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const ffmpeg = spawn(FFMPEG_PATH, [
                '-i', inputPath,
                '-ac', '1',               // Convert to mono
                '-ar', '8000',            // Set sample rate to 8000 Hz
                '-c:a', 'pcm_mulaw',      // Convert to µ-law
                '-y',                     // Overwrite output file if exists
                outputPath
            ]);

            ffmpeg.stderr.on('data', (data) => {
                console.log(`[FFmpeg] ${data}`);
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    // Check if file exists and has size > 0
                    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                        resolve(true);
                    } else {
                        reject(new Error('Output file is empty or missing'));
                    }
                } else {
                    reject(new Error(`FFmpeg process exited with code ${code}`));
                }
            });
        });
    }

    /**
     * Normalize audio volume for better audibility
     * @param {string} inputPath Path to input audio file
     * @param {string} outputPath Path to output audio file
     * @returns {Promise<boolean>} Success status
     */
    static async normalizeVolume(inputPath, outputPath) {
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn(FFMPEG_PATH, [
                '-i', inputPath,
                '-filter:a', 'loudnorm=I=-16:LRA=11:TP=-1.5',  // Normalize volume
                '-y',
                outputPath
            ]);

            ffmpeg.stderr.on('data', (data) => {
                console.log(`[FFmpeg] ${data}`);
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) resolve(true);
                else reject(new Error(`FFmpeg process exited with code ${code}`));
            });
        });
    }
}

module.exports = AudioFormatUtil;
