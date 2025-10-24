const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    vehicleType: {
      type: String,
      required: true,
      enum: ['2W', '3W', 'Truck', 'E-Loader']
    },
    subType: {
      type: String,
      required: true,
      unique: true // Ensure subType is unique (e.g., "Bike", "Scooter", "Auto")
    },
    displayName: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    image: {
      type: String,
      required: true // URL/path to the vehicle image
    },
    capacity: {
      type: String,
      default: ''
    },
    features: [
      {
        type: String
      }
    ],
    isActive: {
      type: Boolean,
      default: true
    },
    sortOrder: {
      type: Number,
      default: 0 // For ordering vehicles in the app
    }
  },
  {
    timestamps: true
  }
);

// Create compound index for efficient queries
vehicleSchema.index({ vehicleType: 1, isActive: 1 });

const Vehicle = mongoose.model('Vehicle', vehicleSchema);

module.exports = Vehicle;
