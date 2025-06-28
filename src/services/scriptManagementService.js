const Script = require('../models/Script');

class ScriptManagementService {
    async createSampleScripts() {
        try {
            const scriptCount = await Script.countDocuments();
            if (scriptCount === 0) {
                await Script.create({
                    name: "Credit Card Sales Script",
                    content: `Hello! This is [Agent Name] calling from [Bank Name]. I noticed you might be interested in our premium credit card offering. 
                    
Our card comes with excellent benefits including:
- 2% cashback on all purchases
- No annual fee for the first year
- 0% intro APR for 15 months
- Extended warranty protection
- 24/7 concierge service

Would you like to hear more about these benefits?`,
                    language: "english",
                    category: "sales",
                    isActive: true
                });

                await Script.create({
                    name: "Follow-up Call Script",
                    content: `Hello, this is [Agent Name] following up about the credit card we discussed earlier.
                    
I wanted to check if you had any questions about:
- The application process
- Card benefits
- Current promotional offers
- Interest rates and fees

I'm here to help make this decision easier for you.`,
                    language: "english",
                    category: "follow-up",
                    isActive: true
                });
            }
            return true;
        } catch (error) {
            console.error('Error creating sample scripts:', error);
            throw error;
        }
    }

    async getScript(id) {
        return await Script.findById(id);
    }

    async listScripts() {
        return await Script.find({ isActive: true }).sort({ createdAt: -1 });
    }
}

module.exports = new ScriptManagementService();
