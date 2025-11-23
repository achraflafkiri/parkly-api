// models/Parking.js
const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true
  },
  public_id: {
    type: String,
    required: true
  },
  width: Number,
  height: Number
});

const parkingSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Parking must belong to an owner'],
    },
    name: {
      type: String,
      required: [true, 'Please provide the parking name'],
      trim: true,
    },
    address: {
      type: String,
      required: [true, 'Please provide the address'],
    },
    city: {
      type: String,
      required: [true, 'Please provide the city'],
    },
    zone: {
      type: String,
      enum: ['A', 'B', 'C', 'D'],
      required: [true, 'Please select a zone'],
    },
    type: {
      type: String,
      enum: ['indoor', 'covered', 'outdoor'],
      default: 'outdoor',
    },
    totalSpots: {
      type: Number,
      required: [true, 'Please provide total number of parking spots'],
      min: [1, 'Total spots must be at least 1'],
    },
    pricePerHour: {
      type: Number,
      required: [true, 'Please provide a price per hour'],
    },
    description: {
      type: String,
      trim: true,
    },
    features: {
      type: [String],
      enum: ['security', 'ev', 'covered', 'lighting', 'exposed'],
      default: [],
    },
    images: [imageSchema], // Changed from [String] to array of image objects
    openingHours: {
      open24: { type: Boolean, default: true },
      openTime: { type: String, default: '08:00' },
      closeTime: { type: String, default: '22:00' },
    },
    contactPhone: {
      type: String,
      trim: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Add this to your Parking model (models/Parking.js)
parkingSchema.methods.checkAvailability = async function(startTime, duration) {
  const Booking = mongoose.model('Booking');
  const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000);
  
  const activeBookings = await Booking.countDocuments({
    parking: this._id,
    status: { $in: ['confirmed', 'active'] },
    $or: [
      { startTime: { $lt: endTime }, endTime: { $gt: startTime } }
    ]
  });

  return {
    available: activeBookings < this.totalSpots,
    availableSpots: this.totalSpots - activeBookings,
    totalSpots: this.totalSpots
  };
};

const Parking = mongoose.model('Parking', parkingSchema);
module.exports = Parking;