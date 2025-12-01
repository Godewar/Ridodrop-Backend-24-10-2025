const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    lname: { type: String },
    email: { type: String, sparse: true, unique: true }, // sparse allows multiple null values but ensures unique non-null values
    phone: { type: String, required: true, unique: true },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    profilePhoto: { type: String },
    role: { type: String, enum: ['customer', 'rider'], required: true },
    walletBalance: { type: Number, default: 0 },
    isBlocked: { type: String, default: 'false' },
    status: { type: String, default: 'active', enum: ['active', 'inactive', 'blocked'] },
    customerId: { type: String, unique: true, sparse: true }, // sparse allows multiple null values
    referralCode: { type: String, unique: true, sparse: true }, // sparse allows multiple null values
    // Customer referral tracking
    firstBookingCompleted: { type: Boolean, default: false },
    referralDiscountUsed: { type: Boolean, default: false },
    // Rating system fields
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0 },
    ratingBreakdown: {
      oneStar: { type: Number, default: 0 },
      twoStar: { type: Number, default: 0 },
      threeStar: { type: Number, default: 0 },
      fourStar: { type: Number, default: 0 },
      fiveStar: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('RaidoDropUsers', userSchema);
