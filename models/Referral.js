const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema(
  {
    // The user who is referring (has referral code)
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RaidoDropUsers',
      required: true
    },
    referrerPhone: {
      type: String,
      required: true
    },
    referrerName: {
      type: String,
      required: true
    },
    referralCode: {
      type: String,
      required: true,
      index: true
    },

    // The user who was referred (used the referral code)
    referredUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RaidoDropUsers',
      required: true
    },
    referredUserPhone: {
      type: String,
      required: true
    },
    referredUserName: {
      type: String,
      required: true
    },
    referredUserRole: {
      type: String,
      enum: ['customer', 'rider'],
      required: true
    },
    
    // Referral type: 'rider' for rider referrals (milestone-based), 'customer' for customer referrals (one-time)
    referralType: {
      type: String,
      enum: ['rider', 'customer'],
      required: true,
      default: 'rider'
    },

    // Referral Details
    vehicleType: {
      type: String,
      enum: ['2W', '3W', 'Truck', null], // Allow null for customer referrals
      default: null
    },
    rewardAmount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'paid', 'cancelled'],
      default: 'pending'
    },

    // Payment tracking
    isPaid: {
      type: Boolean,
      default: false
    },
    paidAt: {
      type: Date,
      default: null
    },
    transactionId: {
      type: String,
      default: null
    },

    // Campaign info
    campaignType: {
      type: String,
      default: 'default'
    },

    // Milestone tracking
    totalRidesCompleted: {
      type: Number,
      default: 0
    },
    lastRideCompletedAt: {
      type: Date,
      default: null
    },
    activationDate: {
      type: Date,
      default: Date.now
    },
    milestonesCompleted: [
      {
        milestoneId: Number,
        title: String,
        rides: Number,
        reward: Number,
        completedAt: Date,
        rewardCredited: Boolean,
        transactionId: String
      }
    ],

    // Additional info
    notes: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

// Index for faster queries
referralSchema.index({ referrerId: 1, status: 1 });
referralSchema.index({ referredUserId: 1 });
referralSchema.index({ referralCode: 1 });

module.exports = mongoose.model('Referral', referralSchema);
