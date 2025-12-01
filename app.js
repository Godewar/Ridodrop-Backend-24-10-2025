require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const WebSocketServer = require('./websocketServer');
const cookieParser = require('cookie-parser');

const app = express();

app.use('/uploads', express.static('uploads'));
app.use('/public', express.static('public'));

// Middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

      // Allow localhost, dashboard, and any web client
      if (
        origin.match(/^https?:\/\/(localhost|127\.0\.0\.1):\d+$/) ||
        origin === 'https://ridodrop-dashboard.vercel.app' ||
        origin.match(/^https?:\/\/.+/)
      ) {
        return callback(null, true);
      }

      // Allow all origins (for mobile/web clients)
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 200
  })
);
app.use(cookieParser());
app.use(express.json());

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(async () => {
    console.log('MongoDB connected');

    // Clean up problematic indexes on startup
    try {
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();

      // Check if raidodropusers collection exists
      const userCollection = collections.find((col) => col.name === 'raidodropusers');
      if (userCollection) {
        // Get all indexes and drop problematic ones
        try {
          const indexes = await db.collection('raidodropusers').indexes();
          const problematicIndexes = ['customerId_1', 'referralCode_1', 'email_1'];

          for (const indexName of problematicIndexes) {
            const indexExists = indexes.find((idx) => idx.name === indexName);
            if (indexExists) {
              try {
                await db.collection('raidodropusers').dropIndex(indexName);
                console.log(`Dropped problematic ${indexName} index`);
              } catch (indexErr) {
                console.log(`Failed to drop ${indexName}: ${indexErr.message}`);
              }
            } else {
              console.log(`${indexName} index not found`);
            }
          }
        } catch (listErr) {
          console.log('Could not list indexes:', listErr.message);
        }
      }
    } catch (cleanupErr) {
      console.log('Index cleanup completed');
    }
  })
  .catch((err) => console.error('MongoDB connection error:', err));

// Route placeholders
app.use('/api/v1', require('./routes/auth'));
app.use('/api/v1', require('./routes/users'));
app.use('/api/v1', require('./routes/bookings'));
app.use('/api/v1/wallet', require('./routes/wallet'));
app.use('/api/v1/rider-wallet', require('./routes/riderWallet'));
app.use('/api/v1/riders', require('./routes/riderRouter'));
app.use('/api/v1/notification', require('./routes/notification'));
app.use('/api/v1/prices', require('./routes/prices'));
app.use('/api/v1/services', require('./routes/services'));
app.use('/api/v1/coupons', require('./routes/coupons'));
app.use('/api/v1/vehicles', require('./routes/vehicles'));
app.use('/api/v1/referrals', require('./routes/referral'));
app.use('/api/v1/customer-referral-settings', require('./routes/customerReferralSettings'));
app.use('/api/v1/trip-sharing', require('./routes/tripSharing'));
app.use('/api/v1/settings', require('./routes/settings'));
app.use('/api/v1', require('./routes/tickets'));

// ...existing code...

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'RaidoDrop Backend API',
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Serve trip tracking page
app.get('/track-trip/:token', (req, res) => {
  res.sendFile(__dirname + '/public/track-trip.html');
});

// Test endpoint for diagnostics
app.get('/api/v1/test', (req, res) => {
  res.json({
    message: 'API endpoint working',
    status: 'success',
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'RaidoDrop Backend API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer(server);
// Make WebSocket server globally available for review notifications
global.webSocketServer = wss;

// Make WebSocket server accessible globally
global.wsServer = wss;

// ✅ AUTO-CLEANUP JOB: Cancel stale bookings every 2 minutes
const Booking = require('./models/Booking');
setInterval(async () => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // Find pending bookings older than 5 minutes
    const staleBookings = await Booking.find({
      status: 'pending',
      $or: [{ rider: { $exists: false } }, { rider: null }, { rider: '' }],
      createdAt: { $lt: fiveMinutesAgo },
      bookingStatus: { $nin: ['Completed', 'Cancelled', 'cancelled'] }
    });
    
    if (staleBookings.length > 0) {
      console.log(`🧹 Auto-cleanup: Found ${staleBookings.length} stale bookings to cancel`);
      
      for (const booking of staleBookings) {
        booking.status = 'cancelled';
        booking.bookingStatus = 'Cancelled';
        booking.cancelledBy = 'system';
        booking.cancellationReason = 'No driver available - Auto-cancelled';
        booking.cancelledAt = new Date();
        await booking.save();
        
        console.log(`✅ Auto-cancelled stale booking: ${booking._id}`);
      }
    }
  } catch (err) {
    console.error('❌ Error in auto-cleanup job:', err.message);
  }
}, 2 * 60 * 1000); // Run every 2 minutes

console.log('🤖 Auto-cleanup job started - will cancel bookings older than 5 minutes');

const PORT = process.env.PORT || 3000;

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`WebSocket server is running on port ${PORT}`);
});
