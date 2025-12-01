const Ticket = require('../models/Ticket');
const User = require('../models/User');
const Rider = require('../models/RiderSchema');
const Booking = require('../models/Booking');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'your-cloud-name',
  api_key: process.env.CLOUDINARY_API_KEY || 'your-api-key',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'your-api-secret'
});

// Configure multer to use memory storage
const storage = multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed.'));
    }
  }
});

// Helper function to upload to Cloudinary
const uploadToCloudinary = (fileBuffer, filename) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'ridodrop/tickets',
        resource_type: 'auto',
        public_id: `ticket_${Date.now()}_${filename}`,
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

// Create a new ticket
exports.createTicket = async (req, res) => {
  try {
    const {
      userType,
      userId,
      userName,
      userPhone,
      userEmail,
      bookingId,
      issueType,
      subject,
      description,
      issueCategory
    } = req.body;

    // Validate required fields
    if (!userType || !userId || !userName || !userPhone || !issueType || !subject || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Validate userType
    if (!['customer', 'partner'].includes(userType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user type. Must be customer or partner'
      });
    }

    // Verify user exists (optional - for backwards compatibility)
    let userModel;
    try {
      let userExists;
      if (userType === 'customer') {
        userExists = await User.findById(userId);
        userModel = 'User';
      } else {
        userExists = await Rider.findById(userId);
        userModel = 'Rider';
      }
      
      // If user not found but we have name and phone, allow ticket creation anyway
      if (!userExists && (!userName || !userPhone)) {
        return res.status(404).json({
          success: false,
          message: 'User not found and insufficient information provided'
        });
      }
    } catch (error) {
      // If userId is not a valid ObjectId, just use the provided user details
      console.log('User validation skipped - using provided details');
      userModel = userType === 'customer' ? 'User' : 'Rider';
    }

    // Prepare ticket data
    const ticketData = {
      userType,
      userId,
      userModel,
      userName,
      userPhone,
      userEmail,
      issueType,
      subject,
      description,
      issueCategory: issueCategory || 'general'
    };

    // If booking-specific, fetch booking details
    if (bookingId) {
      const booking = await Booking.findById(bookingId);
      if (booking) {
        ticketData.bookingId = bookingId;
        ticketData.issueCategory = 'booking-specific';
        ticketData.bookingDetails = {
          bookingId: booking._id,
          from: booking.fromAddress?.address || booking.from?.address,
          to: booking.dropLocation?.[0]?.address || booking.dropLocation?.[0]?.Address,
          vehicleType: booking.vehicleType,
          amount: booking.totalFare || booking.price
        };
      }
    }

    // Handle file uploads
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file => 
        uploadToCloudinary(file.buffer, file.originalname)
      );
      const uploadedUrls = await Promise.all(uploadPromises);
      ticketData.attachments = uploadedUrls;
    }

    // Create ticket
    const ticket = await Ticket.create(ticketData);

    // Add system comment for ticket creation
    ticket.comments.push({
      commentBy: 'system',
      commentByName: 'System',
      message: `Ticket ${ticket.ticketId} created successfully. Our support team will respond soon.`,
      timestamp: new Date()
    });

    await ticket.save();

    res.status(201).json({
      success: true,
      message: 'Ticket created successfully',
      data: ticket
    });

  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ticket',
      error: error.message
    });
  }
};

// Get all tickets with filters and pagination (Admin)
exports.getAllTickets = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      userType,
      issueType,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (userType) query.userType = userType;
    if (issueType) query.issueType = issueType;

    // Search across multiple fields
    if (search) {
      query.$or = [
        { ticketId: { $regex: search, $options: 'i' } },
        { userName: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    // Execute query
    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .sort(sort)
        .limit(parseInt(limit))
        .skip(skip)
        .populate('userId', 'name phone email')
        .populate('bookingId', 'bookingId status totalFare')
        .lean(),
      Ticket.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: tickets,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets',
      error: error.message
    });
  }
};

// Get user's own tickets
exports.getMyTickets = async (req, res) => {
  try {
    const { userId, userType } = req.query;
    const { status, page = 1, limit = 20 } = req.query;

    if (!userId || !userType) {
      return res.status(400).json({
        success: false,
        message: 'userId and userType are required'
      });
    }

    // Build query
    const query = { userId, userType };
    if (status) query.status = status;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query
    const [tickets, total] = await Promise.all([
      Ticket.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .populate('bookingId', 'bookingId status totalFare')
        .lean(),
      Ticket.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: tickets,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching user tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets',
      error: error.message
    });
  }
};

