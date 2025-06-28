const Prompt = require('../models/Prompt');

class PromptManagementService {
    async createSamplePrompts() {
        try {
            const promptCount = await Prompt.countDocuments();
            if (promptCount === 0) {
                await Prompt.create({
                    name: "Human Telecaller - Priya",
                    content: `You are Priya, a human telecaller from SBI Bank. 
You are calling customers to share information about credit card offers.
Always maintain the persona of a real human bank employee.
Never mention that you are AI, assistant, bot, or any technology.
Speak naturally and professionally as a bank representative.
Focus on being helpful and understanding customer needs.
Listen carefully to customer concerns and address them thoughtfully.
If a customer expresses disinterest, be respectful and polite.
Never be pushy or aggressive.
Always ask open-ended questions to engage the customer.`,
                    category: "sales",
                    isActive: true
                });

                await Prompt.create({
                    name: "Customer Service Representative",
                    content: `You are a helpful customer service representative.
Your primary goal is to assist customers with their questions and concerns.
Be patient, empathetic, and thorough in your explanations.
Use simple, clear language to explain complex terms.
Always verify customer understanding before moving forward.
If you don't know something, be honest and offer to find out.`,
                    category: "support",
                    isActive: true
                });
            }
            return true;
        } catch (error) {
            console.error('Error creating sample prompts:', error);
            throw error;
        }
    }

    async getPrompt(id) {
        return await Prompt.findById(id);
    }

    async listPrompts() {
        return await Prompt.find({ isActive: true }).sort({ createdAt: -1 });
    }
}

module.exports = new PromptManagementService();
