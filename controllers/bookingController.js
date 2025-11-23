const Booking = require('../models/Booking');
const Parking = require('../models/Parking');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Create new booking
exports.createBooking = catchAsync(async (req, res, next) => {
  const {
    parkingId,
    startTime,
    duration,
    paymentMethod,
    notes
  } = req.body;

  console.log("afin req.body", req.body);

  // Validate required fields
  if (!parkingId || !startTime || !duration) {
    return next(new AppError(400, 'Parking ID, start time, and duration are required'));
  }

  // Check if parking exists and is available
  const parking = await Parking.findById(parkingId);
  if (!parking) {
    return next(new AppError(404, 'Parking not found'));
  }

  if (!parking.isAvailable) {
    return next(new AppError(400, 'Parking is not available for booking'));
  }

  // Check availability
  const startTimeDate = new Date(startTime);
  const conflictingBookings = await Booking.checkAvailability(parkingId, startTimeDate, duration);
  
  if (conflictingBookings >= parking.totalSpots) {
    return next(new AppError(400, 'Parking is not available for the selected time slot'));
  }

  // Calculate total amount
  const totalAmount = parking.pricePerHour * duration;

  // Create booking
  const booking = await Booking.create({
    user: req.user.id,
    parking: parkingId,
    startTime: startTimeDate,
    duration,
    totalAmount,
    paymentMethod: paymentMethod || 'cash',
    notes,
    status: paymentMethod === 'cash' ? 'confirmed' : 'pending'
  });

  // Generate QR code
  booking.generateQRCode();
  await booking.save();

  // Populate booking data
  await booking.populate('parking', 'name address city zone type pricePerHour');
  await booking.populate('user', 'name email phone');

  res.status(201).json({
    success: true,
    message: 'Booking created successfully',
    data: booking,
  });
});

// Get user's bookings
exports.getUserBookings = catchAsync(async (req, res, next) => {
  const { status, page = 1, limit = 10 } = req.query;
  
  const filter = { user: req.user.id };
  if (status && status !== 'all') {
    filter.status = status;
  }

  const bookings = await Booking.find(filter)
    .populate('parking', 'name address city zone type images pricePerHour')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Booking.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: bookings.length,
    total,
    pages: Math.ceil(total / limit),
    data: bookings,
  });
});

// Get booking by ID
exports.getBookingById = catchAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id)
    .populate('parking', 'name address city zone type images pricePerHour owner')
    .populate('user', 'name email phone');

  if (!booking) {
    return next(new AppError(404, 'Booking not found'));
  }

  // Check if user owns the booking or is parking owner
  if (booking.user._id.toString() !== req.user.id && 
      booking.parking.owner._id.toString() !== req.user.id) {
    return next(new AppError(403, 'Access denied to this booking'));
  }

  res.status(200).json({
    success: true,
    data: booking,
  });
});

// Update booking status
exports.updateBookingStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  const allowedStatuses = ['confirmed', 'active', 'completed', 'cancelled'];

  if (!allowedStatuses.includes(status)) {
    return next(new AppError(400, 'Invalid status'));
  }

  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    return next(new AppError(404, 'Booking not found'));
  }

  // Check permissions
  if (booking.user.toString() !== req.user.id && 
      !req.user.role.includes('owner')) {
    return next(new AppError(403, 'Access denied to update this booking'));
  }

  booking.status = status;
  
  // If marking as active, validate start time
  if (status === 'active') {
    const now = new Date();
    const bufferTime = 30 * 60 * 1000; // 30 minutes buffer
    
    if (booking.startTime > new Date(now.getTime() + bufferTime)) {
      return next(new AppError(400, 'Cannot activate booking too early'));
    }
  }

  await booking.save();

  res.status(200).json({
    success: true,
    message: `Booking ${status} successfully`,
    data: booking,
  });
});

