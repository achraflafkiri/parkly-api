const express = require('express');
const { 
  getProfile, 
  updateProfile, 
  uploadAvatar, 
  deleteAvatar, 
  changePassword 
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');
const { uploadAvatar: uploadMiddleware, handleUploadError } = require('../middleware/upload');

const router = express.Router();

// All routes are protected
router.use(protect);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/password', changePassword);
router.put('/avatar', uploadMiddleware, handleUploadError, uploadAvatar);
router.delete('/avatar', deleteAvatar);

module.exports = router;