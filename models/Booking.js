const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Booking must belong to a user'],
    },
    parking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Parking',
      required: [true, 'Booking must belong to a parking'],
    },
    startTime: {
      type: Date,
      required: [true, 'Please provide booking start time'],
    },
    duration: {
      type: Number, // in hours
      required: [true, 'Please provide booking duration'],
      min: [1, 'Duration must be at least 1 hour'],
    },
    endTime: {
      type: Date,
    },
    totalAmount: {
      type: Number,
      required: [true, 'Please provide total amount'],
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'active', 'completed', 'cancelled', 'expired'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'wallet'],
      default: 'cash',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    qrCode: {
      type: String,
      unique: true,
    },
    extended: {
      type: Boolean,
      default: false,
    },
    originalEndTime: Date, // For tracking extensions
    notes: String,
    isArrived: {
      type: Boolean,
      default: false,
    },
    isConfirmed: {
      type: Boolean,
      default: false,
    },
    // ✅ Actual parking time tracking
    actualStartTime: {
      type: Date, // When owner confirms and parking actually starts
    },
    actualEndTime: {
      type: Date, // When parking actually ends
    },
    actualDuration: {
      type: Number, // Actual duration in minutes
    },
    overstayDuration: {
      type: Number, // Minutes exceeded beyond booking duration
      default: 0,
    },
    overstayCharge: {
      type: Number, // Additional charge for overstay
      default: 0,
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Calculate end time before saving
bookingSchema.pre('save', function(next) {
  if (this.startTime && this.duration) {
    this.endTime = new Date(this.startTime.getTime() + this.duration * 60 * 60 * 1000);
  }
  next();
});

// Virtual for checking if booking is active
bookingSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.startTime <= now && this.endTime >= now && this.status === 'active';
});

// Virtual for checking if booking is upcoming
bookingSchema.virtual('isUpcoming').get(function() {
  const now = new Date();
  return this.startTime > now && this.status === 'confirmed';
});

// ✅ Virtual for elapsed parking time (in minutes)
bookingSchema.virtual('elapsedTime').get(function() {
  if (!this.actualStartTime) return 0;
  
  const endTime = this.actualEndTime || new Date();
  const elapsed = Math.floor((endTime - this.actualStartTime) / (1000 * 60));
  return elapsed;
});

// ✅ Virtual for remaining time (in minutes)
bookingSchema.virtual('remainingTime').get(function() {
  if (!this.actualStartTime) return this.duration * 60; // Return booking duration in minutes
  
  const bookedDurationMinutes = this.duration * 60;
  const elapsed = this.elapsedTime;
  const remaining = bookedDurationMinutes - elapsed;
  
  return remaining > 0 ? remaining : 0;
});

// ✅ Virtual for checking if overstayed
bookingSchema.virtual('isOverstayed').get(function() {
  if (!this.actualStartTime || this.status === 'completed') return false;
  
  return this.elapsedTime > (this.duration * 60);
});

// Index for better query performance
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ parking: 1, startTime: 1, endTime: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ qrCode: 1 });

// Static method to check parking availability
bookingSchema.statics.checkAvailability = async function(parkingId, startTime, duration) {
  const endTime = new Date(startTime.getTime() + duration * 60 * 60 * 1000);
  
  const conflictingBookings = await this.countDocuments({
    parking: parkingId,
    status: { $in: ['confirmed', 'active'] },
    $or: [
      {
        startTime: { $lt: endTime },
        endTime: { $gt: startTime }
      }
    ]
  });

  return conflictingBookings;
};

// Method to generate QR code
bookingSchema.methods.generateQRCode = function() {
  this.qrCode = `PARKLY-${this._id}-${Date.now()}`;
  return this.qrCode;
};

// ✅ Method to calculate overstay charges
bookingSchema.methods.calculateOverstayCharge = async function() {
  if (!this.isOverstayed) return 0;
  
  const parking = await mongoose.model('Parking').findById(this.parking);
  if (!parking) return 0;
  
  const overstayMinutes = this.elapsedTime - (this.duration * 60);
  const overstayHours = Math.ceil(overstayMinutes / 60);
  
  // Charge 1.5x the regular rate for overstay
  const overstayRate = parking.pricePerHour * 1.5;
  const charge = overstayHours * overstayRate;
  
  this.overstayDuration = overstayMinutes;
  this.overstayCharge = charge;
  
  return charge;
};

const Booking = mongoose.model('Booking', bookingSchema);
module.exports = Booking;