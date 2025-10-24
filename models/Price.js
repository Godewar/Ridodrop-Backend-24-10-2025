const mongoose = require('mongoose');

const priceSchema = new mongoose.Schema(
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
    kmRange: {
      type: String,
      required: true
    },
    rate: {
      type: Number,
      required: true
    },
    timeSlot: {
      type: String,
      required: true,
      enum: ['9 AM - 12 PM', '12 PM - 4 PM', '4 PM - 8 PM', '8 PM - 12 AM', '12 AM - 9 AM']
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

// Create compound index for efficient queries
priceSchema.index({ vehicleType: 1, subType: 1, kmRange: 1, timeSlot: 1 });

const Price = mongoose.model('Price', priceSchema);

module.exports = Price;
