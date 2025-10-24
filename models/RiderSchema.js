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

const mongoose = require("mongoose");

const RiderSchema = new mongoose.Schema(
  {
    name: { type: String },
    phone: { type: String, required: true, unique: true },

    email: { type: String },
    gender: { type: String, enum: ["male", "female", "other"] },

    vehicleType: {
      type: String,
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
    isBlocked: { type: String },
    ispaidFees: { type: String, default: "false" },
    step: { type: String, default: "1" },
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
      drivingLicenseBack: { type: String },
    },

  },
  { timestamps: true }
);

module.exports = mongoose.model("RaiderSchema", RiderSchema);