// Extend booking duration
exports.extendBooking = catchAsync(async (req, res, next) => {
  const { additionalHours } = req.body;

  if (!additionalHours || additionalHours < 1) {
    return next(new AppError(400, 'Additional hours must be at least 1'));
  }

  const booking = await Booking.findById(req.params.id)
    .populate('parking', 'pricePerHour totalSpots');
  
  if (!booking) {
    return next(new AppError(404, 'Booking not found'));
  }

  if (booking.user.toString() !== req.user.id) {
    return next(new AppError(403, 'Access denied to extend this booking'));
  }

  if (!['active', 'confirmed'].includes(booking.status)) {
    return next(new AppError(400, 'Can only extend active or confirmed bookings'));
  }

  // Check availability for extension
  const newEndTime = new Date(booking.endTime.getTime() + additionalHours * 60 * 60 * 1000);
  const conflictingBookings = await Booking.checkAvailability(
    booking.parking._id, 
    booking.endTime, 
    additionalHours
  );

  if (conflictingBookings >= booking.parking.totalSpots) {
    return next(new AppError(400, 'Parking not available for extension time'));
  }

  // Calculate additional cost
  const additionalAmount = booking.parking.pricePerHour * additionalHours;

  // Update booking
  if (!booking.originalEndTime) {
    booking.originalEndTime = booking.endTime;
  }

  booking.duration += additionalHours;
  booking.endTime = newEndTime;
  booking.totalAmount += additionalAmount;
  booking.extended = true;

  await booking.save();

  res.status(200).json({
    success: true,
    message: `Booking extended by ${additionalHours} hours`,
    data: booking,
  });
});

// Cancel booking
exports.cancelBooking = catchAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id);
  
  if (!booking) {
    return next(new AppError(404, 'Booking not found'));
  }

  if (booking.user.toString() !== req.user.id) {
    return next(new AppError(403, 'Access denied to cancel this booking'));
  }

  // Check if booking can be cancelled (e.g., not too close to start time)
  const now = new Date();
  const hoursUntilStart = (booking.startTime - now) / (1000 * 60 * 60);
  
  if (hoursUntilStart < 1) {
    return next(new AppError(400, 'Cannot cancel booking less than 1 hour before start time'));
  }

  if (!['pending', 'confirmed'].includes(booking.status)) {
    return next(new AppError(400, 'Cannot cancel booking in current status'));
  }

  booking.status = 'cancelled';
  await booking.save();

  res.status(200).json({
    success: true,
    message: 'Booking cancelled successfully',
    data: booking,
  });
});

// Get parking owner's bookings
exports.getOwnerBookings = catchAsync(async (req, res, next) => {
  const { status, page = 1, limit = 10 } = req.query;
  
  // Find parkings owned by this user
  const userParkings = await Parking.find({ owner: req.user.id }).select('_id');
  const parkingIds = userParkings.map(p => p._id);

  const filter = { parking: { $in: parkingIds } };
  if (status && status !== 'all') {
    filter.status = status;
  }

  const bookings = await Booking.find(filter)
    .populate('parking', 'name address zone type')
    .populate('user', 'name email phone')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Booking.countDocuments(filter);

  res.status(200).json({
    success: true,
    count: bookings.length,
    total,
    pages: Math.ceil(total / limit),
    data: bookings,
  });
});

// Scan QR code and validate booking
exports.scanBooking = catchAsync(async (req, res, next) => {
  const { qrCode } = req.body;

  if (!qrCode) {
    return next(new AppError(400, 'QR code is required'));
  }

  const booking = await Booking.findOne({ qrCode })
    .populate('parking')
    .populate('user', 'name phone');

  if (!booking) {
    return next(new AppError(404, 'Invalid QR code'));
  }

  // Check if user owns the parking
  if (booking.parking.owner.toString() !== req.user.id) {
    return next(new AppError(403, 'Access denied to scan this booking'));
  }

  const now = new Date();
  const isActive = booking.startTime <= now && booking.endTime >= now;

  res.status(200).json({
    success: true,
    data: {
      booking,
      isValid: isActive && booking.status === 'active',
      currentTime: now,
      message: isActive ? 'Booking is valid' : 'Booking is not active'
    },
  });
});

