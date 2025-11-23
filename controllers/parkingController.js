// controllers/parkingController.js
const Parking = require('../models/Parking');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middleware/upload');
const Booking = require('../models/Booking');

// Create parking
exports.createParking = catchAsync(async (req, res, next) => {
    console.log('Files received:', req.files);
    console.log('Body received:', req.body);

    const {
        name,
        address,
        city,
        latitude,
        longitude,
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

    // Validate coordinates
    if (!latitude || !longitude) {
        return next(new AppError(400, 'Location coordinates are required'));
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
        return next(new AppError(400, 'Invalid coordinates format'));
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return next(new AppError(400, 'Coordinates out of valid range'));
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

    // Handle uploaded images
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

    // Create parking with location
    const parking = await Parking.create({
        owner: req.user.id,
        name,
        address,
        city,
        location: {
            type: 'Point',
            coordinates: [lng, lat] // [longitude, latitude] - GeoJSON format
        },
        zone,
        type,
        totalSpots: parseInt(totalSpots),
        pricePerHour: parseFloat(pricePerHour),
        description,
        features: featuresArray,
        images: cloudinaryImages,
        openingHours: openingHoursObj,
        contactPhone,
    });

    console.log('Parking created with location:', parking.location);

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

    console.log('Update request body:', req.body);
    console.log('Update request files:', req.files);

    // Parse existing images from request
    let existingImages = [];
    if (req.body.existingImages) {
        try {
            existingImages = JSON.parse(req.body.existingImages);
            console.log('Existing images to keep:', existingImages);
        } catch (error) {
            console.error('Failed to parse existing images:', error);
            existingImages = parking.images;
        }
    } else {
        existingImages = parking.images;
    }

    // Find images to delete
    const imagesToDelete = parking.images.filter(
        img => !existingImages.find(ei => ei._id && ei._id.toString() === img._id.toString())
    );

    // Delete removed images from Cloudinary
    if (imagesToDelete.length > 0) {
        console.log('Deleting', imagesToDelete.length, 'images from Cloudinary...');
        try {
            const deletePromises = imagesToDelete.map(image => 
                deleteFromCloudinary(image.public_id)
            );
            await Promise.all(deletePromises);
            console.log('Images deleted from Cloudinary');
        } catch (error) {
            console.error('Failed to delete some images from Cloudinary:', error);
        }
    }

    // Upload new images if any
    let newCloudinaryImages = [];
    if (req.files && req.files.length > 0) {
        console.log('Uploading', req.files.length, 'new images to Cloudinary...');
        try {
            newCloudinaryImages = await uploadToCloudinary(req.files);
            console.log('New images uploaded:', newCloudinaryImages);
        } catch (error) {
            console.error('Cloudinary upload failed:', error);
            return next(new AppError(500, `Failed to upload new images: ${error.message}`));
        }
    }

    const updatedImages = [...existingImages, ...newCloudinaryImages];

    // Handle features array
    let featuresArray = parking.features;
    if (req.body.features) {
        if (typeof req.body.features === 'string') {
            try {
                featuresArray = JSON.parse(req.body.features);
            } catch (error) {
                featuresArray = req.body.features.split(',').map(f => f.trim());
            }
        } else if (Array.isArray(req.body.features)) {
            featuresArray = req.body.features;
        }
    }

    // Handle openingHours
    let openingHoursObj = parking.openingHours;
    if (req.body.openingHours && typeof req.body.openingHours === 'string') {
        try {
            openingHoursObj = JSON.parse(req.body.openingHours);
        } catch (error) {
            console.error('Failed to parse opening hours:', error);
        }
    }

    // Handle location update
    let locationObj = parking.location;
    if (req.body.latitude && req.body.longitude) {
        const lat = parseFloat(req.body.latitude);
        const lng = parseFloat(req.body.longitude);
        
        if (!isNaN(lat) && !isNaN(lng)) {
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                locationObj = {
                    type: 'Point',
                    coordinates: [lng, lat]
                };
            }
        }
    }

    // Update parking fields
    const updateData = {
        name: req.body.name || parking.name,
        address: req.body.address || parking.address,
        city: req.body.city || parking.city,
        location: locationObj,
        zone: req.body.zone || parking.zone,
        type: req.body.type || parking.type,
        totalSpots: req.body.totalSpots ? parseInt(req.body.totalSpots) : parking.totalSpots,
        pricePerHour: req.body.pricePerHour ? parseFloat(req.body.pricePerHour) : parking.pricePerHour,
        description: req.body.description !== undefined ? req.body.description : parking.description,
        features: featuresArray,
        images: updatedImages,
        openingHours: openingHoursObj,
        contactPhone: req.body.contactPhone || parking.contactPhone,
    };

    Object.assign(parking, updateData);
    await parking.save();

    console.log('Parking updated successfully:', parking);

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

    try {
        await deleteFromCloudinary(image.public_id);
        console.log('Image deleted from Cloudinary:', image.public_id);
    } catch (error) {
        console.error('Failed to delete image from Cloudinary:', error);
        return next(new AppError(500, 'Failed to delete image from storage'));
    }

    parking.images.pull(imageId);
    await parking.save();

    res.status(200).json({
        success: true,
        message: 'Image deleted successfully',
        data: parking,
    });
});

// Check parking availability
exports.checkParkingAvailability = catchAsync(async (req, res, next) => {
    const { startTime, duration } = req.query;
    
    if (!startTime || !duration) {
        return next(new AppError(400, 'Start time and duration are required'));
    }

    const parking = await Parking.findById(req.params.id);
    if (!parking) {
        return next(new AppError(404, 'Parking not found'));
    }

    const startTimeDate = new Date(startTime);
    const endTime = new Date(startTimeDate.getTime() + duration * 60 * 60 * 1000);

    const activeBookings = await Booking.countDocuments({
        parking: parking._id,
        status: { $in: ['confirmed', 'active'] },
        $or: [
            { startTime: { $lt: endTime }, endTime: { $gt: startTimeDate } }
        ]
    });

    const availableSpots = Math.max(0, parking.totalSpots - activeBookings);

    res.status(200).json({
        success: true,
        data: {
            available: availableSpots > 0,
            availableSpots,
            totalSpots: parking.totalSpots,
            requestedStartTime: startTimeDate,
            requestedEndTime: endTime,
            requestedDuration: duration
        }
    });
});

// Get all parkings by owner
exports.getAllMyParkings = catchAsync(async (req, res, next) => {
    const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        status,
        search,
        type,
        city,
        zone
    } = req.query;

    const filter = { owner: req.user.id };
    
    if (status === 'active') {
        filter.isAvailable = true;
    } else if (status === 'inactive') {
        filter.isAvailable = false;
    }

    if (type) {
        filter.type = type;
    }

    if (city) {
        filter.city = { $regex: city, $options: 'i' };
    }

    if (zone) {
        filter.zone = { $regex: zone, $options: 'i' };
    }

    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { address: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
        ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const parkings = await Parking.find(filter)
        .populate('owner')
        .sort(sort)
        .skip(skip)
        .limit(limitNum);

    const total = await Parking.countDocuments(filter);

    const activeCount = await Parking.countDocuments({ 
        owner: req.user.id, 
        isAvailable: true 
    });
    
    const inactiveCount = await Parking.countDocuments({ 
        owner: req.user.id, 
        isAvailable: false 
    });

    console.log(`Found ${parkings.length} parkings for owner ${req.user.id}`);

    res.status(200).json({
        success: true,
        count: parkings.length,
        total,
        activeCount,
        inactiveCount,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        data: parkings,
    });
});