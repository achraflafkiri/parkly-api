// routes/parking.js
const express = require('express');
const router = express.Router();
const parkingController = require('../controllers/parkingController');
const { protect, authorize } = require('../middleware/auth');
const { uploadParkingImages, handleUploadError } = require('../middleware/upload');

// 🟢 Public/Driver Routes
router
  .route('/')
  .get(parkingController.getAllParkings);
// Only drivers can see available parkings

// 🟠 Owner Routes
router
  .route('/my-parkings')
  .get(protect, authorize('owner'), parkingController.getAllMyParkings); // Add authorize middleware
  
router
  .route('/')
  .post(
    protect,
    authorize('owner'),
    uploadParkingImages,
    handleUploadError,
    parkingController.createParking
  );
// Only owners can create parkings

router
  .route('/:id')
  .get(protect, parkingController.getParkingById) // Both driver or owner can view a parking
  .put(
    protect,
    authorize('owner'),
    uploadParkingImages,
    handleUploadError,
    parkingController.updateParking
  ) // Only owner can edit his own
  .delete(protect, authorize('owner'), parkingController.deleteParking); // Only owner can delete his own

router.get('/:id/availability', protect, parkingController.checkParkingAvailability);

module.exports = router;