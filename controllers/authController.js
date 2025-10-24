const User = require('../models/User');
const Rider = require('../models/RiderSchema');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const Admin = require('../models/Admin');

const otpStoree = new Map();

// Generate JWT tokens
const generateTokens = (userId, role) => {
  const accessToken = jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '15m' });

  const refreshToken = jwt.sign({ userId, role }, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, { expiresIn: '7d' });

  return { accessToken, refreshToken };
};

// Set cookie options
const getCookieOptions = (isProduction = false) => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'strict' : 'lax',
  path: '/'
});

// Admin Registration
exports.adminRegister = async (req, res) => {
  try {
    const { email, password, firstName, lastName, role, mobile } = req.body;

    // Validation
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        message: 'All fields are required',
        required: ['email', 'password', 'firstName', 'lastName']
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({
      $or: [{ email }, { mobile }]
    });

    if (existingAdmin) {
      return res.status(409).json({
        message: 'Admin with this email or mobile already exists'
      });
    }

    // Generate username from email
    const username = email.split('@')[0] + '_' + Date.now();

    // Create new admin
    const admin = new Admin({
      username,
      email,
      password,
      firstName,
      lastName,
      mobile,
      role: role || 'admin'
    });

    // Set default permissions
    admin.permissions = admin.getDefaultPermissions();
    await admin.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(admin._id, admin.role);

    // Save refresh token
    admin.refreshToken = refreshToken;
    await admin.save();

    // Set cookies
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', accessToken, {
      ...getCookieOptions(isProduction),
      maxAge: 15 * 60 * 1000 // 15 minutes
    });
    res.cookie('refreshToken', refreshToken, {
      ...getCookieOptions(isProduction),
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({
      success: true,
      message: 'Admin registered successfully',
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        fullName: admin.fullName || admin.displayName, // Use real field or virtual fallback
        displayName: admin.displayName, // Virtual field for display
        mobile: admin.mobile,
        role: admin.role,
        permissions: admin.permissions
      },
      tokens: { accessToken, refreshToken }
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      message: 'Internal server error',
      error: error.message // Temporarily show error message
    });
  }
};

