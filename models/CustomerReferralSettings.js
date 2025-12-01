const mongoose = require('mongoose');

const customerReferralSettingsSchema = new mongoose.Schema(
  {
    // Reward for referrer when referred customer completes first booking
    referrerReward: {
      type: Number,
      required: true,
      default: 100,
      min: 0
    },
    
    // Discount for referred customer on their first booking
    referredDiscount: {
      type: Number,
      required: true,
      default: 50,
      min: 0
    },
    
    // Maximum discount that can be applied (to prevent abuse)
    maxDiscountAmount: {
      type: Number,
      default: 50,
      min: 0
    },
    
    // Minimum booking amount to qualify for referral rewards
    minBookingAmount: {
      type: Number,
      default: 100,
      min: 0
    },
    
    // Is customer referral system active
    isActive: {
      type: Boolean,
      default: true
    },
    
    // Terms and conditions
    terms: {
      type: [String],
      default: [
        'Referral code must be entered during registration',
        'Discount applies only on first booking',
        'Referrer gets reward after referred customer completes first booking',
        'Minimum booking amount applies'
      ]
    },
    
    // Last updated by admin
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    }
  },
  {
    timestamps: true
  }
);

// Ensure only one settings document exists (singleton pattern)
customerReferralSettingsSchema.index({ _id: 1 }, { unique: true });

module.exports = mongoose.model('CustomerReferralSettings', customerReferralSettingsSchema);
