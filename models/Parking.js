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

const Parking = mongoose.model('Parking', parkingSchema);
module.exports = Parking;