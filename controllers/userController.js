const User = require('../models/User');
const jwt = require('jsonwebtoken');
const path = require('path');

// Get all users with filters (for admin)
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, role, status } = req.query;

    // Build filter object
    const filter = {};

    if (role) {
      filter.role = role;
    }

    if (status) {
      filter.status = status;
    }

    // Search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { customerId: { $regex: search, $options: 'i' } }
      ];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get users
    const users = await User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).select('-password'); // Exclude password field

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    res.status(200).json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error in getAllUsers:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    let user;

    // Check if ID looks like a MongoDB ObjectId (24 hex characters)
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(id).select('-password');
    } else {
      // Assume it's a customerId
      user = await User.findOne({ customerId: id }).select('-password');
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error in getUserById:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    // req.user is already the complete user object from auth middleware
    console.log('User profile:', req.user);
    res.json(req.user);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, lname, phone, gender, role } = req.body;

    // Check if user already exists by phone
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this phone already exists' });
    }

    // Upload image as public URL
    let profilePhoto;
    if (req.file) {
      const filePath = req.file.path.replace(/\\/g, '/'); // normalize Windows paths
      profilePhoto = `${req.protocol}://${req.get('host')}/${filePath}`;
    }

    // Generate unique customerId and referralCode
    const customerId = `CUST${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const referralCode = `REF${Date.now()}${Math.floor(Math.random() * 10000)}`;

    const newUser = new User({
      name,
      lname,
      // Email field removed to avoid database index issues
      phone,
      gender,
      role,
      profilePhoto,
      customerId,
      referralCode
    });

    await newUser.save();

    // Generate JWT
    const token = jwt.sign({ userId: newUser._id, role: newUser.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    console.log(token);
    res.status(201).json({
      message: 'User created successfully',
      token
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Block user
exports.blockUser = async (req, res) => {
  try {
    const { id } = req.params;
    let user;

    // Check if ID looks like a MongoDB ObjectId (24 hex characters)
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findByIdAndUpdate(id, { isBlocked: 'true', status: 'blocked' }, { new: true }).select('-password');
    } else {
      // Assume it's a customerId
      user = await User.findOneAndUpdate({ customerId: id }, { isBlocked: 'true', status: 'blocked' }, { new: true }).select('-password');
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User blocked successfully',
      data: user
    });
  } catch (error) {
    console.error('Error in blockUser:', error);
    res.status(500).json({
      success: false,
      message: 'Error blocking user',
      error: error.message
    });
  }
};

// Unblock user
exports.unblockUser = async (req, res) => {
  try {
    const { id } = req.params;
    let user;

    // Check if ID looks like a MongoDB ObjectId (24 hex characters)
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findByIdAndUpdate(id, { isBlocked: 'false', status: 'active' }, { new: true }).select('-password');
    } else {
      // Assume it's a customerId
      user = await User.findOneAndUpdate({ customerId: id }, { isBlocked: 'false', status: 'active' }, { new: true }).select('-password');
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User unblocked successfully',
      data: user
    });
  } catch (error) {
    console.error('Error in unblockUser:', error);
    res.status(500).json({
      success: false,
      message: 'Error unblocking user',
      error: error.message
    });
  }
};

// Update user
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Remove sensitive fields that shouldn't be updated this way
    delete updateData.password;
    delete updateData.customerId;
    delete updateData.referralCode;

    // Handle profile photo upload
    if (req.file) {
      const filePath = req.file.path.replace(/\\/g, '/');
      updateData.profilePhoto = `${req.protocol}://${req.get('host')}/${filePath}`;
    }

    let user;

    // Check if ID looks like a MongoDB ObjectId (24 hex characters)
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true }).select('-password');
    } else {
      // Assume it's a customerId
      user = await User.findOneAndUpdate({ customerId: id }, { $set: updateData }, { new: true, runValidators: true }).select('-password');
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Error in updateUser:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: error.message
    });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    let user;

    // Check if ID looks like a MongoDB ObjectId (24 hex characters)
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findByIdAndDelete(id);
    } else {
      // Assume it's a customerId
      user = await User.findOneAndDelete({ customerId: id });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error in deleteUser:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message
    });
  }
};
