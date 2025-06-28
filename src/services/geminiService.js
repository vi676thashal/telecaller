/**
 * Gemini LLM Service
 * 
 * Provides Google Gemini integration for natural language processing and text generation
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const Setting = require('../models/Setting');
const languageUtils = require('../utils/languageUtils');
const { logger } = require('../utils/logger');

// Personality traits for conversation management
const PERSONALITY_TRAITS = {
  professional: {
    tone: 'professional yet approachable',
    pacing: 'measured and clear',
    traits: 'patient, attentive, and solution-oriented'
  },
  empathetic: {
    tone: 'warm and understanding',
    pacing: 'gentle and considerate',
    traits: 'emotionally aware, supportive, and compassionate'
  },
  sales: {
    tone: 'enthusiastic and persuasive',
    pacing: 'confident and clear',
    traits: 'knowledgeable, helpful, and gently persistent'
  },
  credit_card_specialist: {
    tone: 'professional and trustworthy',
    pacing: 'well-paced with pauses for consideration',
    traits: 'expert, informative, and respectful of financial decisions'
  }
};

// Conversation state management
const conversationStates = new Map();

// Gemini LLM Service
const geminiService = {
  // Initialize Google Generative AI client with API key from settings
  getClient: async () => {
    try {
      let apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        try {
          const apiKeySetting = await Setting.findOne({ key: 'geminiApiKey' });
          if (apiKeySetting) {
            apiKey = apiKeySetting.value;
          }
        } catch (dbError) {
          logger.warn('Could not fetch Gemini API key from database:', dbError.message);
        }
      }
      
      if (!apiKey) {
        throw new Error('Gemini API key not found');
      }
      
      return new GoogleGenerativeAI(apiKey);
    } catch (error) {
      logger.error('Error initializing Gemini client:', error);
      throw error;
    }
  },
  
  // Analyze customer's emotional state - similar to openAIService
  analyzeEmotionalContext: (messageText) => {
    const emotionalIndicators = {
      frustrated: /(!+|(\b(frustrated|angry|upset|annoying|ridiculous)\b))/i,
      confused: /(\b(confused|unclear|don't understand|what do you mean)\b|\?+)/i,
      satisfied: /(\b(thank|thanks|good|great|excellent|perfect|helpful)\b)/i,
      interested: /(\b(interested|tell me more|sounds good|what about|features|benefits|details)\b)/i,
      skeptical: /(\b(not sure|really|expensive|cost|fee|charge|interest rate|hidden|catch)\b)/i,
      considering: /(\b(maybe|might|consider|think about|possibly|option)\b)/i
    };

    const emotions = Object.entries(emotionalIndicators)
      .filter(([_, pattern]) => pattern.test(messageText))
      .map(([emotion]) => emotion);

    return emotions.length ? emotions : ['neutral'];
  },
  
  // Update conversation state
  updateConversationState: (callId, messageText) => {
    let state = conversationStates.get(callId) || {
      topics: new Set(),
      customerPreferences: {},
      emotionalTrajectory: [],
      keyPoints: new Set()
    };

    // Update conversation state
    const emotions = geminiService.analyzeEmotionalContext(messageText);
    state.emotionalTrajectory.push({
      emotions,
      timestamp: Date.now()
    });

    // Extract key information
    const topics = messageText.match(/\b(account|billing|service|support|payment)\w*\b/gi) || [];
    topics.forEach(topic => state.topics.add(topic.toLowerCase()));

    // Track customer preferences
    if (messageText.includes('prefer') || messageText.includes('would like')) {
      state.customerPreferences.lastExpressedPreference = messageText;
    }

    conversationStates.set(callId, state);
    return state;
  },
  
  // Generate response using Gemini
  generateResponse: async (conversationHistory, script, prompt, initialLanguage, callId, isIntro = false) => {
    try {
      let detectedLanguage = initialLanguage || 'english';
      let lastCustomerMessage = null;
      let emotions = ['neutral'];
      let personality = PERSONALITY_TRAITS.credit_card_specialist;
      
      if (conversationHistory.length > 0 && !isIntro) {
        lastCustomerMessage = [...conversationHistory]
          .reverse()
          .find(msg => msg.role === 'user');
          
        if (lastCustomerMessage) {
          detectedLanguage = languageUtils.detectLanguage(lastCustomerMessage.content);
          emotions = geminiService.analyzeEmotionalContext(lastCustomerMessage.content);
          
          // Update conversation state with new context
          const state = geminiService.updateConversationState(callId, lastCustomerMessage.content);
          
          // Adjust personality based on emotions
          if (emotions.includes('interested') || emotions.includes('considering')) {
            personality = PERSONALITY_TRAITS.sales;
          } else if (emotions.includes('confused') || emotions.includes('skeptical')) {
            personality = PERSONALITY_TRAITS.empathetic;
          } else if (emotions.includes('frustrated')) {
            personality = PERSONALITY_TRAITS.empathetic;
          } else {
            personality = PERSONALITY_TRAITS.credit_card_specialist;
          }
            // Use the custom prompt content from the dashboard as the primary system prompt
          const customPromptContent = prompt || script || `You are a professional telecaller helping customers.`;
          
          const systemPrompt = `${customPromptContent}
            
            You are Priya, a human telecaller from SBI Bank calling to sell credit cards. You are NOT an assistant.
            
            STRICT TELECALLER RULES:
            ❌ NEVER ask "How can I help you?" or "What can I do for you?" or similar assistant questions
            ❌ NEVER act like a general assistant waiting for customer requests
            ✅ ALWAYS follow the predefined workflow and sales script
            ✅ You called the customer to sell a specific credit card - stay focused on that goal
            ✅ Answer customer questions but always return to the sales process
            
            - Personality: ${personality.tone}, ${personality.traits}
            - Speaking style: ${personality.pacing}
            - Language preference: ${languageUtils.getLanguageSystemPrompt(detectedLanguage)}
            
            TELECALLER BEHAVIOR (NOT ASSISTANT):
            - You initiated this call to sell a credit card
            - Follow the workflow: Greeting → Language → Benefits → Data Collection → Application → Confirmation → Closing
            - If customer asks questions, answer them but continue with the sales process
            - If customer is not interested, politely close the call
            - Never ask "How can I help you?" - you're here to sell a specific product
            
            HUMAN TELECALLER BEHAVIOR OPTIMIZATION:
            1. Use natural conversation fillers like "umm", "so", "well", "you know", "actually"
            2. Ask follow-up questions to show genuine interest and build rapport
            3. Use the customer's name when available to personalize the conversation
            4. Pause for responses and acknowledge customer input with "I understand", "That makes sense", "Absolutely"
            5. Share brief relevant examples or stories to build trust
            6. Use transitional phrases like "Speaking of that...", "Now that you mention it...", "I'm glad you asked..."
            7. Show empathy with phrases like "I completely understand your concern", "That's a valid point"
            8. Use gentle persuasion techniques rather than aggressive sales tactics
            
            ${detectedLanguage === 'mixed' ? `
            HINGLISH CONVERSATION STYLE:
            - Mix Hindi and English naturally as Indians do in daily conversation
            - Use English for technical terms (credit card, cashback, interest rate, billing cycle)
            - Use Hindi for emotional expressions and relationship building
            - Example phrases: "Aap ka credit history kaisa hai?", "Yeh card main feature hai...", "Interest rate bahut competitive hai"
            - Sound like a friendly Indian sales person, not a robot
            - Use respectful address forms: "Aap", "Sir/Madam" appropriately
            ` : ''}
            
            Context from conversation:
            - Customer's emotional state: ${emotions.join(', ')}
            - Topics discussed: ${[...state.topics].join(', ')}
            - Previous preferences: ${JSON.stringify(state.customerPreferences)}`;
          
          // Initialize Gemini AI
          const gemini = await geminiService.getClient();
          const model = gemini.getGenerativeModel({ model: "gemini-pro" });
          
          // Format conversation for Gemini
          const formattedHistory = [
            { role: "user", parts: [{ text: systemPrompt }] },
            ...conversationHistory.map(msg => ({
              role: msg.role === 'system' || msg.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: msg.content }]
            }))
          ];
          
          // Generate chat response
          const chat = model.startChat({ history: formattedHistory });
          const result = await chat.sendMessage(lastCustomerMessage.content);
          const response = result.response.text();
          
          // Update conversation state with the AI's response
          geminiService.updateConversationState(callId, response);
          
          return response;
        }
      }
      
      // Handle introduction or first message
      const gemini = await geminiService.getClient();
      const model = gemini.getGenerativeModel({ model: "gemini-pro" });
        // Handle introduction or first message using the custom prompt
      const customPromptContent = prompt || script || `You are a professional telecaller helping customers.`;
      
      const introSystemPrompt = `${customPromptContent}
      
      Based on the personality and role described above, create a brief, friendly greeting for your first interaction.
      
      Guidelines for introduction:
      1. Stay true to the character and personality defined in the prompt
      2. Keep it natural and conversational, not robotic
      3. Keep it under 15 seconds (about 40 words maximum)  
      4. Match the language preference: ${detectedLanguage === 'mixed' ? 'Speak in Hindi mixed with English for technical terms (Hinglish style) like: "Namaskar sir, main [name] bol raha hun ABC Bank se. Aap ka time hai to credit card ke baare mein baat kar sakte hain?"' : detectedLanguage.startsWith('hi') ? 'Speak in Hindi' : 'Speak in English'}
      5. Sound like a real human telecaller, use natural speech patterns
      6. Include conversational elements like pauses, courtesy, and warmth
      
      ${detectedLanguage === 'mixed' ? 'Make it sound like a genuine Indian sales person calling, not an AI robot.' : 'Be authentic to your defined role while being warm and professional.'}`;
      
      // Generate introduction
      const result = await model.generateContent(introSystemPrompt);
      const introResponse = result.response.text() || 
        "Hello! This is Sam calling from Premium Credit Services. I'm reaching out about an exclusive credit card offer we have for selected customers. Do you have a minute to discuss how this card could benefit you?";
      
      return {
        text: introResponse,
        language: detectedLanguage,
        emotion: 'neutral',
        personality: personality
      };
    } catch (error) {
      logger.error('Error generating Gemini response:', error);
      return {
        text: "I apologize, but I'm having trouble processing your request right now. Could you please repeat that?",
        language: initialLanguage || 'english',
        emotion: 'neutral'
      };
    }
  },
  
  // Clean up resources for a call
  cleanupCall: (callId) => {
    conversationStates.delete(callId);
  }
};

module.exports = geminiService;
