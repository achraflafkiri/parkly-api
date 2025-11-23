// app.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'exp://192.168.1.*:19000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: '🚗 Parkly API is running successfully!',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API Routes
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/users', require('./routes/user'));
app.use('/api/v1/parkings', require('./routes/parking'));
app.use('/api/v1/bookings', require('./routes/booking'));
app.use('/api/v1/notifications', require('./routes/notification'));

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);

  // Mongoose validation error
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: messages
    });
  }

  // Mongoose duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} already exists`
    });
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired'
    });
  }

  // Default error
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal Server Error'
  });
});

// Database connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/parkly', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
};

const PORT = process.env.PORT || 8090;

// Start server
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`🚗 API Base URL: http://localhost:${PORT}/api/v1`);
  });
};

startServer();

module.exports = app;