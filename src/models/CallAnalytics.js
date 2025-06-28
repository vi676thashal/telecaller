/**
 * Call Analytics Model
 * Stores analytics data for credit card sales calls
 */

const mongoose = require('mongoose');

const CallAnalyticsSchema = new mongoose.Schema({
  callId: {
    type: String,
    required: true,
    unique: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  campaignId: {
    type: String,
    required: true
  },
  campaignName: String,
  cardType: {
    type: String,
    enum: ['rewards', 'cashback', 'travel', 'business', 'lowinterest'],
    required: true
  },
  customerSegment: {
    type: String,
    enum: ['premium', 'standard', 'new'],
    required: true
  },
  callDuration: Number, // in seconds
  callOutcome: {
    type: String,
    enum: ['completed', 'missed', 'busy', 'failed', 'no_answer'],
    required: true
  },
  applicationStatus: {
    started: Boolean,
    completed: Boolean,
    approved: Boolean,
    rejectionReason: String
  },
  callMetrics: {
    talkTime: Number, // in seconds
    customerTalkTime: Number, // in seconds
    agentTalkTime: Number, // in seconds
    silencePeriods: Number,
    interruptions: Number
  },
  demographics: {
    ageGroup: String,
    gender: String,
    location: String,
    existingCustomer: Boolean
  },
  sentimentAnalysis: {
    overall: Number, // -1 to 1 range
    beginning: Number,
    middle: Number,
    end: Number,
    keyPhrases: [String]
  },
  conversionPath: {
    callInitiated: Boolean,
    pitchDelivered: Boolean,
    interestExpressed: Boolean,
    applicationStarted: Boolean,
    applicationCompleted: Boolean,
    approved: Boolean
  },
  // Fields specific to credit card applications
  creditCardApplication: {
    cardType: String,
    initialLimit: Number,
    annualFee: Number,
    interestRate: Number,
    rewardPoints: Number,
    specialOffers: [String]
  }
});

// Add index for efficient querying by date range
CallAnalyticsSchema.index({ timestamp: 1 });
CallAnalyticsSchema.index({ 'cardType': 1, 'customerSegment': 1 });

// Add method to get aggregated analytics for a time period
CallAnalyticsSchema.statics.getCreditCardAnalytics = async function(startDate, endDate, filters = {}) {
  const matchQuery = {
    timestamp: {
      $gte: startDate,
      $lte: endDate
    }
  };
  
  // Add filters if provided
  if (filters.cardType) {
    matchQuery.cardType = filters.cardType;
  }
  
  if (filters.customerSegment) {
    matchQuery.customerSegment = filters.customerSegment;
  }
  
  try {
    // Get total calls
    const totalCalls = await this.countDocuments(matchQuery);
    
    // Get conversion metrics
    const conversionMetrics = await this.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalCalls: { $sum: 1 },
          applicationsStarted: {
            $sum: { $cond: [{ $eq: ["$applicationStatus.started", true] }, 1, 0] }
          },
          applicationsCompleted: {
            $sum: { $cond: [{ $eq: ["$applicationStatus.completed", true] }, 1, 0] }
          },
          applicationsApproved: {
            $sum: { $cond: [{ $eq: ["$applicationStatus.approved", true] }, 1, 0] }
          },
          avgDuration: { $avg: "$callDuration" }
        }
      }
    ]);
    
    // Get breakdown by card type
    const cardTypeBreakdown = await this.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$cardType",
          count: { $sum: 1 },
          applicationsStarted: {
            $sum: { $cond: [{ $eq: ["$applicationStatus.started", true] }, 1, 0] }
          },
          applicationsCompleted: {
            $sum: { $cond: [{ $eq: ["$applicationStatus.completed", true] }, 1, 0] }
          },
          applicationsApproved: {
            $sum: { $cond: [{ $eq: ["$applicationStatus.approved", true] }, 1, 0] }
          }
        }
      }
    ]);
    
    // Get breakdown by customer segment
    const segmentBreakdown = await this.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$customerSegment",
          count: { $sum: 1 },
          applicationsStarted: {
            $sum: { $cond: [{ $eq: ["$applicationStatus.started", true] }, 1, 0] }
          },
          applicationsCompleted: {
            $sum: { $cond: [{ $eq: ["$applicationStatus.completed", true] }, 1, 0] }
          },
          applicationsApproved: {
            $sum: { $cond: [{ $eq: ["$applicationStatus.approved", true] }, 1, 0] }
          }
        }
      }
    ]);
    
    // Get time series data (by day)
    const timeSeriesData = await this.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          calls: { $sum: 1 },
          started: {
            $sum: { $cond: [{ $eq: ["$applicationStatus.started", true] }, 1, 0] }
          },
          completed: {
            $sum: { $cond: [{ $eq: ["$applicationStatus.completed", true] }, 1, 0] }
          },
          approved: {
            $sum: { $cond: [{ $eq: ["$applicationStatus.approved", true] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    return {
      totalCalls,
      conversionMetrics: conversionMetrics[0] || {
        totalCalls: 0,
        applicationsStarted: 0,
        applicationsCompleted: 0,
        applicationsApproved: 0,
        avgDuration: 0
      },
      cardTypeBreakdown,
      segmentBreakdown,
      timeSeriesData
    };
  } catch (error) {
    console.error('Error generating analytics:', error);
    throw error;
  }
};

const CallAnalytics = mongoose.model('CallAnalytics', CallAnalyticsSchema);

module.exports = CallAnalytics;
