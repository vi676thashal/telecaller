const express = require('express');
const router = express.Router();
const KnowledgeBase = require('../models/KnowledgeBase');
const knowledgeBaseService = require('../services/knowledgeBaseService');

// Query knowledge base
router.post('/query', async (req, res) => {
  try {
    const { question, cardType = 'general', language = 'english', context = {} } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }

    const answer = await knowledgeBaseService.findAnswer(question, {
      cardType,
      language,
      ...context
    });

    if (answer) {
      res.json({
        success: true,
        data: {
          question,
          answer: answer.answer[language] || answer.answer.english,
          category: answer.category,
          cardType: answer.cardType,
          confidence: 0.9,
          source: 'knowledge_base'
        }
      });
    } else {
      // Try LLM fallback
      const llmResponse = await knowledgeBaseService.getLLMFallback(question, {
        cardType,
        language
      });

      res.json({
        success: true,
        data: {
          question,
          answer: llmResponse.response,
          confidence: llmResponse.confidence,
          source: llmResponse.source
        }
      });
    }

  } catch (error) {
    console.error('Error querying knowledge base:', error);
    res.status(500).json({
      success: false,
      message: 'Error querying knowledge base',
      error: error.message
    });
  }
});

// Get all knowledge base entries
router.get('/entries', async (req, res) => {
  try {
    const { 
      category, 
      cardType, 
      page = 1, 
      limit = 20,
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = { isActive: true };
    if (category) filter.category = category;
    if (cardType) filter.cardType = cardType;
    if (search) {
      filter.$or = [
        { question: { $regex: search, $options: 'i' } },
        { 'alternateQuestions': { $regex: search, $options: 'i' } },
        { keywords: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const entries = await KnowledgeBase.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await KnowledgeBase.countDocuments(filter);

    res.json({
      success: true,
      data: {
        entries,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalEntries: total,
          hasNext: skip + entries.length < total,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Error fetching KB entries:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching knowledge base entries',
      error: error.message
    });
  }
});

// Get specific knowledge base entry
router.get('/entries/:id', async (req, res) => {
  try {
    const entry = await KnowledgeBase.findById(req.params.id);
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge base entry not found'
      });
    }
    
    res.json({
      success: true,
      data: entry
    });
  } catch (error) {
    console.error('Error fetching KB entry:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching knowledge base entry',
      error: error.message
    });
  }
});

// Create new knowledge base entry
router.post('/entries', async (req, res) => {
  try {
    const entryData = req.body;
    
    // Validate required fields
    if (!entryData.category || !entryData.question || !entryData.answer) {
      return res.status(400).json({
        success: false,
        message: 'Category, question, and answer are required'
      });
    }

    // Ensure answer has both languages if not provided
    if (typeof entryData.answer === 'string') {
      entryData.answer = {
        english: entryData.answer,
        hindi: entryData.answer // You can translate this later
      };
    }

    const entry = await knowledgeBaseService.addEntry(entryData);
    
    res.status(201).json({
      success: true,
      message: 'Knowledge base entry created successfully',
      data: entry
    });
  } catch (error) {
    console.error('Error creating KB entry:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating knowledge base entry',
      error: error.message
    });
  }
});

// Update knowledge base entry
router.put('/entries/:id', async (req, res) => {
  try {
    const entry = await knowledgeBaseService.updateEntry(req.params.id, req.body);
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge base entry not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Knowledge base entry updated successfully',
      data: entry
    });
  } catch (error) {
    console.error('Error updating KB entry:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating knowledge base entry',
      error: error.message
    });
  }
});

// Delete knowledge base entry
router.delete('/entries/:id', async (req, res) => {
  try {
    const entry = await KnowledgeBase.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge base entry not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Knowledge base entry deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting KB entry:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting knowledge base entry',
      error: error.message
    });
  }
});

