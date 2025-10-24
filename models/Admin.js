const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema(
  {
    username: { 
      type: String, 
      required: true, 
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 50
    },
    email: { 
      type: String, 
      required: true, 
      unique: true,
      trim: true,
      lowercase: true
    },
    mobile: { 
      type: String, 
      required: false,
      unique: true,
      sparse: true,
      trim: true
    },
    password: { 
      type: String, 
      required: true,
      minlength: 6
    },
    firstName: { 
      type: String, 
      required: false, // Made optional for backward compatibility
      trim: true
    },
    lastName: { 
      type: String, 
      required: false, // Made optional for backward compatibility
      trim: true
    },
    fullName: { 
      type: String, 
      required: false, // For backward compatibility with existing data
      trim: true
    },
    role: { 
      type: String, 
      enum: ["super_admin", "admin", "moderator"], 
      default: "admin"
    },
    profilePhoto: { type: String },
    isActive: { 
      type: Boolean, 
      default: true 
    },
    lastLogin: { type: Date },
    permissions: [{
      type: String,
      enum: [
        "users_read", "users_write", "users_delete",
        "bookings_read", "bookings_write", "bookings_delete",
        "drivers_read", "drivers_write", "drivers_delete",
        "analytics_read", "settings_write"
      ]
    }],
    refreshToken: { type: String }
  },
  { 
    timestamps: true,
    toJSON: { 
      virtuals: true, // Include virtual fields in JSON
      transform: function(doc, ret) {
        delete ret.password;
        delete ret.refreshToken;
        return ret;
      }
    }
  }
);

// Virtual field for full name - handles both old and new data formats
adminSchema.virtual('displayName').get(function() {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  } else if (this.fullName) {
    return this.fullName;
  } else {
    return this.username || 'Admin';
  }
});

// Migrate old fullName data to firstName/lastName before saving
adminSchema.pre("save", function (next) {
  // If we have fullName but no firstName/lastName, split it
  if (this.fullName && !this.firstName && !this.lastName) {
    const nameParts = this.fullName.trim().split(' ');
    this.firstName = nameParts[0] || '';
    this.lastName = nameParts.slice(1).join(' ') || nameParts[0] || '';
  }
  
  // If we have firstName/lastName but no fullName, create it
  if (this.firstName && this.lastName && !this.fullName) {
    this.fullName = `${this.firstName} ${this.lastName}`;
  }
  
  next();
});

// Hash password before saving
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
adminSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate default permissions based on role
adminSchema.methods.getDefaultPermissions = function() {
  const rolePermissions = {
    super_admin: [
      "users_read", "users_write", "users_delete",
      "bookings_read", "bookings_write", "bookings_delete",
      "drivers_read", "drivers_write", "drivers_delete",
      "analytics_read", "settings_write"
    ],
    admin: [
      "users_read", "users_write",
      "bookings_read", "bookings_write",
      "drivers_read", "drivers_write",
      "analytics_read"
    ],
    moderator: [
      "users_read", "bookings_read", "drivers_read", "analytics_read"
    ]
  };
  return rolePermissions[this.role] || [];
};

module.exports = mongoose.model("Admin", adminSchema);
