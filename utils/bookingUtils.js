// utils/bookingUtils.js
const Booking = require('../models/Booking');
const Parking = require('../models/Parking');

// Auto-update booking statuses
exports.updateBookingStatuses = async () => {
  const now = new Date();
  
  // Activate bookings that should be active
  await Booking.updateMany(
    {
      status: 'confirmed',
      startTime: { $lte: now },
      endTime: { $gte: now }
    },
    { status: 'active' }
  );

  // Complete expired bookings
  await Booking.updateMany(
    {
      status: { $in: ['active', 'confirmed'] },
      endTime: { $lt: now }
    },
    { status: 'completed' }
  );
};

// Get parking availability for a time range
exports.getParkingAvailability = async (parkingId, startTime, endTime) => {
  const parking = await Parking.findById(parkingId);
  if (!parking) throw new Error('Parking not found');

  const activeBookings = await Booking.countDocuments({
    parking: parkingId,
    status: { $in: ['confirmed', 'active'] },
    $or: [
      { startTime: { $lt: endTime }, endTime: { $gt: startTime } }
    ]
  });

  return {
    availableSpots: Math.max(0, parking.totalSpots - activeBookings),
    totalSpots: parking.totalSpots,
    isAvailable: (parking.totalSpots - activeBookings) > 0
  };
};