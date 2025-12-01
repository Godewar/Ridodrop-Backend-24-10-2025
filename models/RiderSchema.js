// const mongoose = require("mongoose");

// const RiderSchema = new mongoose.Schema(
//   {
//     name: { type: String },
//     phone: { type: String, required: true, unique: true },

//     email: { type: String },
//     gender: { type: String, enum: ["male", "female", "other"] },

//     vehicleType: {
//       type: String,

//     },
//     driverName: { type: String },
//     driverPhone: { type: String },
//     selfDriving: { type: String },
//     fueltype: { type: String },
//     vehicleregisterNumber: { type: String },
//     walletBalance: { type: Number, default: 0 },
//     isBlocked: { type: String },
//     ispaidFees: { type: String, default: "false" },
//     step: { type: String, default: "1" },
//     selectCity: { type: String },
//     images: {
//       profilePhoto: { type: String },
//       FrontaadharCard: { type: String },
//       BackaadharCard: { type: String },
//       panCard: { type: String },
//       vehicleimageFront: { type: String },
//       vehicleimageBack: { type: String },
//       vehicleRcFront: { type: String },
//       vehicleRcBack: { type: String },
//       vehicleInsurence: { type: String },
//       drivingLicenseFront: { type: String },
//       drivingLicenseBack: { type: String },
//     },

//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("RaiderSchema", RiderSchema);

const mongoose = require('mongoose');

const RiderSchema = new mongoose.Schema(
  {
    riderId: { type: String, unique: true, sparse: true },
    referralCode: { type: String, unique: true, sparse: true },
    name: { type: String },
    phone: { type: String, required: true, unique: true },

    email: { type: String },
    gender: { type: String, enum: ['male', 'female', 'other'] },

    vehicleType: {
      type: String
    },
    vehicleSubType: { type: String },
    truckSize: { type: String },
    threeWType: { type: String },
    truckBodyType: { type: String },
    driverName: { type: String },
    driverPhone: { type: String },
    selfDriving: { type: String },
    fueltype: { type: String },
    vehicleregisterNumber: { type: String },
    walletBalance: { type: Number, default: 0 },
    isBlocked: { type: String, default: 'false' },
    blockReason: { type: String },
    blockedAt: { type: Date },
    unblockedAt: { type: Date },
    status: { type: String, default: 'active', enum: ['active', 'inactive', 'blocked', 'pending', 'approved'] },
    isOnline: { type: Boolean, default: false },
    lastLocationUpdate: { type: Date },
    lastSeen: { type: Date },
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }
    },
    ispaidFees: { type: String, default: 'false' },
    step: { type: String, default: '1' },
    selectCity: { type: String },
    images: {
      profilePhoto: { type: String },
      FrontaadharCard: { type: String },
      BackaadharCard: { type: String },
      panCard: { type: String },
      vehicleimageFront: { type: String },
      vehicleimageBack: { type: String },
      vehicleRcFront: { type: String },
      vehicleRcBack: { type: String },
      vehicleInsurence: { type: String },
      drivingLicenseFront: { type: String },
      drivingLicenseBack: { type: String }
    },
    // Document approval tracking
    documentApprovals: {
      type: Map,
      of: String,
      default: {}
    },
    // Document rejection reasons
    documentRejectionReasons: {
      type: Map,
      of: String,
      default: {}
    },
    // Overall document status and rejection reason
    documentStatus: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
    rejectionReason: { type: String },
    // Expo push notification token for background notifications
    expoPushToken: { type: String },
    // Rating system fields
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0 },
    ratingBreakdown: {
      oneStar: { type: Number, default: 0 },
      twoStar: { type: Number, default: 0 },
      threeStar: { type: Number, default: 0 },
      fourStar: { type: Number, default: 0 },
      fiveStar: { type: Number, default: 0 }
    },
    // Preferred area for receiving priority orders
    preferredArea: {
      enabled: { type: Boolean, default: false },
      name: { type: String },
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String },
      updatedAt: { type: Date }
    }
  },
  { timestamps: true }
);

// Pre-save hook to generate riderId and referralCode
RiderSchema.pre('save', async function (next) {
  if (!this.riderId && this.isNew) {
    try {
      // Count existing riders to generate sequential ID
      const count = await this.constructor.countDocuments();
      this.riderId = `RDR${String(count + 1).padStart(4, '0')}`;
      console.log('✅ Generated riderId:', this.riderId);
    } catch (error) {
      console.error('❌ Error generating riderId:', error);
    }
  }
  
  // Generate referral code if not exists
  if (!this.referralCode && this.isNew) {
    this.referralCode = `REF${Date.now()}${Math.floor(Math.random() * 10000)}`;
    console.log('✅ Generated referralCode:', this.referralCode);
  }
  
  next();
});

// Create geospatial index for location-based queries
RiderSchema.index({ currentLocation: '2dsphere' });

module.exports = mongoose.model('RaiderSchema', RiderSchema);