// Bulk import knowledge base entries
router.post('/import', async (req, res) => {
  try {
    const { entries } = req.body;
    
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Entries array is required'
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    for (const entryData of entries) {
      try {
        // Validate entry
        if (!entryData.category || !entryData.question || !entryData.answer) {
          results.failed.push({
            entry: entryData,
            error: 'Missing required fields: category, question, answer'
          });
          continue;
        }

        // Ensure answer format
        if (typeof entryData.answer === 'string') {
          entryData.answer = {
            english: entryData.answer,
            hindi: entryData.answer
          };
        }

        const entry = await knowledgeBaseService.addEntry(entryData);
        results.successful.push(entry);

      } catch (entryError) {
        results.failed.push({
          entry: entryData,
          error: entryError.message
        });
      }
    }

    res.json({
      success: true,
      message: `Import completed. ${results.successful.length} successful, ${results.failed.length} failed.`,
      data: results
    });

  } catch (error) {
    console.error('Error importing KB entries:', error);
    res.status(500).json({
      success: false,
      message: 'Error importing knowledge base entries',
      error: error.message
    });
  }
});

// Get knowledge base categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await KnowledgeBase.distinct('category', { isActive: true });
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error: error.message
    });
  }
});

// Get knowledge base analytics
router.get('/analytics', async (req, res) => {
  try {
    const analytics = await knowledgeBaseService.getAnalytics();
    
    // Additional analytics
    const categoryStats = await KnowledgeBase.aggregate([
      { $match: { isActive: true } },
      { $group: { 
          _id: '$category', 
          count: { $sum: 1 },
          avgUsage: { $avg: '$usage.timesUsed' },
          totalUsage: { $sum: '$usage.timesUsed' }
        }
      },
      { $sort: { totalUsage: -1 } }
    ]);

    const cardTypeStats = await KnowledgeBase.aggregate([
      { $match: { isActive: true } },
      { $group: { 
          _id: '$cardType', 
          count: { $sum: 1 },
          totalUsage: { $sum: '$usage.timesUsed' }
        }
      },
      { $sort: { totalUsage: -1 } }
    ]);

    const objectionStats = await KnowledgeBase.aggregate([
      { $match: { isActive: true, objectionType: { $exists: true } } },
      { $group: { 
          _id: '$objectionType', 
          count: { $sum: 1 },
          totalUsage: { $sum: '$usage.timesUsed' },
          avgSuccessRate: { $avg: '$usage.successRate' }
        }
      },
      { $sort: { totalUsage: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        ...analytics,
        categoryBreakdown: categoryStats,
        cardTypeBreakdown: cardTypeStats,
        objectionBreakdown: objectionStats
      }
    });

  } catch (error) {
    console.error('Error fetching KB analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching knowledge base analytics',
      error: error.message
    });
  }
});

// Search similar entries
router.post('/entries/:id/similar', async (req, res) => {
  try {
    const entry = await KnowledgeBase.findById(req.params.id);
    
    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Knowledge base entry not found'
      });
    }

    // Find similar entries based on keywords and category
    const similarEntries = await KnowledgeBase.find({
      _id: { $ne: entry._id },
      isActive: true,
      $or: [
        { category: entry.category },
        { cardType: entry.cardType },
        { keywords: { $in: entry.keywords } },
        { objectionType: entry.objectionType }
      ]
    }).limit(10);

    res.json({
      success: true,
      data: similarEntries
    });

  } catch (error) {
    console.error('Error finding similar entries:', error);
    res.status(500).json({
      success: false,
      message: 'Error finding similar entries',
      error: error.message
    });
  }
});

// Test objection handling
router.post('/test-objection', async (req, res) => {
  try {
    const { objectionText, cardType = 'general', language = 'english' } = req.body;

    if (!objectionText) {
      return res.status(400).json({
        success: false,
        message: 'Objection text is required'
      });
    }

    const result = await knowledgeBaseService.handleObjection(objectionText, {
      cardType,
      language
    });

    res.json({
      success: true,
      data: {
        objectionText,
        result,
        cardType,
        language
      }
    });

  } catch (error) {
    console.error('Error testing objection handling:', error);
    res.status(500).json({
      success: false,
      message: 'Error testing objection handling',
      error: error.message
    });
  }
});

module.exports = router;
