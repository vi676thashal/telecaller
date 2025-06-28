/**
 * Enhanced Advanced Language Detection Utility for SecureVoice AI
 * Ultra-accurate detection with real-time Hinglish support and conversation context
 */

// Enhanced language detection patterns with conversation context
const languagePatterns = {
  // Enhanced Hindi patterns
  hindi: {
    regex: /[\u0900-\u097F]/,
    threshold: 0.15, // Reduced for mixed conversations
    confidence_boost: 1.2,
    words: [
      // Basic Hindi
      'नमस्ते', 'धन्यवाद', 'हां', 'नहीं', 'कृपया', 'माफ़', 'कीजिए', 'मदद', 'समझ', 'बात',
      'आप', 'मैं', 'हम', 'तुम', 'वो', 'यह', 'वह', 'क्या', 'कैसे', 'कब', 'कहाँ', 'क्यों', 'कौन',
      
      // Conversation Hindi
      'अच्छा', 'ठीक', 'हाँ', 'नहीं', 'जी', 'साहब', 'मैडम', 'सर', 'भाई', 'बहन', 'सुनिए',
      'बताइए', 'समझिए', 'देखिए', 'जानते', 'पता', 'मालूम', 'सुना', 'कहा', 'बोला',
      
      // Telecalling specific Hindi
      'कार्ड', 'क्रेडिट', 'पैसा', 'रुपये', 'ब्याज', 'दर', 'वार्षिक', 'शुल्क', 'लाभ', 'पुरस्कार',
      'बैंक', 'खाता', 'ग्राहक', 'सेवा', 'भुगतान', 'बिल', 'ईएमआई', 'लोन', 'स्वीकृत', 'आवेदन',
      
      // Common responses
      'दिलचस्पी', 'रुचि', 'चाहिए', 'नहीं चाहिए', 'सोचूंगा', 'बाद में', 'फोन करना', 'वापस',
      'समय नहीं', 'व्यस्त', 'अभी नहीं', 'जरूरत नहीं', 'पहले से', 'है'
    ],
    // Enhanced patterns for better detection
    patterns: [
      /\b(मैं|आप|हम|तुम|वो|यह|वह)\b/gi,
      /\b(क्या|कैसे|कब|कहाँ|क्यों|कौन)\b/gi,
      /\b(हाँ|नहीं|जी|साहब|सर|मैडम)\b/gi,
      /\b(अच्छा|ठीक|समझ|मालूम|पता)\b/gi,
      /[\u0900-\u097F]{2,}/g // Any Devanagari sequence
    ]
  },
  
  // Enhanced Hinglish patterns - CRITICAL FOR REAL CONVERSATIONS
  hinglish: {
    regex: /[a-zA-Z\u0900-\u097F]/,
    threshold: 0.08, // Very low threshold for subtle code-switching
    confidence_boost: 1.5, // High boost for Hinglish detection
    words: [
      // Roman Hindi words
      'namaste', 'dhanyawad', 'haan', 'nahi', 'kya', 'kaise', 'kab', 'kahan', 'kyun',
      'kaun', 'accha', 'acha', 'thik', 'theek', 'hai', 'aap', 'main', 'hum', 'tum',
      'samajh', 'mujhe', 'tumhe', 'unhe', 'humko', 'batao', 'suniye', 'dekhiye',
      'boliye', 'kahiye', 'samjhiye', 'dekho', 'suno', 'bolo', 'kaho',
      
      // Common Hinglish phrases
      'matlab', 'mtlb', 'yaar', 'bhai', 'dude', 'areh', 'arre', 'abey', 'bas',
      'chalo', 'chal', 'bhut', 'bahut', 'bohot', 'kitna', 'kitni', 'kitne',
      'paisa', 'rupay', 'rupee', 'paise', 'payment', 'card', 'bank',
      
      // Telecalling Hinglish
      'interested', 'interest', 'chahiye', 'nahi chahiye', 'time nahi',
      'busy hun', 'call back', 'baad mein', 'abhi nahi', 'pehle se hai',
      'already hai', 'need nahi', 'zaroorat nahi', 'sochenge', 'think karunga',
      
      // Conversation fillers
      'actually', 'basically', 'really', 'seriously', 'honestly', 'frankly',
      'waise', 'basically', 'really mein', 'sach mein', 'pakka', 'sure',
      
      // Mixed responses
      'ok sir', 'ok madam', 'yes sir', 'no sir', 'sorry sir', 'thank you sir',
      'acha sir', 'theek hai sir', 'samjh gaya', 'got it', 'understood'
    ],
    
    // Advanced Hinglish detection patterns
    patterns: [
      // Common code-switching patterns
      /\b(kya|kaise|kab|kahan|kyun)\s+(hai|hoga|karein|karen|is|was|will)\b/gi,
      /\b(mujhe|humko|meko)\s+(need|chahiye|lagta|laga)\b/gi,
      /\b(nahi|nahin)\s+(hai|hoga|karna|want|need|interested)\b/gi,
      /\b(matlab|mtlb)\s+(what|kya|ye|this|that)\b/gi,
      /\b(acha|accha|theek)\s+(hai|ok|fine|good)\b/gi,
      /\b(sir|madam|ji)\s+\w+/gi,
      /\b\w+\s+(sir|madam|ji)\b/gi,
      
      // Roman Hindi followed by English
      /\b(haan|nahi|acha|theek|samjh|dekh|sun)\s+[a-zA-Z]{3,}\b/gi,
      /\b[a-zA-Z]{3,}\s+(hai|hoga|kiya|karta|karti)\b/gi,
      
      // English with Hindi grammar
      /\bI\s+(hun|hu|hoon)\b/gi,
      /\byou\s+(hain|ho|hei)\b/gi,
      /\bwhat\s+(hai|hoga)\b/gi,
      /\bhow\s+(karte|karta|karti)\b/gi,
      
      // Mixed number expressions
      /\b(kitna|kitni|kitne)\s+(much|many|rs|rupees|dollars|price)\b/gi,
      /\b(bahut|bohot|bhut)\s+(good|bad|nice|expensive|cheap)\b/gi
    ],
    
    // Context clues for Hinglish
    contextClues: [
      'sir', 'madam', 'ji', 'sahab', 'bhai', 'yaar',
      'actually', 'basically', 'matlab', 'waise'
    ]
  },
  
  // Enhanced English patterns
  english: {
    regex: /^[a-zA-Z\s\d\.\,\!\?\-\'\"]*$/,
    threshold: 0.85, // High threshold for pure English
    confidence_boost: 1.0,
    words: [
      // Basic English
      'hello', 'hi', 'yes', 'no', 'please', 'thank', 'you', 'sorry', 'excuse', 'me',
      'what', 'how', 'when', 'where', 'why', 'who', 'which', 'can', 'could', 'would',
      
      // Telecalling English
      'interested', 'not interested', 'tell me more', 'sounds good', 'not sure',
      'think about it', 'call back', 'later', 'busy', 'not now', 'already have',
      'need', 'want', 'like', 'love', 'hate', 'prefer',
      
      // Credit card specific
      'credit', 'card', 'bank', 'account', 'payment', 'money', 'rupees', 'dollars',
      'interest', 'rate', 'annual', 'fee', 'reward', 'points', 'cashback', 'offer',
      'application', 'approved', 'apply', 'balance', 'limit', 'customer', 'service'
    ],
    patterns: [
      /\b(the|and|or|but|if|then|when|where|what|how|why|who)\b/gi,
      /\b(I|you|we|they|he|she|it)\s+(am|are|is|was|were|will|would|can|could)\b/gi,
      /\b(have|has|had|do|does|did|will|would|should|could|might|may)\b/gi
    ]
  },
  
  // Pure romanized Hindi (different from Hinglish)
  romanHindi: {
    regex: /^[a-zA-Z\s]*$/,
    threshold: 0.6,
    confidence_boost: 1.1,
    words: [
      'namaste', 'dhanyawad', 'kshama', 'maaf', 'kijiye', 'madad', 'samajh', 'baat',
      'bataaiye', 'suniye', 'dekhiye', 'janiye', 'kahiye', 'boliye', 'samjhiye',
      'vyakti', 'vyavastha', 'samvidhan', 'adhikar', 'kartavya', 'zimmedaari',
      'parivaar', 'samaj', 'desh', 'rाष्ट्र', 'sarkar', 'राज्य', 'pradesh'
    ]
  },

  spanish: {
    regex: /[áéíóúüñ¿¡]/i,
    threshold: 0.3,
    words: ['hola', 'gracias', 'buenos', 'días', 'tardes', 'noches', 'cómo', 'estás', 'qué', 'dónde', 'cuándo', 'por qué', 'ayuda']
  },
  french: {
    regex: /[àâæçéèêëîïôœùûüÿ]/i,
    threshold: 0.3,
    words: ['bonjour', 'merci', 'au revoir', 'comment', 'allez', 'vous', 'je', 'suis', 'parlez', 'français', 'aide']
  },
  german: {
    regex: /[äöüß]/i,
    threshold: 0.3,
    words: ['guten', 'morgen', 'tag', 'abend', 'danke', 'bitte', 'wie', 'geht', 'sprechen', 'deutsch', 'hilfe']
  },
  
  // New languages
  japanese: {
    regex: /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/,
    threshold: 0.2,
    words: ['こんにちは', 'ありがとう', 'はい', 'いいえ', 'お願いします', 'すみません', '助けて']
  },
  arabic: {
    regex: /[\u0600-\u06FF]/,
    threshold: 0.2,
    words: ['مرحبا', 'شكرا', 'نعم', 'لا', 'من فضلك', 'آسف', 'مساعدة']
  },
  chinese: {
    regex: /[\u4E00-\u9FFF]/,
    threshold: 0.2,
    words: ['你好', '谢谢', '是的', '不', '请', '对不起', '帮助']
  },
  russian: {
    regex: /[\u0400-\u04FF]/,
    threshold: 0.2,
    words: ['привет', 'спасибо', 'да', 'нет', 'пожалуйста', 'извините', 'помощь']
  },
  portuguese: {
    regex: /[áàâãéêíóôõúç]/i,
    threshold: 0.3,
    words: ['olá', 'obrigado', 'obrigada', 'sim', 'não', 'por favor', 'desculpe', 'ajuda']
  }
};

// Language detection function with caching for performance
const languageCache = new Map();
const CACHE_SIZE = 100;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Ultra-Enhanced Language Detection with Real-Time Performance
 * @param {string} text - Text to detect language from
 * @param {Object} options - Detection options
 * @returns {Object} Detected language with confidence and details
 */
function detectLanguageAdvanced(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return { language: 'unknown', confidence: 0, details: {} };
  }
  
  // Normalize text for better matching
  const normalizedText = text.toLowerCase().trim();
  const originalLength = text.length;
  
  // Quick exit for very short text
  if (normalizedText.length < 2) {
    return { language: 'unknown', confidence: 0, details: { reason: 'too_short' } };
  }
  
  // Check cache first for performance
  const cacheKey = normalizedText.substring(0, 50);
  if (languageCache.has(cacheKey)) {
    const cached = languageCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.result;
    }
    languageCache.delete(cacheKey);
  }
  
  // Maintain cache size
  if (languageCache.size >= CACHE_SIZE) {
    const oldestKey = [...languageCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    languageCache.delete(oldestKey);
  }
  
  // Enhanced script analysis
  const scriptAnalysis = analyzeScript(normalizedText);
  const scores = {};
  const details = {
    scriptAnalysis,
    wordMatches: {},
    patternMatches: {},
    confidence_factors: []
  };
  
  // CRITICAL: Enhanced Hinglish detection (most important for Indian telecalling)
  if (scriptAnalysis.hasDevanagari && scriptAnalysis.hasLatin) {
    // Strong indicator of Hinglish
    scores.hinglish = 0.6; // High base score for mixed script
    details.confidence_factors.push('mixed_script_detected');
    
    // Enhanced Hinglish pattern matching
    const hinglishPattern = languagePatterns.hinglish;
    let patternScore = 0;
    
    hinglishPattern.patterns.forEach((regex, index) => {
      const matches = normalizedText.match(regex);
      if (matches) {
        patternScore += matches.length * 0.15;
        details.patternMatches[`hinglish_pattern_${index}`] = matches.length;
      }
    });
    
    scores.hinglish += Math.min(patternScore, 0.3);
    
    // Word-based scoring for Hinglish
    let wordScore = 0;
    let totalWords = normalizedText.split(/\s+/).length;
    
    hinglishPattern.words.forEach(word => {
      const count = (normalizedText.match(new RegExp('\\b' + word + '\\b', 'gi')) || []).length;
      if (count > 0) {
        wordScore += count * 0.05;
        details.wordMatches[word] = count;
      }
    });
    
    scores.hinglish += Math.min(wordScore, 0.25);
    
    // Context clue bonus
    let contextScore = 0;
    hinglishPattern.contextClues.forEach(clue => {
      if (normalizedText.includes(clue)) {
        contextScore += 0.05;
        details.confidence_factors.push(`context_clue_${clue}`);
      }
    });
    
    scores.hinglish += Math.min(contextScore, 0.15);
    
  } else if (scriptAnalysis.hasDevanagari && !scriptAnalysis.hasLatin) {
    // Pure Hindi
    scores.hindi = 0.7; // High base score for pure Devanagari
    details.confidence_factors.push('pure_devanagari');
    
    const hindiPattern = languagePatterns.hindi;
    let wordScore = 0;
    
    hindiPattern.words.forEach(word => {
      const count = (normalizedText.match(new RegExp(word, 'gi')) || []).length;
      if (count > 0) {
        wordScore += count * 0.05;
        details.wordMatches[word] = count;
      }
    });
    
    scores.hindi += Math.min(wordScore, 0.3);
    
  } else if (!scriptAnalysis.hasDevanagari && scriptAnalysis.hasLatin) {
    // Latin script only - could be English or Roman Hindi
    
    // Check for Roman Hindi first
    const romanHindiPattern = languagePatterns.romanHindi || languagePatterns.hinglish;
    let romanHindiScore = 0;
    
    romanHindiPattern.words.forEach(word => {
      const count = (normalizedText.match(new RegExp('\\b' + word + '\\b', 'gi')) || []).length;
      if (count > 0) {
        romanHindiScore += count * 0.1;
        details.wordMatches[`roman_hindi_${word}`] = count;
      }
    });
    
    if (romanHindiScore > 0.2) {
      scores.hinglish = romanHindiScore;
      details.confidence_factors.push('roman_hindi_detected');
    }
    
    // Check for English
    const englishPattern = languagePatterns.english;
    let englishScore = 0.4; // Base score for Latin script
    
    // English word matching
    let englishWordScore = 0;
    englishPattern.words.forEach(word => {
      const count = (normalizedText.match(new RegExp('\\b' + word + '\\b', 'gi')) || []).length;
      if (count > 0) {
        englishWordScore += count * 0.05;
        details.wordMatches[`english_${word}`] = count;
      }
    });
    
    englishScore += Math.min(englishWordScore, 0.4);
    
    // English pattern matching
    let englishPatternScore = 0;
    englishPattern.patterns.forEach((regex, index) => {
      const matches = normalizedText.match(regex);
      if (matches) {
        englishPatternScore += matches.length * 0.05;
        details.patternMatches[`english_pattern_${index}`] = matches.length;
      }
    });
    
    englishScore += Math.min(englishPatternScore, 0.2);
    
    scores.english = englishScore;
  }
  
  // Process other languages (lower priority)
  Object.keys(languagePatterns).forEach(lang => {
    if (['hinglish', 'hindi', 'english', 'romanHindi'].includes(lang)) return; // Already processed
    
    const pattern = languagePatterns[lang];
    if (!pattern) return;
    
    let score = 0;
    
    // Regex-based detection
    if (pattern.regex && pattern.regex.test(normalizedText)) {
      score += 0.3;
    }
    
    // Word-based detection
    if (pattern.words) {
      let wordMatches = 0;
      pattern.words.forEach(word => {
        if (normalizedText.includes(word)) {
          wordMatches++;
        }
      });
      score += (wordMatches / pattern.words.length) * 0.5;
    }
    
    if (score > (pattern.threshold || 0.3)) {
      scores[lang] = score * (pattern.confidence_boost || 1.0);
    }
  });
  
  // Determine final language and confidence
  const topLanguages = Object.entries(scores)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3);
  
  if (topLanguages.length === 0) {
    const result = { language: 'unknown', confidence: 0, details };
    cacheResult(cacheKey, result);
    return result;
  }
  
  const [topLanguage, topScore] = topLanguages[0];
  
  // Enhanced confidence calculation
  let confidence = Math.min(topScore, 1.0);
  
  // Boost confidence based on text length and clarity
  if (originalLength > 20) confidence = Math.min(confidence * 1.1, 1.0);
  if (originalLength > 50) confidence = Math.min(confidence * 1.05, 1.0);
  
  // Reduce confidence if multiple languages have similar scores
  if (topLanguages.length > 1) {
    const [, secondScore] = topLanguages[1];
    const scoreDiff = topScore - secondScore;
    if (scoreDiff < 0.2) {
      confidence *= 0.8;
      details.confidence_factors.push('multiple_language_candidates');
    }
  }
  
  // Language mapping
  const languageMap = {
    'hinglish': 'mixed',
    'hindi': 'hi-IN',
    'english': 'en-US',
    'romanHindi': 'mixed'
  };
  
  const finalLanguage = languageMap[topLanguage] || topLanguage;
  const result = {
    language: finalLanguage,
    confidence: Math.round(confidence * 100) / 100,
    details: {
      ...details,
      topCandidates: topLanguages,
      originalText: text.substring(0, 100),
      textLength: originalLength
    }
  };
  
  // Cache the result
  cacheResult(cacheKey, result);
  
  return result;
}

