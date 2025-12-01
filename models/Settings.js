const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    // Platform fee percentages by vehicle type
    platformFees: {
      '2W': {
        type: Number,
        default: 8, // 8% for bikes
        min: 0,
        max: 50
      },
      '3W': {
        type: Number,
        default: 10, // 10% for 3-wheelers
        min: 0,
        max: 50
      },
      'Truck': {
        type: Number,
        default: 12, // 12% for trucks
        min: 0,
        max: 50
      },
      'E-Loader': {
        type: Number,
        default: 11, // 11% for e-loaders
        min: 0,
        max: 50
      }
    },

    // GST percentage (applies to platform fee)
    gstPercentage: {
      type: Number,
      default: 0, // 0% for now, admin can change later
      min: 0,
      max: 30
    },

    // Booking amount breakdown percentages for display
    displayBreakdown: {
      baseFarePercentage: {
        type: Number,
        default: 60, // 60% shown as base fare
        min: 1,
        max: 100
      },
      distanceChargePercentage: {
        type: Number,
        default: 25, // 25% shown as distance charge
        min: 0,
        max: 100
      },
      serviceTaxPercentage: {
        type: Number,
        default: 15, // 15% shown as service tax
        min: 0,
        max: 100
      }
    },

    // Settings metadata
    isActive: {
      type: Boolean,
      default: true
    },
    version: {
      type: String,
      default: '1.0.0'
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    effectiveFrom: {
      type: Date,
      default: Date.now
    },

    // Additional configuration options
    configuration: {
      // Minimum booking amount
      minimumBookingAmount: {
        type: Number,
        default: 50
      },
      // Maximum platform fee cap (absolute amount)
      maxPlatformFeeCap: {
        type: Number,
        default: 1000 // Max ₹1000 platform fee per booking
      },
      // Currency
      currency: {
        type: String,
        default: 'INR'
      }
    }
  },
  {
    timestamps: true
  }
);

// Compound index for efficient queries
settingsSchema.index({ isActive: 1, effectiveFrom: -1 });

// Virtual field to get platform fee for a specific vehicle type
settingsSchema.methods.getPlatformFeePercentage = function(vehicleType) {
  const normalizedType = this.normalizeVehicleType(vehicleType);
  return this.platformFees[normalizedType] || this.platformFees['Truck']; // Default to Truck if not found
};

// Method to normalize vehicle type names
settingsSchema.methods.normalizeVehicleType = function(vehicleType) {
  if (!vehicleType) return 'Truck';
  
  const type = vehicleType.toString().toLowerCase();
  
  if (type.includes('2w') || type.includes('bike') || type.includes('scooter')) {
    return '2W';
  }
  if (type.includes('3w') || type.includes('auto') || type.includes('rickshaw')) {
    return '3W';
  }
  if (type.includes('e-loader') || type.includes('eloader')) {
    return 'E-Loader';
  }
  if (type.includes('truck') || type.includes('mini') || type.includes('pickup')) {
    return 'Truck';
  }
  
  return 'Truck'; // Default fallback
};

// Method to calculate fee breakdown
settingsSchema.methods.calculateFeeBreakdown = function(totalAmount, vehicleType) {
  const platformFeePercentage = this.getPlatformFeePercentage(vehicleType);
  const platformFee = Math.round((totalAmount * platformFeePercentage) / 100);
  
  // Apply platform fee cap if configured
  const cappedPlatformFee = Math.min(platformFee, this.configuration.maxPlatformFeeCap);
  
  // Calculate GST on platform fee
  const gstAmount = Math.round((cappedPlatformFee * this.gstPercentage) / 100);
  
  // Calculate rider earnings (total - platform fee - GST)
  const riderEarnings = totalAmount - cappedPlatformFee - gstAmount;
  
  // Calculate display breakdown (for customer bill)
  const baseFare = Math.round((totalAmount * this.displayBreakdown.baseFarePercentage) / 100);
  const distanceCharge = Math.round((totalAmount * this.displayBreakdown.distanceChargePercentage) / 100);
  const serviceTax = totalAmount - baseFare - distanceCharge; // Remaining amount
  
  return {
    totalAmount: totalAmount,
    vehicleType: this.normalizeVehicleType(vehicleType),
    
    // Platform calculations (backend only)
    platformFeePercentage: platformFeePercentage,
    platformFee: cappedPlatformFee,
    gstPercentage: this.gstPercentage,
    gstAmount: gstAmount,
    riderEarnings: Math.max(riderEarnings, 0), // Ensure non-negative
    
    // Display breakdown (for customer)
    displayBreakdown: {
      baseFare: baseFare,
      distanceCharge: distanceCharge,
      serviceTax: serviceTax,
      discount: 0, // Will be applied separately
      finalAmount: totalAmount
    },
    
    // Metadata
    calculatedAt: new Date(),
    settingsVersion: this.version
  };
};

// Pre-save validation
settingsSchema.pre('save', function(next) {
  // Ensure breakdown percentages don't exceed 100%
  const totalBreakdown = this.displayBreakdown.baseFarePercentage + 
                        this.displayBreakdown.distanceChargePercentage + 
                        this.displayBreakdown.serviceTaxPercentage;
  
  if (totalBreakdown > 100) {
    return next(new Error('Display breakdown percentages cannot exceed 100%'));
  }
  
  next();
});

module.exports = mongoose.model('Settings', settingsSchema);