// Admin Login
exports.adminLogin = async (req, res) => {
  try {
    const { identifier, password } = req.body; // Changed from username to identifier

    if (!identifier || !password) {
      return res.status(400).json({
        message: 'Email/Mobile and password are required'
      });
    }

    // Find admin (identifier can be email or mobile)
    const admin = await Admin.findOne({
      $or: [{ email: identifier }, { mobile: identifier }],
      isActive: true
    });

    if (!admin) {
      return res.status(401).json({
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await admin.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid credentials'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(admin._id, admin.role);

    // Update admin without triggering validation on the entire document
    await Admin.findByIdAndUpdate(
      admin._id,
      {
        refreshToken: refreshToken,
        lastLogin: new Date()
      },
      {
        runValidators: false // Skip validation for existing documents
      }
    );

    // Set cookies
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', accessToken, {
      ...getCookieOptions(isProduction),
      maxAge: 15 * 60 * 1000 // 15 minutes
    });
    res.cookie('refreshToken', refreshToken, {
      ...getCookieOptions(isProduction),
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        fullName: admin.fullName || admin.displayName, // Use real field or virtual fallback
        displayName: admin.displayName, // Virtual field for display
        mobile: admin.mobile,
        role: admin.role,
        permissions: admin.permissions,
        lastLogin: admin.lastLogin
      },
      tokens: { accessToken, refreshToken }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Admin Logout
exports.adminLogout = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (refreshToken) {
      // Remove refresh token from database
      await Admin.findOneAndUpdate({ refreshToken }, { $unset: { refreshToken: 1 } });
    }

    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    res.status(200).json({
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
};

// Refresh Token
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({
        message: 'Refresh token not provided'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);

    // Find admin
    const admin = await Admin.findOne({
      _id: decoded.userId,
      refreshToken,
      isActive: true
    });

    if (!admin) {
      return res.status(401).json({
        message: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(admin._id, admin.role);

    // Update refresh token
    admin.refreshToken = newRefreshToken;
    await admin.save();

    // Set new cookies
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('accessToken', accessToken, {
      ...getCookieOptions(isProduction),
      maxAge: 15 * 60 * 1000 // 15 minutes
    });
    res.cookie('refreshToken', newRefreshToken, {
      ...getCookieOptions(isProduction),
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(200).json({
      message: 'Token refreshed successfully',
      tokens: { accessToken, refreshToken: newRefreshToken }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({
      message: 'Invalid refresh token'
    });
  }
};

// Get Current Admin Profile
exports.getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.userId);

    if (!admin) {
      return res.status(404).json({
        message: 'Admin not found'
      });
    }

    res.status(200).json({
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        fullName: admin.fullName || admin.displayName, // Use real field or virtual fallback
        displayName: admin.displayName, // Virtual field for display
        mobile: admin.mobile,
        role: admin.role,
        permissions: admin.permissions,
        profilePhoto: admin.profilePhoto,
        lastLogin: admin.lastLogin,
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
};

// Update Admin Profile
exports.updateAdminProfile = async (req, res) => {
  try {
    const { firstName, lastName, email, mobile } = req.body;
    const adminId = req.admin.userId;

    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    if (mobile) updateData.mobile = mobile;

    // Handle profile photo upload
    if (req.file) {
      const filePath = req.file.path.replace(/\\/g, '/');
      updateData.profilePhoto = `${req.protocol}://${req.get('host')}/${filePath}`;
    }

    const admin = await Admin.findByIdAndUpdate(adminId, updateData, { new: true, runValidators: true });

    if (!admin) {
      return res.status(404).json({
        message: 'Admin not found'
      });
    }

    res.status(200).json({
      message: 'Profile updated successfully',
      admin
    });
  } catch (error) {
    console.error('Update admin profile error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.admin.userId;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'New password must be at least 6 characters long'
      });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        message: 'Admin not found'
      });
    }

    // Verify current password
    const isPasswordValid = await admin.comparePassword(currentPassword);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Current password is incorrect'
      });
    }

    // Update password
    admin.password = newPassword;
    await admin.save();

    res.status(200).json({
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      message: 'Internal server error'
    });
  }
};

exports.sendmobileOTP = async (req, res) => {
  const { number } = req.body;

  console.log(number, 'number in send mobile otp');
  if (!number) return res.status(400).json({ message: 'Phone number is required' });

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  otpStoree.set(number, otp);

  console.log(otp);

  try {
    // SMTP Guru API configuration

    // const instanceId = '67F4BD1328D8B'; office
    // const accessToken = '66cf2b3d6b249';
    const instanceId = "685BD4B561551"; 
    const accessToken = "685bd213dadf7";
    // const instanceId = "67FA189D6AE5D";  E-bay
    // const accessToken = "67fa147ed20cf";
    const message = `Welcome To Ridodrop! Your verification OTP is: ${otp}. Please do not share this OTP with anyone.`;

    // Format number to include 91 if not present
    const formattedNumber = number.startsWith('91') ? number : `91${number.replace('+', '')}`;

    const apiUrl = `https://smt.w4u.in/api/send?number=${formattedNumber}&type=text&message=${encodeURIComponent(
      message
    )}&instance_id=${instanceId}&access_token=${accessToken}`;

    const response = await axios.get(apiUrl);
    if (response.data && (response.data.status === 'success' || response.data.success)) {
      console.log('OTP sent successfully:', response.data);
      return res.status(200).json({ message: 'OTP sent via WhatsApp' });
    } else {
      console.error('SMTP Guru API Error:', response.data);
      return res.status(500).json({ message: 'Failed to send OTP', details: response.data });
    }
  } catch (err) {
    console.error('Send OTP Error:', err);
    return res.status(500).json({ message: 'Failed to send OTP' });
  }
};

exports.verifymobileOTP = async (req, res) => {
  const { number, otp } = req.body;

  if (!number || !otp) {
    return res.status(400).json({ message: 'Phone number and OTP are required' });
  }

  const storedOtp = otpStoree.get(number);

  if (storedOtp !== otp) {
    return res.status(401).json({ message: 'Invalid OTP' });
  }

  otpStoree.delete(number); // OTP is used, remove it

  try {
    let user = await User.findOne({ phone: number });

    console.log(user);

    if (!user) {
      // User is new - return response indicating new user
      return res.status(200).json({
        isNewUser: true,
        message: 'New user detected. Please provide your name.'
      });
    }
    // Existing user - generate token and return
    const token = jwt.sign({ number, userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '30d' // Token valid for 30 days
    });

    return res.status(200).json({
      isNewUser: false,
      token,
      userId: user._id,
      user: {
        name: user.name,
        number: user.number,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error during OTP verification:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
exports.verifyRiderMobileOTP = async (req, res) => {
  const { number, otp } = req.body;

  console.log(number, otp, 'number and otp in verify rider mobile otp');
  if (!number || !otp) {
    return res.status(400).json({ message: 'Phone number and OTP are required' });
  }

  const storedOtp = otpStoree.get(number);
  console.log(storedOtp, 'stored otp in verify mobile otp');

  if (storedOtp !== otp) {
    return res.status(401).json({ message: 'Invalid OTP' });
  }

  otpStoree.delete(number); // OTP is used, remove it

  try {
    let rider = await Rider.findOne({ phone: number });

    if (!rider) {
      // User is new - return response indicating new user
      return res.status(200).json({
        isNewUser: true,
        message: 'New user detected. Please provide your name.'
      });
    }

    // Existing user - generate token and return
    const token = jwt.sign({ number, userId: rider._id }, process.env.JWT_SECRET, {
      expiresIn: '30d' // Token valid for 30 days
    });
    return res.status(200).json({
      isNewUser: false,
      token,
      userId: rider._id,
      user: {
        name: rider.name,
        number: rider.number
      }
    });
  } catch (error) {
    console.error('Error during OTP verification:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Get all admins
exports.getAllAdmins = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;

    console.log('📥 getAllAdmins - Query params:', { role, status, search });

    // Build filter object
    const filter = {};

    if (role) filter.role = role;
    if (status) filter.status = status;

    // Search filter
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('🔍 Filter object:', filter);

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const admins = await Admin.find(filter)
      .select('-password -refreshToken') // Exclude sensitive fields
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    console.log('📦 Found', admins.length, 'admins');

    // Format admins for frontend
    const formattedAdmins = admins.map((admin) => ({
      ...admin,
      id: admin._id,
      fullName: `${admin.firstName} ${admin.lastName}`,
      mobile: admin.mobile || 'N/A',
      status: admin.status || 'Active'
    }));

    const total = await Admin.countDocuments(filter);

    res.json({
      admins: formattedAdmins,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Get all admins error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Update admin
exports.updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, mobile, role, status } = req.body;

    console.log('📝 Updating admin:', id, req.body);

    const admin = await Admin.findByIdAndUpdate(
      id,
      {
        firstName,
        lastName,
        email,
        mobile,
        role,
        status
      },
      { new: true, runValidators: true }
    ).select('-password -refreshToken');

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    console.log('✅ Admin updated:', admin);
    res.json(admin);
  } catch (err) {
    console.error('Update admin error:', err);
    res.status(500).json({ error: err.message });
  }
};

// Delete admin
exports.deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('🗑️ Deleting admin:', id);

    const admin = await Admin.findByIdAndDelete(id);

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    console.log('✅ Admin deleted');
    res.json({ message: 'Admin deleted successfully' });
  } catch (err) {
    console.error('Delete admin error:', err);
    res.status(500).json({ error: err.message });
  }
};
