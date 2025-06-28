const OpenAI = require('openai');
const { Readable } = require('stream');
const Setting = require('../models/Setting');
const languageUtils = require('../utils/languageUtils');

// Constants for conversation management
const MAX_HISTORY_LENGTH = 12; // Increased for better context
const MODEL_NAME = 'gpt-4o'; // Using a more capable model for credit card sales
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
  dynamic: {
    tone: 'energetic and engaging',
    pacing: 'upbeat but professional',
    traits: 'adaptive, responsive, and positive'
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

const openaiService = {
  // Initialize OpenAI client with settings from database or environment
  getClient: async () => {
    try {
      let apiKey = process.env.OPENAI_API_KEY;
      
      if (!apiKey) {
        try {
          const apiKeySetting = await Setting.findOne({ key: 'openaiApiKey' });
          if (apiKeySetting) {
            apiKey = apiKeySetting.value;
          }
        } catch (dbError) {
          console.warn('Could not fetch API key from database:', dbError.message);
        }
      }
      
      if (!apiKey) {
        throw new Error('OpenAI API key not found');
      }
      
      return new OpenAI({ apiKey });
    } catch (error) {
      console.error('Error initializing OpenAI client:', error);
      throw error;
    }
  },
  // Analyze customer's emotional state
  analyzeEmotionalContext: (messageText) => {
    const emotionalIndicators = {
      frustrated: /(!+|(\b(frustrated|angry|upset|annoying|ridiculous)\b))/i,
      confused: /(\b(confused|unclear|don't understand|what do you mean)\b|\?+)/i,
      satisfied: /(\b(thank|thanks|good|great|excellent|perfect|helpful)\b)/i,
      urgent: /(\b(asap|urgent|emergency|immediately|right now)\b)/i,
      concerned: /(\b(worried|concerned|anxious|problem|issue)\b)/i,
      interested: /(\b(interested|tell me more|sounds good|what about|features|benefits|details)\b)/i,
      skeptical: /(\b(not sure|really|expensive|cost|fee|charge|interest rate|hidden|catch)\b)/i,
      considering: /(\b(maybe|might|consider|think about|possibly|option)\b)/i
    };

    const emotions = Object.entries(emotionalIndicators)
      .filter(([_, pattern]) => pattern.test(messageText))
      .map(([emotion]) => emotion);

    return emotions.length ? emotions : ['neutral'];
  },
  
  // Text-to-speech stream generation
  textToSpeechStream: async (text, voice = 'alloy', options = {}) => {
    try {
      const client = await openaiService.getClient();
        const response = await client.audio.speech.create({
        model: 'tts-1', // Use faster tts-1 model instead of tts-1-hd for lower latency
        voice: voice,
        input: text,
        response_format: 'mp3',
        speed: options.speed || 1.1 // Slightly faster speech for natural conversation flow
      });
      
      // Convert the response to a readable stream
      const buffer = Buffer.from(await response.arrayBuffer());
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);
      
      return stream;
    } catch (error) {
      console.error('Error generating TTS stream:', error);
      throw error;
    }
  },

  // Get appropriate conversation personality based on context
  getConversationPersonality: (emotions, state) => {
    if (emotions.includes('frustrated') || emotions.includes('concerned')) {
      return PERSONALITY_TRAITS.empathetic;
    }
    if (emotions.includes('urgent')) {
      return {
        ...PERSONALITY_TRAITS.professional,
        pacing: 'efficient but thorough'
      };
    }

    // Check emotional trajectory for personality adjustment
    if (state?.emotionalTrajectory?.length > 0) {
      const recentEmotions = state.emotionalTrajectory.slice(-3);
      const hasPositiveProgression = recentEmotions.some(e => 
        e.emotions.includes('satisfied')
      );
      if (hasPositiveProgression) {
        return PERSONALITY_TRAITS.dynamic;
      }
    }

    return PERSONALITY_TRAITS.professional;
  },

  // Maintain conversation memory and context
  updateConversationState: (callId, messageText) => {
    let state = conversationStates.get(callId) || {
      topics: new Set(),
      customerPreferences: {},
      emotionalTrajectory: [],
      keyPoints: new Set(),
      contextualMemory: []
    };

    // Update conversation state
    const emotions = openaiService.analyzeEmotionalContext(messageText);
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

    // Maintain state with size limit
    if (state.emotionalTrajectory.length > 10) {
      state.emotionalTrajectory.shift();
    }

    conversationStates.set(callId, state);
    return state;
  },  // Generate human-like response based on enhanced context
  generateResponse: async (conversationHistory, script, prompt, initialLanguage, callId, isIntro = false, optimizedParams = null) => {
    try {
      let detectedLanguage = initialLanguage || 'english';
      let lastCustomerMessage = null;
      let emotions = ['neutral'];
      let personality = PERSONALITY_TRAITS.credit_card_specialist;
      
      if (conversationHistory.length > 0 && !isIntro) {
        lastCustomerMessage = [...conversationHistory]
          .reverse()
          .find(msg => msg.speaker === 'Customer');
          
        if (lastCustomerMessage) {
          detectedLanguage = languageUtils.detectLanguage(lastCustomerMessage.text);
          emotions = openaiService.analyzeEmotionalContext(lastCustomerMessage.text);
          
          // Update conversation state with new context
          const state = openaiService.updateConversationState(callId, lastCustomerMessage.text);
          
          // For credit card sales, use more targeted personality
          if (emotions.includes('interested') || emotions.includes('considering')) {
            personality = PERSONALITY_TRAITS.sales;
          } else if (emotions.includes('confused') || emotions.includes('skeptical')) {
            personality = PERSONALITY_TRAITS.empathetic;
          } else if (emotions.includes('frustrated')) {
            personality = PERSONALITY_TRAITS.empathetic;
          } else {
            personality = PERSONALITY_TRAITS.credit_card_specialist;
          }
          
          const conversationState = conversationStates.get(callId) || {
            topics: new Set(),
            customerPreferences: {}
          };
            // Use the custom prompt content from the dashboard as the primary system prompt
          const customPromptContent = prompt || script || `You are a professional telecaller helping customers.`;
          
          const systemMessage = {
            role: 'system',
            content: `${customPromptContent}
            
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
              - Topics discussed: ${[...conversationState.topics].join(', ')}
              - Previous preferences: ${JSON.stringify(conversationState.customerPreferences)}
              
              Guidelines:
              1. Maintain natural conversation flow with appropriate pauses and acknowledgments
              2. Show emotional intelligence and adapt to customer's state
              3. Reference previous parts of the conversation when relevant
              4. Use conversational markers like "I understand", "I see", "That's a great question"
              5. Break responses into natural speaking chunks (10-15 seconds max)
              6. Address customer's emotional needs before technical solutions
              7. When speaking Hindi, use simple vocabulary and mix with English for technical terms
              8. Behave like a real human telecaller, not an AI assistant`
          };

          // Prepare conversation context
          const recentHistory = conversationHistory
            .slice(-MAX_HISTORY_LENGTH)
            .map(msg => ({
              role: msg.speaker === 'Customer' ? 'user' : 'assistant',
              content: msg.text
            }));          // Generate response using OpenAI
          const client = await openaiService.getClient();
          const completion = await client.chat.completions.create({
            model: MODEL_NAME,
            messages: [systemMessage, ...recentHistory],
            temperature: 0.7,
            max_tokens: optimizedParams?.maxTokens || 150, // Use optimized token count if provided
            presence_penalty: 0.6,
            frequency_penalty: 0.5
            // Note: timeout is handled by the HTTP client, not passed to OpenAI API
          });          const response = completion.choices[0]?.message?.content || '';
          openaiService.updateConversationState(callId, response);

          return {
            text: response,
            language: detectedLanguage,
            emotion: emotions[0] || 'neutral',
            personality: personality
          };
        }
      }
        // Handle introduction or first message using the custom prompt
      const customPromptContent = prompt || script || `You are a professional telecaller helping customers.`;
      
      const introSystemMessage = {
        role: 'system',
        content: `${customPromptContent}
        
        Based on the personality and role described above, create a brief, friendly greeting for your first interaction.
        
        Guidelines for introduction:
        1. Stay true to the character and personality defined in the prompt
        2. Keep it natural and conversational, not robotic  
        3. Keep it under 15 seconds (about 40 words maximum)
        4. Match the language preference: ${detectedLanguage === 'mixed' ? 'Speak in Hindi mixed with English for technical terms (Hinglish style) like: "Namaskar sir, main [name] bol raha hun ABC Bank se. Aap ka time hai to credit card ke baare mein baat kar sakte hain?"' : detectedLanguage.startsWith('hi') ? 'Speak in Hindi' : 'Speak in English'}
        5. Sound like a real human telecaller, use natural speech patterns
        6. Include conversational elements like pauses, courtesy, and warmth
        
        ${detectedLanguage === 'mixed' ? 'Make it sound like a genuine Indian sales person calling, not an AI robot.' : 'Be authentic to your defined role while being warm and professional.'}
        
        Be authentic to your defined role while being warm and professional.`
      };
        // Generate introduction
      const client = await openaiService.getClient();
      const completion = await client.chat.completions.create({
        model: MODEL_NAME,
        messages: [introSystemMessage],
        temperature: 0.7,
        max_tokens: 100
      });
        const introResponse = completion.choices[0]?.message?.content || 
        "Hello! How may I assist you today?";
      
      return {
        text: introResponse,
        language: detectedLanguage,
        emotion: 'neutral',
        personality: personality
      };

    } catch (error) {
      console.error('Error generating response:', error);
      throw error;
    }
  },

  // Generate appropriate initial greeting
  generateInitialGreeting: async (language, script) => {
    const greetings = {
      english: 'Hello! How may I assist you today?',
      hindi: 'नमस्ते! मैं आपकी कैसे मदद कर सकता/सकती हूं?',
      hinglish: 'Hello! Main aapki kaise help kar sakta/sakti hoon?'
    };
    return greetings[language] || greetings.english;
  },

  // Simple chat completion for workflow engine
  getChatCompletion: async (messages, callId = null, stepType = null) => {
    try {
      // Extract any system message to ensure we're enforcing telecaller behavior
      const systemMessage = messages.find(msg => msg.role === 'system');
      
      // If no system message exists or it doesn't enforce telecaller behavior, add telecaller enforcement
      if (!systemMessage || 
          !systemMessage.content.includes('STRICT TELECALLER RULES') || 
          !systemMessage.content.includes('TELECALLER BEHAVIOR (NOT ASSISTANT)')) {
        
        // Insert strong telecaller enforcement system message at the beginning
        const telecallerSystemMessage = {
          role: 'system',
          content: `You are Priya, a human telecaller from SBI Bank calling to sell credit cards. You are NOT an assistant.
              
            STRICT TELECALLER RULES:
            ❌ NEVER ask "How can I help you?" or "What can I do for you?" or similar assistant questions
            ❌ NEVER act like a general assistant waiting for customer requests
            ✅ ALWAYS follow the predefined workflow and sales script
            ✅ You called the customer to sell a specific credit card - stay focused on that goal
            ✅ Answer customer questions but always return to the sales process
            
            TELECALLER BEHAVIOR (NOT ASSISTANT):
            - You initiated this call to sell a credit card
            - Follow the workflow: Greeting → Language → Benefits → Data Collection → Application → Confirmation → Closing
            - If customer asks questions, answer them but continue with the sales process
            - If customer is not interested, politely close the call
            - Never ask "How can I help you?" - you're here to sell a specific product`
        };
        
        // Replace existing system message or add new one at the beginning
        const updatedMessages = systemMessage 
          ? messages.map(msg => msg.role === 'system' ? telecallerSystemMessage : msg)
          : [telecallerSystemMessage, ...messages];
          
        messages = updatedMessages;
      }
      
      const client = await openaiService.getClient();
      
      const completion = await client.chat.completions.create({
        model: MODEL_NAME,
        messages: messages,
        max_tokens: 150,
        temperature: 0.7,
        presence_penalty: 0.3,
        frequency_penalty: 0.3
      });

      // Get the raw response content
      const responseContent = completion.choices[0].message.content.trim();
      
      // If we have access to the ultraFastResponseOptimizer, use it to enforce telecaller workflow
      try {
        const ultraFastResponseOptimizer = require('./ultraFastResponseOptimizer');
        if (ultraFastResponseOptimizer && typeof ultraFastResponseOptimizer.enforceStrictTelecallerResponse === 'function') {
          // Apply strict telecaller workflow enforcement
          const enforcedResponse = ultraFastResponseOptimizer.enforceStrictTelecallerResponse(
            responseContent,
            callId,
            stepType
          );
          
          console.log(`🔒 OpenAI Direct Chat: Applied strict telecaller enforcement`);
          
          return {
            content: enforcedResponse
          };
        }
      } catch (enforcementError) {
        console.error('Failed to apply telecaller enforcement:', enforcementError);
      }
      
      // Fallback if ultraFastResponseOptimizer is not available
      return {
        content: responseContent
      };
    } catch (error) {
      console.error('Error in OpenAI chat completion:', error);
      throw error;
    }
  },

  // Clean up resources for a call
  cleanupCall: (callId) => {
    conversationStates.delete(callId);
  }
};

module.exports = openaiService;
