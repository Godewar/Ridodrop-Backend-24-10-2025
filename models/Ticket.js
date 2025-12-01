const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    unique: true
  },
  userType: {
    type: String,
    enum: ['customer', 'partner'],
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  userModel: {
    type: String,
    required: true,
    enum: ['User', 'Rider']
  },
  userName: {
    type: String,
    required: true
  },
  userPhone: {
    type: String,
    required: true
  },
  userEmail: {
    type: String
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    default: null
  },
  bookingDetails: {
    bookingId: String,
    from: String,
    to: String,
    vehicleType: String,
    amount: Number
  },
  issueCategory: {
    type: String,
    enum: ['general', 'booking-specific'],
    default: 'general'
  },
  issueType: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
    default: 'Open'
  },
  subject: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  attachments: [String], // Array of Cloudinary URLs
  comments: [{
    commentBy: {
      type: String,
      enum: ['user', 'admin', 'system'],
      required: true
    },
    commentByName: String,
    message: String,
    attachments: [String], // Array of Cloudinary URLs
      url: String,
    attachments: [String], // Array of Cloudinary URLs
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  assignedTo: {
    type: String,
    default: 'Unassigned'
  },
  assignedAt: {
    type: Date
  },
  resolvedAt: {
    type: Date
  },
  closedAt: {
    type: Date
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  feedback: {
    type: String
  }
}, {
  timestamps: true
});

// Auto-generate ticket ID before saving
ticketSchema.pre('save', async function(next) {
  if (!this.ticketId) {
    const count = await mongoose.model('Ticket').countDocuments();
    this.ticketId = `TKT-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Auto-calculate priority based on issue type and booking status
ticketSchema.pre('save', function(next) {
  if (this.isNew) {
    // Urgent issues
    const urgentKeywords = ['accident', 'emergency', 'safety', 'harassment', 'fraud'];
    const highPriorityTypes = ['Payment Not Received', 'Payment Issue', 'Accident/Emergency'];
    
    const descLower = this.description.toLowerCase();
    const issueTypeLower = this.issueType.toLowerCase();
    
    if (urgentKeywords.some(keyword => descLower.includes(keyword) || issueTypeLower.includes(keyword))) {
      this.priority = 'Urgent';
    } else if (highPriorityTypes.includes(this.issueType)) {
      this.priority = 'High';
    } else if (this.bookingId && this.issueCategory === 'booking-specific') {
      this.priority = 'High'; // Active booking issues are high priority
    } else if (['Delayed Delivery', 'Wrong Delivery Address', 'Customer Unavailable', 'Driver Behavior'].includes(this.issueType)) {
      this.priority = 'Medium';
    } else {
      this.priority = 'Low';
    }
  }
  next();
});

// Update timestamps on status change
ticketSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'Resolved' && !this.resolvedAt) {
      this.resolvedAt = new Date();
    }
    if (this.status === 'Closed' && !this.closedAt) {
      this.closedAt = new Date();
    }
  }
  if (this.isModified('assignedTo') && this.assignedTo !== 'Unassigned') {
    this.assignedAt = new Date();
  }
  next();
});

// Indexes for better query performance
ticketSchema.index({ ticketId: 1 });
ticketSchema.index({ userId: 1 });
ticketSchema.index({ bookingId: 1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ priority: 1 });
ticketSchema.index({ userType: 1 });
ticketSchema.index({ createdAt: -1 });

const Ticket = mongoose.model('Ticket', ticketSchema);

module.exports = Ticket;
