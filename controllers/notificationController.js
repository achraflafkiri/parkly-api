// controllers/notificationController.js
const Notification = require('../models/Notification');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Get user notifications
exports.getUserNotifications = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, unreadOnly } = req.query;
  
  const filter = { user: req.user.id };
  if (unreadOnly === 'true') {
    filter.isRead = false;
  }

  const notifications = await Notification.find(filter)
    .populate('relatedBooking')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Notification.countDocuments(filter);
  const unreadCount = await Notification.countDocuments({ 
    user: req.user.id, 
    isRead: false 
  });

  res.status(200).json({
    success: true,
    count: notifications.length,
    total,
    unreadCount,
    pages: Math.ceil(total / limit),
    data: notifications,
  });
});

// Mark notification as read
exports.markAsRead = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    user: req.user.id
  });

  if (!notification) {
    return next(new AppError(404, 'Notification not found'));
  }

  if (notification.isRead) {
    return next(new AppError(400, 'Notification is already read'));
  }

  notification.isRead = true;
  await notification.save();

  res.status(200).json({
    success: true,
    message: 'Notification marked as read',
    data: notification,
  });
});

// Mark all notifications as read
exports.markAllAsRead = catchAsync(async (req, res, next) => {
  const result = await Notification.updateMany(
    { user: req.user.id, isRead: false },
    { $set: { isRead: true } }
  );

  res.status(200).json({
    success: true,
    message: 'All notifications marked as read',
    data: {
      modifiedCount: result.modifiedCount
    },
  });
});

// Delete notification
exports.deleteNotification = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOneAndDelete({
    _id: req.params.id,
    user: req.user.id
  });

  if (!notification) {
    return next(new AppError(404, 'Notification not found'));
  }

  res.status(200).json({
    success: true,
    message: 'Notification deleted successfully',
  });
});

// Get unread notifications count
exports.getUnreadCount = catchAsync(async (req, res, next) => {
  const unreadCount = await Notification.countDocuments({ 
    user: req.user.id, 
    isRead: false 
  });

  res.status(200).json({
    success: true,
    data: { unreadCount },
  });
});

// Helper function to create notification (for use in other controllers)
exports.createNotification = async (notificationData) => {
  try {
    const notification = await Notification.create(notificationData);
    
    // Populate the notification with user details
    await notification.populate('user', 'name email');
    if (notification.relatedBooking) {
      await notification.populate('relatedBooking');
    }
    
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

// Helper function to send booking created notification to owner
exports.sendBookingCreatedNotification = async (booking, parking) => {
  try {
    const notificationData = {
      user: parking.owner,
      title: 'تم استلام حجز جديد! 🎉',
      message: `لديك حجز جديد لـ ${parking.name}. السائق: ${booking.user.name || 'غير معروف'}, وقت البدء: ${new Date(booking.startTime).toLocaleString()}`,
      type: 'booking_created',
      relatedBooking: booking._id,
      metadata: {
        parkingId: parking._id,
        parkingName: parking.name,
        driverName: booking.user.name,
        startTime: booking.startTime,
        duration: booking.duration,
        totalAmount: booking.totalAmount,
      }
    };

    const notification = await this.createNotification(notificationData);
    console.log(`📧 Notification sent to owner: ${notification.message}`);
    
    return notification;
  } catch (error) {
    console.error('Error sending booking created notification:', error);
    throw error;
  }
};

// Helper function to send booking confirmed notification to driver
exports.sendBookingConfirmedNotification = async (booking) => {
  try {
    const notificationData = {
      user: booking.user._id,
      title: 'Booking Confirmed! ✅',
      message: `Your booking for ${booking.parking.name} has been confirmed by the owner. You can now proceed to the parking location.`,
      type: 'booking_confirmed',
      relatedBooking: booking._id,
      metadata: {
        parkingId: booking.parking._id,
        parkingName: booking.parking.name,
        isConfirmed: true,
      }
    };

    const notification = await this.createNotification(notificationData);
    console.log(`📧 Booking confirmation notification sent to driver`);
    
    return notification;
  } catch (error) {
    console.error('Error sending booking confirmed notification:', error);
    throw error;
  }
};