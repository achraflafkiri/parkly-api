// controllers/parkingController.js
const Parking = require('../models/Parking');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middleware/upload');

// Create parking
exports.createParking = catchAsync(async (req, res, next) => {
    console.log('Files received:', req.files); // Debug log
    console.log('Body received:', req.body); // Debug log

    // Parse JSON fields from form-data
    const {
        name,
        address,
        city,
        zone,
        type,
        totalSpots,
        pricePerHour,
        description,
        features,
        openingHours,
        contactPhone,
    } = req.body;

    if (!req.user || !req.user.id) {
        return next(new AppError(401, 'Unauthorized. Please log in.'));
    }

    // Handle features array
    let featuresArray = [];
    if (features) {
        if (typeof features === 'string') {
            try {
                featuresArray = JSON.parse(features);
            } catch (error) {
                featuresArray = features.split(',').map(f => f.trim());
            }
        } else if (Array.isArray(features)) {
            featuresArray = features;
        }
    }

    // Handle openingHours
    let openingHoursObj = { open24: true, openTime: '08:00', closeTime: '22:00' };
    if (openingHours && typeof openingHours === 'string') {
        try {
            openingHoursObj = JSON.parse(openingHours);
        } catch (error) {
            // Use default if parsing fails
        }
    }

    // Handle uploaded images - Upload to Cloudinary
    let cloudinaryImages = [];
    if (req.files && req.files.length > 0) {
        console.log('Uploading', req.files.length, 'images to Cloudinary...');
        try {
            cloudinaryImages = await uploadToCloudinary(req.files);
            console.log('Cloudinary upload successful:', cloudinaryImages);
        } catch (error) {
            console.error('Cloudinary upload failed:', error);
            return next(new AppError(500, `Failed to upload images: ${error.message}`));
        }
    }

    // Create parking with Cloudinary image URLs
    const parking = await Parking.create({
        owner: req.user.id,
        name,
        address,
        city,
        zone,
        type,
        totalSpots: parseInt(totalSpots),
        pricePerHour: parseFloat(pricePerHour),
        description,
        features: featuresArray,
        images: cloudinaryImages, // This should now be Cloudinary URLs
        openingHours: openingHoursObj,
        contactPhone,
    });

    console.log('Parking created with images:', parking.images); // Debug log

    res.status(201).json({
        success: true,
        message: 'Parking created successfully',
        data: parking,
    });
});

// Update parking
exports.updateParking = catchAsync(async (req, res, next) => {
    const parking = await Parking.findById(req.params.id);
    if (!parking) return next(new AppError(404, 'Parking not found'));

    if (parking.owner.toString() !== req.user.id) {
        return next(new AppError(403, 'You do not have permission to update this parking'));
    }

    // Handle new file uploads
    if (req.files && req.files.length > 0) {
        console.log('Uploading new images to Cloudinary...');
        try {
            const uploadResults = await uploadToCloudinary(req.files);
            // Add new images to existing ones
            req.body.images = [...parking.images, ...uploadResults];
            console.log('New images added:', uploadResults);
        } catch (error) {
            console.error('Cloudinary upload failed:', error);
            return next(new AppError(500, `Failed to upload new images: ${error.message}`));
        }
    }

    Object.assign(parking, req.body);
    await parking.save();

    res.status(200).json({
        success: true,
        message: 'Parking updated successfully',
        data: parking,
    });
});

// Get all available parkings
exports.getAllParkings = catchAsync(async (req, res, next) => {
    const parkings = await Parking.find({ isAvailable: true }).populate('owner', 'name email phone');
    res.status(200).json({
        success: true,
        count: parkings.length,
        data: parkings,
    });
});

// Get parking by ID
exports.getParkingById = catchAsync(async (req, res, next) => {
    const parking = await Parking.findById(req.params.id).populate('owner', 'name email phone');
    if (!parking) return next(new AppError(404, 'Parking not found'));

    res.status(200).json({
        success: true,
        data: parking,
    });
});

exports.deleteParking = catchAsync(async (req, res, next) => {
    const parking = await Parking.findById(req.params.id);
    if (!parking) return next(new AppError(404, 'Parking not found'));

    if (parking.owner.toString() !== req.user.id) {
        return next(new AppError(403, 'You do not have permission to delete this parking'));
    }

    // Delete images from Cloudinary
    if (parking.images && parking.images.length > 0) {
        console.log('Deleting images from Cloudinary...');
        try {
            const deletePromises = parking.images.map(image => 
                deleteFromCloudinary(image.public_id)
            );
            await Promise.all(deletePromises);
            console.log('Images deleted from Cloudinary');
        } catch (error) {
            console.error('Failed to delete images from Cloudinary:', error);
        }
    }

    await parking.deleteOne();
    res.status(200).json({
        success: true,
        message: 'Parking deleted successfully',
    });
});

// Delete single image from parking
exports.deleteParkingImage = catchAsync(async (req, res, next) => {
    const { parkingId, imageId } = req.params;
    
    const parking = await Parking.findById(parkingId);
    if (!parking) return next(new AppError(404, 'Parking not found'));

    if (parking.owner.toString() !== req.user.id) {
        return next(new AppError(403, 'You do not have permission to modify this parking'));
    }

    const image = parking.images.id(imageId);
    if (!image) return next(new AppError(404, 'Image not found'));

    // Delete from Cloudinary
    try {
        await deleteFromCloudinary(image.public_id);
        console.log('Image deleted from Cloudinary:', image.public_id);
    } catch (error) {
        console.error('Failed to delete image from Cloudinary:', error);
        return next(new AppError(500, 'Failed to delete image from storage'));
    }

    // Remove from parking images array
    parking.images.pull(imageId);
    await parking.save();

    res.status(200).json({
        success: true,
        message: 'Image deleted successfully',
        data: parking,
    });
});
