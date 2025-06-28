const Call = require('../models/Call');
const Customer = require('../models/Customer');

// Controller for dashboard data
const dashboardController = {
  // Get dashboard metrics
  getMetrics: async (req, res) => {
    try {
      // Check if MongoDB is available
      if (!global.isMongoDBAvailable || !global.isMongoDBAvailable()) {
        return res.json({
          success: true,
          data: {
            totalCalls: 0,
            activeCalls: 0,
            completedCalls: 0,
            customers: 0,
            conversionRate: 0,
            averageCallDuration: 0,
            callsToday: 0,
            note: 'Database unavailable - showing default values'
          }
        });
      }

      // Get total calls
      const totalCalls = await Call.countDocuments();
      
      // Get active calls
      const activeCalls = await Call.countDocuments({ status: { $in: ['initiated', 'in-progress'] } });
      
      // Get completed calls
      const completedCalls = await Call.countDocuments({ status: 'completed' });
      
      // Get total customers
      const customers = await Customer.countDocuments();
      
      // Get successful calls (those that completed with positive outcome)
      const successfulCalls = await Call.countDocuments({ 
        status: 'completed',
        outcome: 'successful'
      });
      
      // Calculate conversion rate
      const conversionRate = completedCalls > 0
        ? Math.round((successfulCalls / completedCalls) * 100)
        : 0;

      res.json({
        totalCalls,
        activeCalls,
        completedCalls,
        customers,
        successfulCalls,
        conversionRate
      });
    } catch (error) {
      console.error('Error fetching metrics:', error);
      // Return default values instead of error when MongoDB is not available
      res.json({
        success: true,
        data: {
          totalCalls: 0,
          activeCalls: 0,
          completedCalls: 0,
          customers: 0,
          conversionRate: 0,
          note: 'Database error - showing default values'
        }
      });
    }
  },
  
  // Get call statistics for charts
  getCallStatistics: async (req, res) => {
    try {
      // Check if MongoDB is available
      if (!global.isMongoDBAvailable || !global.isMongoDBAvailable()) {
        // Return mock data for charts when database is unavailable
        const mockData = [];
        for (let i = 29; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          mockData.push({
            _id: date.toISOString().split('T')[0],
            totalCalls: 0,
            successfulCalls: 0,
            date: date.toISOString().split('T')[0]
          });
        }
        
        return res.json({
          success: true,
          data: mockData,
          note: 'Database unavailable - showing empty chart data'
        });
      }

      // Get calls grouped by day for the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const callStats = await Call.aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);
      
      // Get current counts
      const [totalCalls, activeCalls, completedCalls] = await Promise.all([
        Call.countDocuments(),
        Call.countDocuments({ status: { $in: ['initiated', 'in-progress'] } }),
        Call.countDocuments({ status: 'completed' })
      ]);

      // Format data for frontend
      const trend = callStats
        .sort((a, b) => b._id.localeCompare(a._id))  // Sort descending
        .slice(0, 7)  // Get last 7 days
        .reverse()    // Reverse back to ascending
        .map(stat => ({
          label: new Date(stat._id).toLocaleDateString('en-US', { weekday: 'short' }),
          value: stat.count
        }));

      res.json({
        totalCalls,
        activeCalls,
        completedCalls,
        trend
      });
    } catch (error) {
      console.error('Error fetching call statistics:', error);
      // Return default trend data instead of error
      const mockTrend = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        mockTrend.push({
          label: date.toLocaleDateString('en-US', { weekday: 'short' }),
          value: 0
        });
      }
      
      res.json({
        success: true,
        totalCalls: 0,
        activeCalls: 0,
        completedCalls: 0,
        trend: mockTrend,
        note: 'Database error - showing default values'
      });
    }
  },
  
  // Get conversion rate for charts
  getConversionRate: async (req, res) => {
    try {
      // Check if MongoDB is available
      if (!global.isMongoDBAvailable || !global.isMongoDBAvailable()) {
        // Return mock data for conversion rate charts when database is unavailable
        const mockData = [];
        for (let i = 29; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          mockData.push({
            _id: date.toISOString().split('T')[0],
            total: 0,
            successful: 0,
            conversionRate: 0,
            date: date.toISOString().split('T')[0]
          });
        }
        
        return res.json({
          success: true,
          data: mockData,
          note: 'Database unavailable - showing empty conversion data'
        });
      }

      // Get calls grouped by day for the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const conversionStats = await Call.aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo },
            status: 'completed'  // Only consider completed calls
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            total: { $sum: 1 },
            successful: {
              $sum: {
                $cond: [{ $eq: ['$outcome', 'successful'] }, 1, 0]
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            date: '$_id',
            conversionRate: {
              $cond: [
                { $eq: ['$total', 0] },
                0,
                { $multiply: [{ $divide: ['$successful', '$total'] }, 100] }
              ]
            }
          }
        },
        {
          $sort: { date: -1 }
        },
        {
          $limit: 7  // Get last 7 days
        },
        {
          $sort: { date: 1 }  // Sort ascending for display
        }
      ]);
      
      // Format data for frontend
      const trend = conversionStats.map(stat => ({
        label: new Date(stat.date).toLocaleDateString('en-US', { weekday: 'short' }),
        value: Math.round(stat.conversionRate)
      }));
      
      // Calculate overall conversion rate
      const [completed, successful] = await Promise.all([
        Call.countDocuments({ status: 'completed' }),
        Call.countDocuments({ status: 'completed', outcome: 'successful' })
      ]);
      
      const rate = completed > 0
        ? Math.round((successful / completed) * 100)
        : 0;

      res.json({
        rate,
        trend
      });
    } catch (error) {
      console.error('Error fetching conversion rate:', error);
      // Return default conversion rate data instead of error
      const mockTrend = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        mockTrend.push({
          label: date.toLocaleDateString('en-US', { weekday: 'short' }),
          value: 0
        });
      }
      
      res.json({
        success: true,
        rate: 0,
        trend: mockTrend,
        note: 'Database error - showing default values'
      });
    }
  }
};

module.exports = dashboardController;