/**
 * Analyze script composition of text
 * @param {string} text - Text to analyze
 * @returns {Object} Script analysis
 */
function analyzeScript(text) {
  const analysis = {
    hasDevanagari: /[\u0900-\u097F]/.test(text),
    hasLatin: /[a-zA-Z]/.test(text),
    hasNumbers: /\d/.test(text),
    hasPunctuation: /[.,!?;:]/.test(text),
    totalChars: text.length,
    devanagariRatio: 0,
    latinRatio: 0
  };
  
  if (analysis.totalChars > 0) {
    const devanagariChars = (text.match(/[\u0900-\u097F]/g) || []).length;
    const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
    
    analysis.devanagariRatio = devanagariChars / analysis.totalChars;
    analysis.latinRatio = latinChars / analysis.totalChars;
  }
  
  return analysis;
}

/**
 * Cache detection result
 * @param {string} key - Cache key
 * @param {Object} result - Detection result
 */
function cacheResult(key, result) {
  languageCache.set(key, {
    result: { ...result },
    timestamp: Date.now()
  });
}

/**
 * Enhanced language detection for Hindi-English mixing
 * @param {string} text - The text to analyze
 * @returns {boolean} - True if text is likely Hindi-English mix
 */
function detectHindiEnglishMix(text) {
  if (!text || typeof text !== 'string') return false;
  
  // Check for presence of both Hindi and English
  const hasHindi = languagePatterns.hindi.regex.test(text);
  const hasEnglish = /[a-zA-Z]{2,}/.test(text);
  
  // If both scripts present, very likely mixed
  if (hasHindi && hasEnglish) return true;
  
  // Check for transliterated Hindi words in Latin script
  const hinglishWords = [
    'kya', 'aap', 'haan', 'nahi', 'kitna', 'kitne', 'kaise', 'kyun', 'mein', 'hai',
    'nahin', 'achcha', 'theek', 'bahut', 'lekin', 'aur', 'jab', 'tab', 'kab',
    'samay', 'paise', 'rupaye', 'samajh', 'batao', 'suniye', 'dekhiye'
  ];
  
  // Check for presence of transliterated Hindi words
  const words = text.toLowerCase().split(/\s+/);
  const hinglishWordCount = words.filter(word => hinglishWords.includes(word)).length;
  const englishWordCount = words.filter(word => 
    /^[a-zA-Z]+$/.test(word) && !hinglishWords.includes(word.toLowerCase())
  ).length;
  
  // If we have both transliterated Hindi and English words
  if (hinglishWordCount > 0 && englishWordCount > 0) {
    return true;
  }
  
  // Credit card sales specific check - common patterns in Indian sales calls
  const creditCardMixPatterns = [
    /credit card (ke|ka|ki|ko|mein)/i,
    /(kitne|kitna) (percent|rate|fee)/i,
    /(haan|nahi) (sir|madam), (card|credit)/i
  ];
  
  // Check for patterns
  return creditCardMixPatterns.some(pattern => pattern.test(text));
}

// Export the advanced detection
module.exports = {
  detectLanguageAdvanced,
  getSupportedLanguages: () => Object.keys(languagePatterns).concat(['english']),
  detectHindiEnglishMix
};
