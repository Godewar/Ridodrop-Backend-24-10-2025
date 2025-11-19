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
    productImages: [{ type: String }],
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
      enum: ['customer', 'driver', 'admin']
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
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
