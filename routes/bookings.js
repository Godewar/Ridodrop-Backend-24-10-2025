const express = require('express');
const router = express.Router();
const {
  createBooking,
  getAllOrders,
  getAvailableBookingsForDriver,
  assignOrder,
  cancelBooking,
  declineBooking,
  getOngoingBookingForRider,
  getBooking,
  getBookingWithRiderDetails,
  saveFromAddress,
  uploadBookingImage,
  uploadPickupImage,
  uploadDropImage,
  getBookingImages,
  deleteBookingImage,
  updateBooking,
  updateBookingStep,
  completeBooking,
  getOrderHistory,
  collectCash,
  saveDropLocation,
  exportOrderDetailsToExcel,
  exportCancelDetailsToExcel,
  checkActiveBookingsByMobile,
  bulkCancelBookingsByMobile,
  downloadInvoice
} = require('../controllers/bookingController');
const multer = require('../utils/multerConfig');
const { auth } = require('../middlewares/auth');

// Export routes - MUST be before any routes with :id parameter
router.get('/export/order-details', exportOrderDetailsToExcel);
router.get('/export/cancel-details', exportCancelDetailsToExcel);

// Review routes - Use /review/ prefix to avoid conflicts
const reviewController = require('../controllers/reviewController');
router.post('/review/:bookingId/customer', reviewController.submitCustomerReview); // Customer rates Rider
router.post('/review/:bookingId/rider', reviewController.submitRiderReview); // Rider rates Customer
router.get('/review/:bookingId/both', reviewController.getBookingReviews); // Get both reviews
router.get('/review/all', reviewController.getAllReviews); // Get all reviews (admin)

// User/Rider rating endpoints  
router.get('/rating/user/:userId', reviewController.getUserRating); // Get customer rating
router.get('/rating/rider/:riderId', reviewController.getRiderRating); // Get rider rating

// const { authMiddle } = require('../middlewares/auth');
router.post('/create-with-details', auth, multer.fields([{ name: 'productImages', maxCount: 4 }]), createBooking);
// router.get("/:id", auth, getBooking);
// router.put("/:id", auth, updateBooking);
// router.get("/", auth, listBookings);

// Create booking without auth
router.post('/create', multer.fields([{ name: 'productImages', maxCount: 4 }]), createBooking);

// Get all orders/bookings with filters
router.get('/all', getAllOrders);

// // Save from address before order
router.post('/save-from-address', saveFromAddress);

// // Save drop address before order
// router.post("/save-drop-address", saveDropAddress);

// // Comprehensive booking creation with all details
// router.post("/create-with-details", createBookingWithDetails);

// // Get bookings by user and status
// router.get("/user/:userId/status/:bookingStatus", getBookingsByUserAndStatus);

// // Get all bookings for a user (grouped by status)
// router.get("/user/:userId", getUserBookings);

// // Update booking status
// router.put("/:bookingId/status", updateBookingStatus);

router.post('/get/bookings', getAvailableBookingsForDriver);
router.post('/assign-order', assignOrder);
router.post('/cancel-booking', cancelBooking); // ✅ Customer cancel booking
router.post('/decline-booking', declineBooking); // ✅ Decline/reject booking
router.get('/ongoing-booking', getOngoingBookingForRider);
router.get('/booking/:id', getBooking);
router.get('/booking-with-rider/:id', getBookingWithRiderDetails);
router.patch('/booking/:id', updateBooking); // Update booking including quick fee
router.patch('/update-step/:id', updateBookingStep);
router.patch('/complete/:id', completeBooking);
router.get('/order-history', getOrderHistory);

// Image upload/delete routes
router.post('/upload-image/:id', multer.single('image'), uploadBookingImage);
router.post('/upload-pickup-image/:id', multer.single('image'), uploadPickupImage);
router.post('/upload-drop-image/:id', multer.single('image'), uploadDropImage);
router.get('/images/:id', getBookingImages);
router.delete('/delete-image/:bookingId/:imageId', deleteBookingImage);
router.patch('/collect-cash/:id', collectCash);

// Drop location route
router.post('/drop-location', auth, saveDropLocation);

// Check active bookings by mobile number
router.get('/check-active/:mobile', checkActiveBookingsByMobile);

// Bulk cancel all active bookings by mobile number
router.post('/bulk-cancel/:mobile', bulkCancelBookingsByMobile);

// Invoice download endpoint
router.get('/invoice/:id', downloadInvoice);

module.exports = router;
