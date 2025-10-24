const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    vehicleType: {
      type: String,
      required: true,
      enum: ['2W', '3W', 'Truck', 'E-Loader']
    },
    subType: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    startTime: {
      type: String,
      default: '00:00'
    },
    endTime: {
      type: String,
      default: '23:59'
    },
    priceMultiplier: {
      type: Number,
      default: 1.0,
      min: 0.1,
      max: 5.0
    },
    maxDistance: {
      type: Number,
      default: 50, // km
      min: 1
    },
    serviceFeatures: [
      {
        type: String,
        enum: ['door-to-door', 'express', 'scheduled', 'bulk', 'fragile-items']
      }
    ],
    restrictions: [
      {
        type: String
      }
    ],
    contactNumber: {
      type: String
    },
    serviceArea: {
      type: String
    }
  },
  {
    timestamps: true
  }
);

// Create compound index for efficient queries
serviceSchema.index({ vehicleType: 1, subType: 1, city: 1 }, { unique: true });
serviceSchema.index({ city: 1, isActive: 1 });

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;
