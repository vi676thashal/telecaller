const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String
  },
  // Credit card application specific fields
  age: {
    type: Number,
    min: 18,
    max: 100
  },
  occupation: {
    type: String,
    enum: ['salaried', 'self_employed', 'business_owner', 'retired', 'student', 'homemaker', 'other']
  },
  monthlyIncome: {
    type: String,
    enum: ['below_25k', '25k_50k', '50k_1l', '1l_2l', '2l_5l', '5l_plus', 'not_disclosed']
  },
  panCard: {
    type: String,
    match: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
  },
  aadharCard: {
    type: String,
    match: /^[0-9]{12}$/
  },
  city: {
    type: String
  },
  state: {
    type: String
  },
  pincode: {
    type: String,
    match: /^[0-9]{6}$/
  },
  // Interest and application tracking
  interestedCardType: {
    type: String
  },
  bankAppliedTo: {
    type: String
  },
  applicationStatus: {
    type: String,
    enum: ['interested', 'details_collected', 'application_submitted', 'approved', 'rejected', 'pending'],
    default: 'interested'
  },
  callHistory: [{
    callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Call'
    },
    date: {
      type: Date,
      default: Date.now
    },
    outcome: String,
    notes: String
  }],
  dateAdded: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Update lastUpdated on save
CustomerSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

module.exports = mongoose.model('Customer', CustomerSchema);