// Get ticket by ID
exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findById(id)
      .populate('userId', 'name phone email')
      .populate('bookingId');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    res.status(200).json({
      success: true,
      data: ticket
    });

  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket',
      error: error.message
    });
  }
};

// Update ticket
exports.updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow updating certain fields
    delete updates.ticketId;
    delete updates.userId;
    delete updates.userType;
    delete updates.createdAt;

    const ticket = await Ticket.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Ticket updated successfully',
      data: ticket
    });

  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket',
      error: error.message
    });
  }
};

// Add comment to ticket
exports.addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { commentBy, commentByName, message } = req.body;

    if (!commentBy || !message) {
      return res.status(400).json({
        success: false,
        message: 'commentBy and message are required'
      });
    }

    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Add comment
    const comment = {
      commentBy,
      commentByName: commentByName || commentBy,
      message,
      timestamp: new Date()
    };

    // Handle file uploads
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file => 
        uploadToCloudinary(file.buffer, file.originalname)
      );
      const uploadedUrls = await Promise.all(uploadPromises);
      comment.attachments = uploadedUrls;
    }

    ticket.comments.push(comment);
    await ticket.save();

    res.status(200).json({
      success: true,
      message: 'Comment added successfully',
      data: ticket
    });

  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add comment',
      error: error.message
    });
  }
};

// Get ticket statistics (Dashboard)
exports.getTicketStats = async (req, res) => {
  try {
    const { userType } = req.query;
    const query = userType ? { userType } : {};

    const [
      total,
      open,
      inProgress,
      resolved,
      closed,
      urgent,
      highPriority,
      byIssueType,
      recentTickets
    ] = await Promise.all([
      Ticket.countDocuments(query),
      Ticket.countDocuments({ ...query, status: 'Open' }),
      Ticket.countDocuments({ ...query, status: 'In Progress' }),
      Ticket.countDocuments({ ...query, status: 'Resolved' }),
      Ticket.countDocuments({ ...query, status: 'Closed' }),
      Ticket.countDocuments({ ...query, priority: 'Urgent' }),
      Ticket.countDocuments({ ...query, priority: 'High' }),
      Ticket.aggregate([
        { $match: query },
        { $group: { _id: '$issueType', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      Ticket.find(query)
        .sort({ createdAt: -1 })
        .limit(5)
        .select('ticketId userName issueType status priority createdAt')
        .lean()
    ]);

    // Calculate average resolution time
    const resolvedTickets = await Ticket.find({ 
      ...query, 
      status: 'Resolved',
      resolvedAt: { $exists: true }
    }).select('createdAt resolvedAt');

    let avgResolutionTime = 0;
    if (resolvedTickets.length > 0) {
      const totalTime = resolvedTickets.reduce((sum, ticket) => {
        return sum + (new Date(ticket.resolvedAt) - new Date(ticket.createdAt));
      }, 0);
      avgResolutionTime = Math.round(totalTime / resolvedTickets.length / (1000 * 60 * 60)); // Convert to hours
    }

    res.status(200).json({
      success: true,
      data: {
        total,
        open,
        inProgress,
        resolved,
        closed,
        urgent,
        highPriority,
        avgResolutionTimeHours: avgResolutionTime,
        byIssueType,
        recentTickets
      }
    });

  } catch (error) {
    console.error('Error fetching ticket stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};

// Delete ticket (Admin only)
exports.deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await Ticket.findByIdAndDelete(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Delete attachments from Cloudinary
    if (ticket.attachments && ticket.attachments.length > 0) {
      for (const attachment of ticket.attachments) {
        try {
          const publicId = attachment.url.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`ridodrop/tickets/${publicId}`);
        } catch (err) {
          console.error('Error deleting attachment from Cloudinary:', err);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Ticket deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ticket',
      error: error.message
    });
  }
};

// Close ticket with rating and feedback
exports.closeTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback } = req.body;

    const ticket = await Ticket.findById(id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    ticket.status = 'Closed';
    ticket.closedAt = new Date();
    
    if (rating) ticket.rating = rating;
    if (feedback) ticket.feedback = feedback;

    await ticket.save();

    res.status(200).json({
      success: true,
      message: 'Ticket closed successfully',
      data: ticket
    });

  } catch (error) {
    console.error('Error closing ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to close ticket',
      error: error.message
    });
  }
};

module.exports.upload = upload;
