// Import advanced language detection for performance optimization
const advancedDetection = require('./advancedLanguageDetection');

const languageUtils = {
  // Detect language from text with Hinglish support
  detectLanguage: (text) => {
    if (!text) return 'unknown';
    
    // Use advanced detection if available
    try {
      // First, check for Hindi-English mixed language (Hinglish)
      if (advancedDetection.detectHindiEnglishMix(text)) {
        return 'mixed';
      }
      
      // Use standard language detection
      const language = advancedDetection.detectLanguageAdvanced(text);
      
      // For credit card sales, map languages to our simplified set
      if (language === 'hindi') {
        return 'hindi';
      } else if (language === 'hinglish') {
        return 'mixed';
      } else if (language === 'english') {
        return 'english';
      }
      
      return language;
    } catch (error) {
      console.log('Falling back to basic language detection due to error:', error.message);
      
      // Basic language detection based on character sets and common words
      // This is a simplified approach as fallback
      
      // Hindi detection (Devanagari script)
      const devanagariRegex = /[\u0900-\u097F]/;
      if (devanagariRegex.test(text)) return 'hindi';
      
      // Japanese detection
      const japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
      if (japaneseRegex.test(text)) return 'japanese';
      
      // Chinese detection
      const chineseRegex = /[\u4E00-\u9FFF]/;
      if (chineseRegex.test(text) && !japaneseRegex.test(text)) return 'chinese';
      
      // Arabic detection
      const arabicRegex = /[\u0600-\u06FF]/;
      if (arabicRegex.test(text)) return 'arabic';
      
      // Russian detection
      const russianRegex = /[\u0400-\u04FF]/;
      if (russianRegex.test(text)) return 'russian';
      
      // Spanish detection
      const spanishWords = ['hola', 'gracias', 'buenos', 'días', 'tardes', 'noches', 'cómo', 'estás', 'qué', 'dónde', 'cuándo', 'por qué'];
      const spanishRegex = new RegExp(`\\b(${spanishWords.join('|')})\\b`, 'i');
      if (spanishRegex.test(text.toLowerCase())) return 'spanish';
      
      // French detection
      const frenchWords = ['bonjour', 'merci', 'au revoir', 'comment', 'allez', 'vous', 'je', 'suis', 'parlez', 'français'];
      const frenchRegex = new RegExp(`\\b(${frenchWords.join('|')})\\b`, 'i');
      if (frenchRegex.test(text.toLowerCase())) return 'french';
      
      // German detection
      const germanWords = ['guten', 'morgen', 'tag', 'abend', 'danke', 'bitte', 'wie', 'geht', 'sprechen', 'deutsch'];
      const germanRegex = new RegExp(`\\b(${germanWords.join('|')})\\b`, 'i');
      if (germanRegex.test(text.toLowerCase())) return 'german';
      
      // Portuguese detection
      const portugueseWords = ['olá', 'obrigado', 'obrigada', 'bom', 'dia', 'tarde', 'noite', 'como', 'está', 'por favor'];
      const portugueseRegex = new RegExp(`\\b(${portugueseWords.join('|')})\\b`, 'i');
      if (portugueseRegex.test(text.toLowerCase())) return 'portuguese';
      
      // Default to English if no other language detected
      return 'english';
    }
  },
  
  // Get Twilio voice language code
  getTwilioLanguageCode: (language) => {
    const languageCodes = {
      'english': 'en-US',
      'hindi': 'hi-IN',
      'hinglish': 'hi-IN', // Use Hindi code for Hinglish
      'spanish': 'es-ES',
      'french': 'fr-FR',
      'german': 'de-DE',
      'japanese': 'ja-JP',
      'chinese': 'zh-CN',
      'arabic': 'ar-AE',
      'russian': 'ru-RU',
      'portuguese': 'pt-BR',
      'unknown': 'en-US' // Default to English
    };
    
    return languageCodes[language] || 'en-US';
  },
  
  // Get ElevenLabs language code
  getElevenLabsLanguageCode: (language) => {
    const languageCodes = {
      'english': 'en',
      'hindi': 'hi',
      'hinglish': 'hi', // Use Hindi code for Hinglish
      'spanish': 'es',
      'french': 'fr',
      'german': 'de',
      'japanese': 'ja',
      'chinese': 'zh',
      'arabic': 'ar',
      'russian': 'ru',
      'portuguese': 'pt',
      'unknown': 'en' // Default to English
    };
    
    return languageCodes[language] || 'en';
  },
  
  // Get system prompt for language
  getLanguageSystemPrompt: (language) => {
    switch(language) {
      case 'hindi':
        return `आप हिंदी में एक क्रेडिट कार्ड सेल्स एजेंट हैं। कृपया हिंदी में ही उत्तर दें।

क्रेडिट कार्ड बिक्री के लिए महत्वपूर्ण बिंदु:
- कार्ड लाभ पर जोर दें: रिवॉर्ड पॉइंट्स, कैशबैक, एयरपोर्ट लाउंज एक्सेस, आदि
- विशेष परिचयात्मक ऑफर के बारे में बताएं, जैसे शून्य वार्षिक शुल्क या वेलकम बोनस
- प्रतिस्पर्धी ब्याज दरों और लचीले भुगतान विकल्पों की व्याख्या करें
- सुरक्षा सुविधाओं और धोखाधड़ी से सुरक्षा के बारे में बताकर आश्वस्त करें
- आवेदन प्रक्रिया को त्वरित और आसान बताएं

ग्राहक के साथ प्रभावी और सम्मानजनक संवाद करें।`;
      case 'mixed':
        return `You are an AI credit card sales agent speaking Hinglish (Hindi-English mix) as commonly used in Indian sales conversations.

HUMAN TELECALLER BEHAVIOR FOR HINGLISH:
- Sound like a real Indian sales person, not an AI
- Use natural conversation flow with pauses and acknowledgments
- Mix Hindi and English naturally in the same sentence
- Use respectful terms: "Aap", "Sir/Madam", "ji" appropriately
- Show genuine interest in customer's needs

Credit card sales ke liye important talking points:
- Card benefits highlight karein: "Sir, is card mein aap ko milega unlimited cashback aur airport lounge access"
- Special offers discuss karein: "Abhi special promotion chal raha hai, first year ka annual fee waived hai"
- Interest rates explain karein: "Interest rate sirf 1.99% per month hai, jo ki market mein sabse competitive hai"
- Security features batayein: "Aap ki security ke liye 24/7 fraud monitoring aur instant SMS alerts milte hain"
- Application process simple banayein: "Application process bilkul simple hai, bas 2-3 documents chahiye"

CONVERSATION STYLE:
- Start with: "Namaskar sir/madam, main [name] bol raha hun XYZ Bank se"
- Use fillers naturally: "Dekhiye sir", "Actually", "Samjhiye na"
- Ask engaging questions: "Aap ka current spending pattern kaisa hai?", "Travel karte rehte hain?"
- Show understanding: "Bilkul sahi keh rahe hain", "Main samajh sakta hun aap ki concern"
- Use examples: "Jaise agar aap monthly 50,000 spend karte hain, to aap ko 2500 cashback milega"

For technical terms like "credit score", "billing cycle", "reward points", use English mixed naturally in Hindi sentences.`;
      case 'spanish':
        return 'Eres un asistente de IA que habla español. Por favor, responde en español.';
      case 'french':
        return 'Vous êtes un assistant IA parlant français. Veuillez répondre en français.';
      case 'german':
        return 'Sie sind ein deutschsprachiger KI-Assistent. Bitte antworten Sie auf Deutsch.';
      case 'japanese':
        return 'あなたは日本語を話すAIアシスタントです。日本語で回答してください。';
      case 'chinese':
        return '您是会说中文的AI助手。请用中文回答。';
      case 'arabic':
        return 'أنت مساعد ذكاء اصطناعي يتحدث العربية. يرجى الرد باللغة العربية.';
      case 'russian':
        return 'Вы - русскоговорящий ИИ-помощник. Пожалуйста, отвечайте на русском языке.';
      case 'portuguese':
        return 'Você é um assistente de IA que fala português. Por favor, responda em português.';
      case 'english':
      default:
        return `You are an English-speaking credit card sales agent. Please respond in clear, professional English.
        
Key points for credit card sales:
- Highlight card benefits: reward points, cashback, airport lounge access, etc.
- Discuss special introductory offers like zero annual fee or welcome bonus
- Explain competitive interest rates and flexible payment options
- Reassure about security features and fraud protection
- Make the application process sound quick and easy

Maintain effective and respectful conversation with the customer.`;
    }
  },
  
  // Get all supported languages
  getSupportedLanguages: () => {
    return [
      'english',
      'hindi',
      'hinglish',
      'spanish',
      'french',
      'german',
      'japanese',
      'chinese',
      'arabic',
      'russian',
      'portuguese'
    ];
  }
};

module.exports = languageUtils;
