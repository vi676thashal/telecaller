const { OpenAI } = require('openai');
const { logger } = require('../utils/logger');

// Ensure dotenv is loaded
require('dotenv').config();

class OpenAITTSService {
    constructor() {
        // Initialize OpenAI client only when needed
        this.openai = null;
    }

    getOpenAIClient() {
        if (!this.openai) {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                throw new Error('OPENAI_API_KEY environment variable is not set');
            }
            this.openai = new OpenAI({
                apiKey: apiKey
            });
        }
        return this.openai;
    }    async textToSpeech(text) {
        try {
            const openai = this.getOpenAIClient();
            const response = await openai.audio.speech.create({
                model: "tts-1",
                voice: process.env.OPENAI_FM_VOICE_ID || "alloy",
                input: text,
                response_format: "mp3"
            });

            // Convert the response to a buffer
            const buffer = Buffer.from(await response.arrayBuffer());
            return buffer;
        } catch (error) {
            logger.error('OpenAI TTS error:', error);
            throw error;
        }
    }

    async generateResponse(text) {
        try {
            const openai = this.getOpenAIClient();
            const completion = await openai.chat.completions.create({
                messages: [{ role: "user", content: text }],
                model: "gpt-3.5-turbo",
            });

            return completion.choices[0].message.content;
        } catch (error) {
            logger.error('OpenAI Chat error:', error);
            throw error;
        }
    }
}

module.exports = new OpenAITTSService();
