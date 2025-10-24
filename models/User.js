const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    lname: { type: String },
    email: { type: String, sparse: true, unique: true }, // sparse allows multiple null values but ensures unique non-null values
    phone: { type: String, required: true, unique: true },
    gender: { type: String, enum: ["male", "female", "other"] },
    profilePhoto: { type: String },
    role: { type: String, enum: ["customer", "rider"], required: true },
    walletBalance: { type: Number, default: 0 },
    isBlocked: { type: String },
    customerId: { type: String, unique: true, sparse: true }, // sparse allows multiple null values
    referralCode: { type: String, unique: true, sparse: true }, // sparse allows multiple null values
  },
  { timestamps: true }
);

module.exports = mongoose.model("RaidoDropUsers", userSchema);
