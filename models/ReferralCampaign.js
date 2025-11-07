const mongoose = require('mongoose');

const referralCampaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    vehicleType: {
      type: String,
      required: true,
      enum: ['2W', '3W', 'Truck'],
      index: true
    },
    rewardAmount: {
      type: Number,
      required: true,
      min: 0
    },
    // Milestone-based rewards (stepwise earnings)
    milestones: {
      type: [
        {
          id: { type: Number, required: true },
          title: { type: String, required: true },
          description: { type: String, required: true },
          rides: { type: Number, required: true, min: 0 }, // 0 for activation, 10, 25, 50, 75 for ride milestones
          reward: { type: Number, required: true, min: 0 },
          daysToComplete: { type: Number, default: null } // null for no limit
        }
      ],
      default: []
    },
    // Maximum total reward (sum of all milestones)
    maxReward: {
      type: Number,
      default: function () {
        return this.rewardAmount;
      }
    },
    icon: {
      type: String,
      default: 'bike',
      enum: ['bike', 'auto', 'truck', 'local_shipping', 'two_wheeler', 'three_wheeler']
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    terms: {
      type: [String],
      default: []
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      default: null
    },
    priority: {
      type: Number,
      default: 0
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient queries
referralCampaignSchema.index({ vehicleType: 1, isActive: 1 });
referralCampaignSchema.index({ priority: -1 });

module.exports = mongoose.model('ReferralCampaign', referralCampaignSchema);
