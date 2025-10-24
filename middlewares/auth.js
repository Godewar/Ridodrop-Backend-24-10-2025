const mongoose = require('mongoose');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Auth middleware
const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('Auth header:', authHeader);

    if (!authHeader) {
      return res.status(401).json({ message: 'No authorization header provided' });
    }

    // Extract token from "Bearer TOKEN" format
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    console.log('Extracted token:', token ? `${token.substring(0, 20)}...` : 'No token');

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      console.log('Decoded token:', decoded);
    } catch (err) {
      console.error('JWT verification error:', err.message);
      return res.status(401).json({ message: 'Invalid token', error: err.message });
    }

    // Support multiple possible user id fields
    const userId = decoded.number || decoded.userId || decoded.user_id || decoded.id || decoded._id;
    console.log('Extracted userId from token:', userId);

    if (!userId) {
      return res.status(401).json({ message: 'Invalid token payload - no user ID found' });
    }

    // Set userId for controllers that need it
    req.userId = userId;

    // Try to find user by ID (if it's a valid ObjectId) or by phone number
    let user;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId);
    } else {
      // If userId is actually a phone number
      user = await User.findOne({ phone: userId });
    }

    if (!user) {
      console.error('User not found for ID:', userId);
      return res.status(404).json({ message: 'User not found' });
    }

    req.user = user;
    console.log('Authentication successful for user:', user.phone);
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).send(`Role: ${req.user.role} is not allowed to access this resource`);
    }
    next();
  };
};

// Admin check middleware
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  next();
};

// Alias for auth middleware
const authenticateToken = auth;

module.exports = {
  auth,
  authenticateToken,
  authorizeRoles,
  isAdmin
};
