const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    couponCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    discountType: {
      type: String,
      required: true,
      enum: ['Flat Amount', 'Percentage'],
      default: 'Percentage'
    },
    value: {
      type: Number,
      required: true,
      min: 0
    },
    usageLimit: {
      type: String,
      required: true,
      default: 'Unlimited'
    },
    usageLimitNumber: {
      type: Number,
      default: null
    },
    used: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Expired'],
      default: 'Active'
    },
    validityStart: {
      type: Date,
      required: true
    },
    validityEnd: {
      type: Date,
      required: true
    },
    createdBy: {
      type: String,
      required: true,
      default: 'Admin'
    },
    minOrderAmount: {
      type: Number,
      default: 0
    },
    maxDiscountAmount: {
      type: Number,
      default: null
    },
    applicableFor: {
      type: [String],
      enum: ['customer', 'driver', 'all'],
      default: ['all']
    },
    vehicleTypes: {
      type: [String],
      enum: ['2W', '3W', 'Truck', 'E-Loader', 'All'],
      default: ['All']
    },
    isFirstTimeUser: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// Virtual field to check if coupon is expired
couponSchema.virtual('isExpired').get(function () {
  return new Date() > this.validityEnd;
});

// Virtual field to get remaining uses
couponSchema.virtual('remainingUses').get(function () {
  if (this.usageLimit === 'Unlimited') return 'Unlimited';
  return Math.max(0, this.usageLimitNumber - this.used);
});

// Index for efficient queries
couponSchema.index({ couponCode: 1 });
couponSchema.index({ status: 1, validityEnd: 1 });
couponSchema.index({ createdBy: 1 });

// Pre-save middleware to update status based on validity and usage
couponSchema.pre('save', function (next) {
  const now = new Date();

  // Check if expired
  if (now > this.validityEnd) {
    this.status = 'Expired';
    this.isActive = false;
  }

  // Check if usage limit reached
  if (this.usageLimit !== 'Unlimited' && this.used >= this.usageLimitNumber) {
    this.status = 'Inactive';
    this.isActive = false;
  }

  next();
});

const Coupon = mongoose.model('Coupon', couponSchema);

module.exports = Coupon;
