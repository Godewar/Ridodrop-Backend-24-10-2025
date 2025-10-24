const express = require('express');
const router = express.Router();
const {
  sendmobileOTP,
  verifymobileOTP,
  verifyRiderMobileOTP,
  adminRegister,
  adminLogin,
  adminLogout,
  refreshToken,
  getAdminProfile,
  updateAdminProfile,
  changePassword,
  getAllAdmins,
  updateAdmin,
  deleteAdmin
} = require('../controllers/authController');
const multer = require('../utils/multerConfig');
const { adminAuth } = require('../middlewares/adminAuth');

router.post('/send-otp', sendmobileOTP);
router.post('/verify-otp', verifymobileOTP);
router.post('/verify-rider-otp', verifyRiderMobileOTP);

// Admin authentication routes
router.post('/auth/admin/register', adminRegister);
router.post('/auth/admin/login', adminLogin);
router.post('/auth/admin/logout', adminAuth, adminLogout);
router.post('/auth/admin/refresh-token', refreshToken);

// Admin profile routes
router.get('/auth/admin/profile', adminAuth, getAdminProfile);
router.put('/auth/admin/profile', adminAuth, updateAdminProfile);
router.put('/auth/admin/change-password', adminAuth, changePassword);

// Admin management routes
router.get('/auth/admin/all', adminAuth, getAllAdmins);
router.put('/auth/admin/:id', adminAuth, updateAdmin);
router.delete('/auth/admin/:id', adminAuth, deleteAdmin);

module.exports = router;