exports.getBookingsByParking = catchAsync(async (req, res, next) => {
  const { parkingId } = req.params;
  
  const bookings = await Booking.find({ parking: parkingId })
    .populate('user', 'name email phone')
    .populate('parking')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: bookings.length,
    data: bookings,
  });
});


// Driver marks themselves as arrived
exports.markAsArrived = catchAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id)
    .populate('parking', 'name address');

  if (!booking) {
    return next(new AppError(404, 'Booking not found'));
  }

  // Check if user owns the booking (driver only)
  if (booking.user.toString() !== req.user.id) {
    return next(new AppError(403, 'Only the driver who made this booking can mark as arrived'));
  }

  // Validate if booking can be marked as arrived
  const now = new Date();
  const bufferTime = 30 * 60 * 1000; // 30 minutes buffer
  
  // Can mark as arrived up to 30 minutes before start time
  if (booking.startTime > new Date(now.getTime() + bufferTime)) {
    return next(new AppError(400, 'Cannot mark as arrived more than 30 minutes before start time'));
  }

  // Can only mark confirmed bookings as arrived
  if (booking.status !== 'confirmed') {
    return next(new AppError(400, 'Can only mark confirmed bookings as arrived'));
  }

  if (booking.isArrived) {
    return next(new AppError(400, 'Booking is already marked as arrived'));
  }

  booking.isArrived = true;
  await booking.save();

  // Populate the updated booking
  await booking.populate('parking', 'name address city zone type');
  await booking.populate('user', 'name email phone');

  res.status(200).json({
    success: true,
    message: 'Successfully marked as arrived at parking location',
    data: booking,
  });
});

// Owner confirms booking (after driver has arrived)
exports.confirmBooking = catchAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id)
    .populate('parking', 'owner name address')
    .populate('user', 'name phone');

  if (!booking) {
    return next(new AppError(404, 'Booking not found'));
  }

  // Check if user is the parking owner
  if (booking.parking.owner.toString() !== req.user.id) {
    return next(new AppError(403, 'Only parking owner can confirm bookings'));
  }

  if (booking.isConfirmed) {
    return next(new AppError(400, 'Booking is already confirmed'));
  }

  // Check if driver has arrived first
  if (!booking.isArrived) {
    return next(new AppError(400, 'Driver must mark as arrived before confirmation'));
  }

  // Validate booking status
  if (booking.status !== 'confirmed') {
    return next(new AppError(400, 'Can only confirm bookings with confirmed status'));
  }

  const now = new Date();
  
  // Validate time (can confirm up to 30 minutes before start time)
  if (booking.startTime > new Date(now.getTime() + (30 * 60 * 1000))) {
    return next(new AppError(400, 'Cannot confirm booking more than 30 minutes before start time'));
  }

  booking.isConfirmed = true;
  booking.status = 'active'; // Change status to active when confirmed by owner
  await booking.save();

  res.status(200).json({
    success: true,
    message: 'Booking confirmed successfully. Parking spot is now active.',
    data: booking,
  });
});

// Get booking status (for both driver and owner)
exports.getBookingStatus = catchAsync(async (req, res, next) => {
  const booking = await Booking.findById(req.params.id)
    .populate('parking', 'name address owner')
    .populate('user', 'name phone');

  if (!booking) {
    return next(new AppError(404, 'Booking not found'));
  }

  // Check if user has access to this booking
  if (booking.user._id.toString() !== req.user.id && 
      booking.parking.owner.toString() !== req.user.id) {
    return next(new AppError(403, 'Access denied to this booking'));
  }

  res.status(200).json({
    success: true,
    data: {
      booking,
      statusInfo: {
        isArrived: booking.isArrived,
        isConfirmed: booking.isConfirmed,
        status: booking.status,
        canMarkArrived: booking.user._id.toString() === req.user.id && 
                       !booking.isArrived && 
                       booking.status === 'confirmed',
        canConfirm: booking.parking.owner.toString() === req.user.id && 
                   !booking.isConfirmed && 
                   booking.isArrived &&
                   booking.status === 'confirmed'
      }
    },
  });
});