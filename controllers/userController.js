const User = require('../models/User');
const jwt = require('jsonwebtoken');
const path = require('path');
const XLSX = require('xlsx');

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

// Export customers data to Excel
exports.exportCustomersToExcel = async (req, res) => {
  try {
    console.log('📊 Exporting customers to Excel...');

    const { search, role, status } = req.query;
    const query = {};

    if (role) query.role = role;
    if (status) query.status = status;

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { customerId: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query).select('customerId name email phone address city role status createdAt').lean();

    console.log(`📊 Found ${users.length} customers to export`);

    // Check if there are users to export
    if (users.length === 0) {
      console.log('⚠️ No customers found to export');
      const excelData = [
        {
          'S.No': '',
          'Customer ID': '',
          Name: '',
          Email: '',
          Phone: '',
          Address: '',
          City: '',
          Role: '',
          Status: '',
          'Registration Date': ''
        }
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(wb, ws, 'Customers');
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=customers_data_${new Date().toISOString().split('T')[0]}.xlsx`);
      return res.send(excelBuffer);
    }

    // Transform data for Excel export
    const excelData = users.map((user, index) => ({
      'S.No': index + 1,
      'Customer ID': user.customerId || 'N/A',
      Name: user.name || 'N/A',
      Email: user.email || 'N/A',
      Phone: user.phone || 'N/A',
      Address: user.address || 'N/A',
      City: user.city || 'N/A',
      Role: user.role || 'customer',
      Status: user.status || 'Active',
      'Registration Date': user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Customers');

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=customers_data_${new Date().toISOString().split('T')[0]}.xlsx`);

    // Send the Excel file
    res.send(excelBuffer);
    console.log(`✅ Excel file sent successfully with ${excelData.length} customers`);
  } catch (error) {
    console.error('❌ Error exporting customers to Excel:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting customers data',
      error: error.message
    });
  }
};

// Export customers detailed data to Excel
exports.exportCustomersDocuments = async (req, res) => {
  try {
    console.log('📄 Exporting customers detailed data...');

    const { search, role, status } = req.query;
    const query = {};

    if (role) query.role = role;
    if (status) query.status = status;

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { customerId: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('customerId name email phone altMobile address city pincode role status createdAt referralCode')
      .lean();

    console.log(`📄 Found ${users.length} customers with detailed data to export`);

    // Check if there are users to export
    if (users.length === 0) {
      console.log('⚠️ No customers found to export');
      const documentsData = [
        {
          'S.No': '',
          'Customer ID': '',
          Name: '',
          Email: '',
          Phone: '',
          'Alternative Phone': '',
          Address: '',
          City: '',
          Pincode: '',
          Role: '',
          Status: '',
          'Referral Code': '',
          'Registration Date': ''
        }
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(documentsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Customer Details');
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=customers_documents_${new Date().toISOString().split('T')[0]}.xlsx`);
      return res.send(excelBuffer);
    }

    // Transform data for document export
    const documentsData = users.map((user, index) => ({
      'S.No': index + 1,
      'Customer ID': user.customerId || 'N/A',
      Name: user.name || 'N/A',
      Email: user.email || 'N/A',
      Phone: user.phone || 'N/A',
      'Alternative Phone': user.altMobile || 'N/A',
      Address: user.address || 'N/A',
      City: user.city || 'N/A',
      Pincode: user.pincode || 'N/A',
      Role: user.role || 'customer',
      Status: user.status || 'Active',
      'Referral Code': user.referralCode || 'N/A',
      'Registration Date': user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(documentsData);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Customer Details');

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=customers_documents_${new Date().toISOString().split('T')[0]}.xlsx`);

    // Send the Excel file
    res.send(excelBuffer);
    console.log(`✅ Documents Excel file sent successfully with ${documentsData.length} customers`);
  } catch (error) {
    console.error('❌ Error exporting customers documents:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting customers documents',
      error: error.message
    });
  }
};
