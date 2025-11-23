const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// 🟢 User/Driver Routes
router.post('/', authorize('user', 'driver'), bookingController.createBooking);
router.get('/my-bookings', authorize('user', 'driver'), bookingController.getUserBookings);
router.get('/:id', bookingController.getBookingById);
router.patch('/:id/cancel', authorize('user', 'driver'), bookingController.cancelBooking);
router.patch('/:id/extend', authorize('user', 'driver'), bookingController.extendBooking);
router.patch('/:id/arrived', authorize('user', 'driver'), bookingController.markAsArrived); // Driver marks arrived

// 🟠 Owner Routes
router.get('/owner/my-bookings', authorize('owner'), bookingController.getOwnerBookings);
router.patch('/:id/status', authorize('owner'), bookingController.updateBookingStatus);
router.post('/scan', authorize('owner'), bookingController.scanBooking);
router.patch('/:id/confirm', authorize('owner'), bookingController.confirmBooking); // Owner confirms

// 🔵 Shared Routes (both driver and owner can access)
router.get('/:id/status', bookingController.getBookingStatus); // Check booking status

router.get('/parking/:parkingId', protect, bookingController.getBookingsByParking);

module.exports = router;