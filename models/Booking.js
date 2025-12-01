const mongoose = require('mongoose');

const FromAddressSchema = new mongoose.Schema({
  address: { type: String, required: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  house: { type: String },
  receiverName: { type: String },
  receiverMobile: { type: String },
  tag: { type: String }
});

const bookingSchema = new mongoose.Schema(
  {
    amountPay: {
      type: String
    },
    bookingStatus: {
      type: String,
      default: 'pending'
    },

    payFrom: {
      type: String
    },
    // Payment tracking fields for online payments
    paymentMethod: {
      type: String,
      enum: ['cash', 'online', 'wallet'],
      default: 'cash'
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    transactionId: {
      type: String
    },
    paymentCompletedAt: {
      type: Date
    },
    userId: {
      type: String,
      required: true
    },

    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'RaiderSchema' },

    rider: { type: String },

    stops: [{ type: String, maxlength: 500 }],
    vehicleType: {
      type: String,
      enum: ['2W', '3W', 'Truck']
      // required: true,
    },
    productImages: [{ type: String }], // Keep for backward compatibility
    pickupImages: [{ type: String }],   // Images from pickup location
    dropImages: [{ type: String }],     // Images from drop location
    status: {
      type: String,
      enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'],
      default: 'pending'
    },
    cancellationReason: {
      type: String
    },
    cancelledBy: {
      type: String,
      enum: ['customer', 'driver', 'admin', 'system']
    },
    cancelledAt: {
      type: Date
    },
    tripSteps: {
      type: String
    },
    price: { type: Number },
    dropLocation: [
      {
        Address: { type: String },
        address: { type: String }, // New single address field
        Address1: { type: String }, // Keep for backward compatibility
        Address2: { type: String }, // Keep for backward compatibility
        landmark: { type: String },
        pincode: { type: String },
        receiverName: { type: String },
        receiverNumber: { type: String },
        receiverMobile: { type: String }, // Alternative field name
        ReciversName: { type: String }, // Legacy field name for compatibility
        ReciversMobileNum: { type: String }, // Legacy field name for compatibility
        ReceiverName: { type: String }, // Alternative casing
        ReceiverMobile: { type: String }, // Alternative casing
        ReceiverPhone: { type: String }, // Alternative field name
        professional: { type: String },
        tag: { type: String }, // Alternative field name
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true }
      }
    ],
    fromAddress: {
      type: FromAddressSchema
      // required: true
    },
    riderAcceptTime: { type: Date },
    riderEndTime: { type: Date },
    currentStep: {
      type: String,
      default: 0
    },
    currentDropIndex: {
      type: Number,
      default: 0,
      min: 0
    },
    tripState: {
      type: String,
      enum: ['pending', 'at_pickup', 'en_route_to_drop', 'at_drop', 'completed'],
      default: 'pending'
    },
    distanceKm: { type: String },
    cashCollected: { type: Boolean, default: false },
    // Track riders who declined this booking
    declinedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RaiderSchema' }],
    declineReasons: {
      type: Map,
      of: String
    },
    broadcastedAt: { type: Date },
    broadcastCount: { type: Number, default: 0 },
    // Quick Fee Feature
    quickFee: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 100,
      validate: {
        validator: function(v) {
          return v >= 0 && v <= 100;
        },
        message: props => `${props.value} is not a valid quick fee! Must be between 0 and 100.`
      }
    },
    totalDriverEarnings: { 
      type: Number, 
      default: 0 
    },
    
    // Fee breakdown fields
    feeBreakdown: {
      // Platform fee calculation
      platformFeePercentage: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
      gstPercentage: { type: Number, default: 0 },
      gstAmount: { type: Number, default: 0 },
      riderEarnings: { type: Number, default: 0 },
      
      // Customer display breakdown
      baseFare: { type: Number, default: 0 },
      distanceCharge: { type: Number, default: 0 },
      serviceTax: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      finalAmount: { type: Number, default: 0 },
      
      // Metadata
      calculatedAt: { type: Date },
      settingsVersion: { type: String },
      vehicleTypeUsed: { type: String }
    },
    
    // Legacy fields for backward compatibility
    baseFare: { type: String }, // Keep as string for old bookings
    additionalCharges: { type: String }, // Keep as string for old bookings
    
    // Trip sharing fields
    shareToken: {
      type: String,
      index: true
    },
    shareTokenCreatedAt: {
      type: Date
    },
    currentLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      timestamp: { type: Date }
    },
    // Review system fields
    customerReview: {
      rating: { type: Number, min: 1, max: 5 },
      feedback: { type: String, maxlength: 500 },
      reviewedAt: { type: Date },
      reviewedBy: { type: String } // Customer ID who gave the review
    },
    riderReview: {
      rating: { type: Number, min: 1, max: 5 },
      feedback: { type: String, maxlength: 500 },
      reviewedAt: { type: Date },
      reviewedBy: { type: String } // Rider ID who gave the review
    },
    // Invoice system fields
    invoiceNumber: {
      type: String,
      unique: true,
      sparse: true // Allows null values to not be unique
    },
    invoiceUrl: {
      type: String // Cloudinary URL for the invoice PDF
    },
    invoiceCloudinaryId: {
      type: String // Cloudinary public_id for deletion if needed
    },
    invoiceGeneratedAt: {
      type: Date
    },
    invoiceAmount: {
      type: Number // Total amount on the invoice
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
