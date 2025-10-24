const express = require('express');
const router = express.Router();

const {
  createUser,
  getProfile,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  blockUser,
  unblockUser
} = require('../controllers/userController');
const upload = require('../utils/multerConfig');
const { auth } = require('../middlewares/auth');

router.post('/add', upload.single('profilePhoto'), createUser);
router.get('/me', auth, getProfile);

// Admin routes for user management
router.get('/dev/all', getAllUsers);
router.get('/dev/:id', getUserById);
router.put('/dev/:id', upload.single('profilePhoto'), updateUser);
router.delete('/dev/:id', deleteUser);
router.patch('/dev/:id/block', blockUser);
router.patch('/dev/:id/unblock', unblockUser);

module.exports = router;
