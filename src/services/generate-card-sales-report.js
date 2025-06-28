/**
 * Credit Card Sales Report Generator
 * Generates comprehensive reports for credit card sales performance
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Call = require('../models/Call');
const { logger } = require('../utils/logger');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  logger.info('Connected to MongoDB successfully');
  await generateSalesReport();
  process.exit(0);
}).catch((err) => {
  logger.error('MongoDB connection error:', err);
  process.exit(1);
});

/**
 * Generate comprehensive sales report
 */
async function generateSalesReport() {
  try {
    // Create reports directory if it doesn't exist
    const reportsDir = path.join(__dirname, '../../reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    logger.info('Generating credit card sales performance report...');
    
    // Get overall sales metrics
    const overallMetrics = await getOverallMetrics();
    
    // Get metrics by card type
    const cardTypeMetrics = await getCardTypeMetrics();
    
    // Get metrics by language
    const languageMetrics = await getLanguageMetrics();
    
    // Get interruption analysis
    const interruptionAnalysis = await getInterruptionAnalysis();
    
    // Get conversion funnel
    const conversionFunnel = await getConversionFunnel();
    
    // Generate report
    const report = {
      generatedAt: new Date(),
      overallMetrics,
      cardTypeMetrics,
      languageMetrics,
      interruptionAnalysis,
      conversionFunnel
    };
    
    // Save report to file
    const reportFilePath = path.join(reportsDir, `credit-card-sales-report-${Date.now()}.json`);
    fs.writeFileSync(reportFilePath, JSON.stringify(report, null, 2));
    
    // Generate CSV files for easy import
    generateCsvFiles(report, reportsDir);
    
    logger.info(`Report generated successfully and saved to ${reportFilePath}`);
    logger.info('CSV files generated for easy import to spreadsheets');
    logger.info(`Total calls analyzed: ${overallMetrics.totalCalls}`);
    logger.info(`Overall conversion rate: ${overallMetrics.conversionRate.toFixed(2)}%`);
    
    return report;
  } catch (error) {
    logger.error('Error generating sales report:', error);
    throw error;
  }
}

/**
 * Get overall sales metrics
 */
async function getOverallMetrics() {
  const totalCalls = await Call.countDocuments({ 'creditCardSales': { $exists: true } });
  const completedApplications = await Call.countDocuments({ 'creditCardSales.applicationStatus': 'completed' });
  const conversionRate = totalCalls > 0 ? (completedApplications / totalCalls) * 100 : 0;
  
  const avgCallDuration = await Call.aggregate([
    { $match: { 'creditCardSales': { $exists: true } } },
    { $group: { _id: null, avgDuration: { $avg: '$duration' } } }
  ]);
  
  const avgInterruptions = await Call.aggregate([
    { $match: { 'creditCardSales': { $exists: true } } },
    { $group: { _id: null, avgInterruptions: { $avg: '$creditCardSales.interruptions' } } }
  ]);
  
  return {
    totalCalls,
    completedApplications,
    conversionRate,
    avgCallDuration: avgCallDuration[0]?.avgDuration || 0,
    avgInterruptions: avgInterruptions[0]?.avgInterruptions || 0,
    period: {
      start: await getFirstCallDate(),
      end: await getLastCallDate()
    }
  };
}

/**
 * Get metrics by card type
 */
async function getCardTypeMetrics() {
  return Call.aggregate([
    { $match: { 'creditCardSales': { $exists: true } } },
    { $group: {
      _id: '$creditCardSales.cardType',
      totalCalls: { $sum: 1 },
      completedApplications: {
        $sum: { $cond: [{ $eq: ['$creditCardSales.applicationStatus', 'completed'] }, 1, 0] }
      },
      avgInterest: { $avg: '$creditCardSales.customerInterest' },
      avgInterruptions: { $avg: '$creditCardSales.interruptions' },
      totalDuration: { $sum: '$duration' }
    }},
    { $project: {
      cardType: '$_id',
      totalCalls: 1,
      completedApplications: 1,
      conversionRate: {
        $multiply: [{ $divide: ['$completedApplications', '$totalCalls'] }, 100]
      },
      avgInterest: 1,
      avgInterruptions: 1,
      avgCallDuration: { $divide: ['$totalDuration', '$totalCalls'] }
    }},
    { $sort: { totalCalls: -1 } }
  ]);
}

/**
 * Get metrics by language
 */
async function getLanguageMetrics() {
  return Call.aggregate([
    { $match: { 'creditCardSales': { $exists: true } } },
    { $group: {
      _id: '$creditCardSales.language',
      totalCalls: { $sum: 1 },
      completedApplications: {
        $sum: { $cond: [{ $eq: ['$creditCardSales.applicationStatus', 'completed'] }, 1, 0] }
      },
      avgInterest: { $avg: '$creditCardSales.customerInterest' },
      avgInterruptions: { $avg: '$creditCardSales.interruptions' }
    }},
    { $project: {
      language: '$_id',
      totalCalls: 1,
      completedApplications: 1,
      conversionRate: {
        $multiply: [{ $divide: ['$completedApplications', '$totalCalls'] }, 100]
      },
      avgInterest: 1,
      avgInterruptions: 1
    }},
    { $sort: { totalCalls: -1 } }
  ]);
}

/**
 * Get interruption analysis
 */
async function getInterruptionAnalysis() {
  const interruptionDistribution = await Call.aggregate([
    { $match: { 'creditCardSales': { $exists: true } } },
    { $group: {
      _id: '$creditCardSales.interruptions',
      count: { $sum: 1 }
    }},
    { $sort: { _id: 1 } }
  ]);
  
  const interruptionImpact = await Call.aggregate([
    { $match: { 'creditCardSales': { $exists: true } } },
    { $bucket: {
      groupBy: '$creditCardSales.interruptions',
      boundaries: [0, 1, 3, 5, 10, 50],
      default: 'more',
      output: {
        count: { $sum: 1 },
        completedApplications: {
          $sum: { $cond: [{ $eq: ['$creditCardSales.applicationStatus', 'completed'] }, 1, 0] }
        },
        avgInterest: { $avg: '$creditCardSales.customerInterest' }
      }
    }},
    { $project: {
      range: '$_id',
      count: 1,
      completedApplications: 1,
      conversionRate: {
        $multiply: [{ $divide: ['$completedApplications', '$count'] }, 100]
      },
      avgInterest: 1
    }}
  ]);
  
  return {
    interruptionDistribution,
    interruptionImpact
  };
}

/**
 * Get conversion funnel
 */
async function getConversionFunnel() {
  const totalCalls = await Call.countDocuments({ 'creditCardSales': { $exists: true } });
  const interestedCustomers = await Call.countDocuments({ 
    'creditCardSales': { $exists: true },
    'creditCardSales.customerInterest': { $gte: 50 }
  });
  const applicationStarted = await Call.countDocuments({ 
    'creditCardSales.applicationStatus': 'in_progress'
  });
  const applicationCompleted = await Call.countDocuments({ 
    'creditCardSales.applicationStatus': 'completed' 
  });
  
  return {
    stages: [
      { name: 'Total Calls', count: totalCalls },
      { name: 'Interested Customers', count: interestedCustomers },
      { name: 'Application Started', count: applicationStarted },
      { name: 'Application Completed', count: applicationCompleted }
    ],
    conversionRates: {
      totalToInterested: totalCalls > 0 ? (interestedCustomers / totalCalls) * 100 : 0,
      interestedToStarted: interestedCustomers > 0 ? (applicationStarted / interestedCustomers) * 100 : 0,
      startedToCompleted: applicationStarted > 0 ? (applicationCompleted / applicationStarted) * 100 : 0,
      overallConversion: totalCalls > 0 ? (applicationCompleted / totalCalls) * 100 : 0
    }
  };
}

/**
 * Get first call date
 */
async function getFirstCallDate() {
  const firstCall = await Call.findOne(
    { 'creditCardSales': { $exists: true } }, 
    'createdAt'
  ).sort({ createdAt: 1 });
  
  return firstCall ? firstCall.createdAt : new Date();
}

/**
 * Get last call date
 */
async function getLastCallDate() {
  const lastCall = await Call.findOne(
    { 'creditCardSales': { $exists: true } }, 
    'createdAt'
  ).sort({ createdAt: -1 });
  
  return lastCall ? lastCall.createdAt : new Date();
}

/**
 * Generate CSV files for easy import
 */
function generateCsvFiles(report, reportsDir) {
  // Overall metrics CSV
  const overallCsv = 'Metric,Value\n' +
    `Total Calls,${report.overallMetrics.totalCalls}\n` +
    `Completed Applications,${report.overallMetrics.completedApplications}\n` +
    `Conversion Rate,${report.overallMetrics.conversionRate.toFixed(2)}%\n` +
    `Avg Call Duration,${Math.round(report.overallMetrics.avgCallDuration)}s\n` +
    `Avg Interruptions,${report.overallMetrics.avgInterruptions.toFixed(1)}`;
  
  fs.writeFileSync(path.join(reportsDir, 'overall-metrics.csv'), overallCsv);
  
  // Card type metrics CSV
  let cardTypeCsv = 'Card Type,Total Calls,Completed Applications,Conversion Rate,Avg Interest,Avg Interruptions,Avg Call Duration\n';
  report.cardTypeMetrics.forEach(metric => {
    cardTypeCsv += `${metric.cardType},${metric.totalCalls},${metric.completedApplications},${metric.conversionRate.toFixed(2)}%,${metric.avgInterest.toFixed(1)},${metric.avgInterruptions.toFixed(1)},${Math.round(metric.avgCallDuration)}s\n`;
  });
  
  fs.writeFileSync(path.join(reportsDir, 'card-type-metrics.csv'), cardTypeCsv);
  
  // Language metrics CSV
  let languageCsv = 'Language,Total Calls,Completed Applications,Conversion Rate,Avg Interest,Avg Interruptions\n';
  report.languageMetrics.forEach(metric => {
    languageCsv += `${metric.language},${metric.totalCalls},${metric.completedApplications},${metric.conversionRate.toFixed(2)}%,${metric.avgInterest.toFixed(1)},${metric.avgInterruptions.toFixed(1)}\n`;
  });
  
  fs.writeFileSync(path.join(reportsDir, 'language-metrics.csv'), languageCsv);
  
  // Conversion funnel CSV
  let funnelCsv = 'Stage,Count\n';
  report.conversionFunnel.stages.forEach(stage => {
    funnelCsv += `${stage.name},${stage.count}\n`;
  });
  
  fs.writeFileSync(path.join(reportsDir, 'conversion-funnel.csv'), funnelCsv);
}
