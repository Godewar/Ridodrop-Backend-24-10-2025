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
        professional: { type: String },
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
    cashCollected: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
