const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const RiderSchema = require('./models/RiderSchema');
const Booking = require('./models/Booking');
const { sendNewBookingNotification } = require('./utils/pushNotifications');

class WebSocketServer {
    constructor(server) {
        this.wss = new WebSocket.Server({ server });
        this.clients = new Map(); // Map to store connected clients
        this.riderConnections = new Map(); // Map to store rider connections
        this.customerConnections = new Map(); // Map<riderId, Set<ws>>
        this.riderLocations = new Map(); // Map<riderId, {latitude, longitude, vehicleType, lastUpdate}>
        this.tripWatchers = new Map(); // Map<shareToken, Set<ws>> for public trip tracking
        this.initialize();
    }

    initialize() {
        this.wss.on('connection', (ws, req) => {
            this.handleConnection(ws, req);
        });

        ('WebSocket server initialized');
    }

    handleConnection(ws, req) {
        try {
            // Parse query parameters
            const url = new URL(req.url, `http://${req.headers.host}`);
            let riderId = url.searchParams.get('riderId');
            const role = url.searchParams.get('role'); // 'rider', 'customer', or 'trip_watcher'
            const shareToken = url.searchParams.get('shareToken'); // For public trip tracking

            // Debug log for riderId
            ('[WS] Parsed riderId:', riderId);

            // Defensive: ensure only the id part is used (strip any accidental query string)
            if (riderId && riderId.includes('?')) {
                riderId = riderId.split('?')[0];
                ('[WS] Cleaned riderId:', riderId);
            }

            // Log every connection attempt with remote address
            console.log(`[WS] New connection from ${req.socket.remoteAddress} - Role: ${role}, RiderId: ${riderId}, ShareToken: ${shareToken}`);

            if (role === 'trip_watcher') {
                // Public trip tracking connection
                if (!shareToken) {
                    ws.close(1008, 'Missing shareToken for trip watching');
                    return;
                }
                
                // Store trip watcher connection
                if (!this.tripWatchers.has(shareToken)) {
                    this.tripWatchers.set(shareToken, new Set());
                }
                this.tripWatchers.get(shareToken).add(ws);
                
                // Remove on close
                ws.on('close', () => {
                    const set = this.tripWatchers.get(shareToken);
                    if (set) {
                        set.delete(ws);
                        if (set.size === 0) {
                            this.tripWatchers.delete(shareToken);
                        }
                    }
                    console.log(`[WS] Trip watcher disconnected for token: ${shareToken}`);
                });
                
                ws.on('error', (err) => {
                    const set = this.tripWatchers.get(shareToken);
                    if (set) {
                        set.delete(ws);
                        if (set.size === 0) {
                            this.tripWatchers.delete(shareToken);
                        }
                    }
                    console.log(`[WS] Trip watcher error for token: ${shareToken}`, err);
                });
                
                // Send welcome message
                this.sendToClient(ws, {
                    type: 'connection_established',
                    role: 'trip_watcher',
                    shareToken,
                    timestamp: Date.now(),
                    message: 'Connected to trip tracking'
                });
                
                console.log(`[WS] Trip watcher connected for token: ${shareToken}`);
                return;
            }

            if (role === 'customer') {
                // Customer connection: only need riderId
                if (!riderId) {
                    ws.close(1008, 'Missing riderId');
                    return;
                }
                // Store customer connection
                if (!this.customerConnections.has(riderId)) {
                    this.customerConnections.set(riderId, new Set());
                }
                this.customerConnections.get(riderId).add(ws);
                // Remove on close
                ws.on('close', () => {
                    const set = this.customerConnections.get(riderId);
                    if (set) set.delete(ws);
                    (`[WS] Customer disconnected for riderId: ${riderId} from ${req.socket.remoteAddress}`);
                });
                ws.on('error', (err) => {
                    const set = this.customerConnections.get(riderId);
                    if (set) set.delete(ws);
                    (`[WS] Customer error/disconnect for riderId: ${riderId} from ${req.socket.remoteAddress}. Error:`, err);
                });
                // Optionally send a welcome message
                this.sendToClient(ws, {
                    type: 'connection_established',
                    role: 'customer',
                    riderId,
                    timestamp: Date.now(),
                    message: 'Connected to RidoDrop tracking server as customer'
                });
                (`[WS] Customer connected for riderId: ${riderId} from ${req.socket.remoteAddress}`);
                return;
            }

            // Remove token check for rider connection
            if (!riderId) {
                ws.close(1008, 'Missing riderId');
                return;
            }

            // No token verification for rider
            // Store client connection
            this.clients.set(ws, { riderId, connectedAt: Date.now() });
            this.riderConnections.set(riderId, ws);

            (`[WS] Rider ${riderId} connected`);

            // Send welcome message
            this.sendToClient(ws, {
                type: 'connection_established',
                riderId,
                timestamp: Date.now(),
                message: 'Connected to RidoDrop tracking server'
            });

            // Handle incoming messages
            ws.on('message', (data) => {
                ('[WS] Raw message received:', data);
                try {
                    const message = JSON.parse(data);
                    (`[WS] Message received from rider ${riderId}:`, message);
                    this.handleMessage(ws, message);
                } catch (error) {
                    console.error('Failed to parse message:', error);
                    this.sendToClient(ws, {
                        type: 'error',
                        message: 'Invalid message format'
                    });
                }
            });

            // Handle client disconnect
            ws.on('close', (code, reason) => {
                (`[WS] Rider ${riderId} disconnected: ${reason}`);
                this.handleDisconnect(ws, riderId);
            });

            // Handle errors
            ws.on('error', (error) => {
                console.error(`[WS] WebSocket error for rider ${riderId}:`, error);
                this.handleDisconnect(ws, riderId);
            });

        } catch (error) {
            console.error('Connection error:', error);
            ws.close(1011, 'Internal server error');
        }
    }

    handleMessage(ws, message) {
        const client = this.clients.get(ws);
        if (!client) return;

        const { riderId } = client;

        switch (message.type) {
            case 'location_update':
                this.handleLocationUpdate(riderId, message.data);
                break;

            case 'status_update':
                this.handleStatusUpdate(riderId, message.data);
                break;

            case 'order_update':
                this.handleOrderUpdate(riderId, message.data);
                break;

            case 'ping':
                this.sendToClient(ws, {
                    type: 'pong',
                    timestamp: Date.now()
                });
                break;

            default:
                (`Unknown message type: ${message.type}`);
        }
    }

    async handleLocationUpdate(riderId, locationData) {
        try {
            // Validate riderId before processing
            if (!riderId || riderId === 'undefined' || typeof riderId !== 'string' || riderId.length !== 24) {
                console.log(`[WS] ⚠️ Invalid riderId received: ${riderId} (type: ${typeof riderId})`);
                return;
            }

            // Update rider's location in database
            const rider = await RiderSchema.findByIdAndUpdate(riderId, {
                currentLocation: {
                    type: 'Point',
                    coordinates: [locationData.longitude, locationData.latitude]
                },
                lastLocationUpdate: new Date(),
                isOnline: true
            }, { new: true }).select('vehicleType');

            console.log(`[WS] Location update from rider ${riderId}:`, locationData);

            // Store location in memory for fast access
            this.riderLocations.set(riderId, {
                latitude: locationData.latitude,
                longitude: locationData.longitude,
                vehicleType: rider?.vehicleType,
                lastUpdate: Date.now()
            });

            // Broadcast location to relevant clients (admin, customers, etc.)
            this.broadcastLocationUpdate(riderId, locationData);

            console.log(`[WS] Location update for rider ${riderId}: ${locationData.latitude}, ${locationData.longitude}`);
        } catch (error) {
            console.error('Failed to handle location update:', error);
        }
    }

    async handleStatusUpdate(riderId, statusData) {
        try {
            // Update rider status in database
            await RiderSchema.findByIdAndUpdate(riderId, {
                status: statusData.status,
                lastStatusUpdate: new Date()
            });

            // Broadcast status update
            this.broadcastStatusUpdate(riderId, statusData);

            (`Status update for rider ${riderId}: ${statusData.status}`);
        } catch (error) {
            console.error('Failed to handle status update:', error);
        }
    }

    async handleOrderUpdate(riderId, orderData) {
        try {
            // Update order status in database
            await Booking.findByIdAndUpdate(orderData.orderId, {
                status: orderData.status,
                updatedAt: new Date()
            });

            // Broadcast order update
            this.broadcastOrderUpdate(riderId, orderData);

            (`Order update for rider ${riderId}: ${orderData.status}`);
        } catch (error) {
            console.error('Failed to handle order update:', error);
        }
    }

    // async checkNearbyOrders(riderId, locationData) {
    //     try {
    //         // Find nearby pending orders
    //         const nearbyOrders = await Booking.find({
    //             status: 'pending',
    //             location: {
    //                 $near: {
    //                     $geometry: {
    //                         type: 'Point',
    //                         coordinates: [locationData.longitude, locationData.latitude]
    //                     },
    //                     $maxDistance: 5000 // 5km radius
    //                 }
    //             }
    //         }).limit(5);

    //         if (nearbyOrders.length > 0) {
    //             // Send nearby orders to rider
    //             this.sendToRider(riderId, {
    //                 type: 'nearby_orders',
    //                 orders: nearbyOrders.map(order => ({
    //                     id: order._id,
    //                     pickup: order.pickupLocation,
    //                     dropoff: order.dropoffLocation,
    //                     fare: order.fare,
    //                     distance: this.calculateDistance(
    //                         locationData.latitude,
    //                         locationData.longitude,
    //                         order.pickupLocation.coordinates[1],
    //                         order.pickupLocation.coordinates[0]
    //                     )
    //                 }))
    //             });
    //         }
    //     } catch (error) {
    //         console.error('Failed to check nearby orders:', error);
    //     }
    // }

    async broadcastLocationUpdate(riderId, locationData) {
        // Send to admin clients
        this.broadcastToAdmins({
            type: 'rider_location_update',
            riderId,
            location: locationData
        });

        // Send to customers with active orders for this rider
        this.broadcastToCustomers(riderId, {
            type: 'rider_location_update',
            riderId,
            location: locationData
        });

        // Send to public trip watchers (for shared trip tracking)
        await this.broadcastToTripWatchers(riderId, locationData);
    }

    broadcastStatusUpdate(riderId, statusData) {
        this.broadcastToAdmins({
            type: 'rider_status_update',
            riderId,
            status: statusData
        });
    }

    broadcastOrderUpdate(riderId, orderData) {
        this.broadcastToAdmins({
            type: 'order_update',
            riderId,
            order: orderData
        });
    }

    broadcastToAdmins(message) {
        this.clients.forEach((client, ws) => {
            if (client.isAdmin) {
                this.sendToClient(ws, message);
            }
        });
    }

    broadcastToCustomers(riderId, message) {
        // Send to all customers tracking this riderId
        const customers = this.customerConnections.get(riderId);
        if (customers) {
            console.log(`[WS] Broadcasting to ${customers.size} customers for rider ${riderId}:`, message);
            customers.forEach(ws => {
                this.sendToClient(ws, message);
            });
        } else {
            console.log(`[WS] No customers to broadcast for rider ${riderId}`);
        }
    }

    async broadcastToTripWatchers(riderId, locationData) {
        try {
            // Find active bookings for this rider that have share tokens
            const activeBookings = await Booking.find({
                $or: [
                    { rider: riderId },
                    { driver: riderId }
                ],
                status: { $in: ['accepted', 'in_progress'] },
                shareToken: { $exists: true, $ne: null }
            }).select('shareToken status currentStep');

            // Broadcast to trip watchers for each active shared trip
            activeBookings.forEach(booking => {
                const watchers = this.tripWatchers.get(booking.shareToken);
                if (watchers && watchers.size > 0) {
                    const tripLocationUpdate = {
                        type: 'trip_location_update',
                        shareToken: booking.shareToken,
                        location: {
                            latitude: locationData.latitude,
                            longitude: locationData.longitude,
                            timestamp: Date.now()
                        },
                        status: booking.status,
                        currentStep: booking.currentStep
                    };

                    watchers.forEach(ws => {
                        this.sendToClient(ws, tripLocationUpdate);
                    });

                    console.log(`[WS] 📍 Broadcasted location to ${watchers.size} trip watchers for token: ${booking.shareToken}`);
                }
            });

        } catch (error) {
            console.error('[WS] Error broadcasting to trip watchers:', error);
        }
    }

    sendToRider(riderId, message) {
        const ws = this.riderConnections.get(riderId);
        if (ws && ws.readyState === WebSocket.OPEN) {
            this.sendToClient(ws, message);
        }
    }

    sendToClient(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    handleDisconnect(ws, riderId) {
        // Remove from clients map
        this.clients.delete(ws);
        this.riderConnections.delete(riderId);
        this.riderLocations.delete(riderId);

        // Update rider status in database
        RiderSchema.findByIdAndUpdate(riderId, {
            isOnline: false,
            lastSeen: new Date()
        }).catch(error => {
            console.error('Failed to update rider status on disconnect:', error);
        });

        console.log(`Rider ${riderId} disconnected`);
    }

    // Broadcast review notification to users
    broadcastReviewNotification(reviewData) {
        try {
            console.log('[WS] 📝 Broadcasting review notification:', reviewData);
            
            const { bookingId, reviewBy, reviewFor, rating, isRiderReview } = reviewData;
            
            // Notify the person who received the review
            if (isRiderReview && this.riderConnections.has(reviewFor)) {
                const ws = this.riderConnections.get(reviewFor);
                if (ws && ws.readyState === 1) { // WebSocket.OPEN = 1
                    this.sendToClient(ws, {
                        type: 'review_received',
                        message: `You received a ${rating}-star review!`,
                        bookingId,
                        rating,
                        reviewBy,
                        timestamp: Date.now()
                    });
                    console.log(`[WS] 🔔 Sent review notification to rider: ${reviewFor}`);
                }
            } else if (!isRiderReview && this.customerConnections.has(reviewFor)) {
                const customerSockets = this.customerConnections.get(reviewFor);
                if (customerSockets && customerSockets.size > 0) {
                    customerSockets.forEach(ws => {
                        if (ws && ws.readyState === 1) { // WebSocket.OPEN = 1
                            this.sendToClient(ws, {
                                type: 'review_received',
                                message: `You received a ${rating}-star review from your rider!`,
                                bookingId,
                                rating,
                                reviewBy,
                                timestamp: Date.now()
                            });
                        }
                    });
                    console.log(`[WS] 🔔 Sent review notification to customer: ${reviewFor}`);
                }
            }
            
            // Also broadcast to admins for monitoring
            this.broadcastToAdmins({
                type: 'new_review',
                message: `New ${rating}-star review submitted`,
                bookingId,
                reviewBy,
                reviewFor,
                rating,
                isRiderReview,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('[WS] ❌ Error broadcasting review notification:', error);
        }
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    deg2rad(deg) {
        return deg * (Math.PI / 180);
    }

    // Get connected riders count
    getConnectedRidersCount() {
        return this.riderConnections.size;
    }

    // Get all connected riders
    getConnectedRiders() {
        return Array.from(this.riderConnections.keys());
    }

    // Send message to all riders
    broadcastToAllRiders(message) {
        this.riderConnections.forEach((ws, riderId) => {
            this.sendToClient(ws, message);
        });
    }

    // Broadcast booking update to assigned rider
    broadcastBookingUpdate(riderId, bookingData) {
        console.log(`[WS] 🔄 Broadcasting booking update to rider ${riderId}`);
        
        const message = {
            type: 'booking_updated',
            bookingId: bookingData.bookingId,
            updates: bookingData.updates,
            timestamp: Date.now()
        };

        this.sendToRider(riderId, message);
    }

    // Broadcast tip update for pending booking to nearby riders
    async broadcastTipUpdateForPendingBooking(booking, tipMessage) {
        try {
            console.log(`[WS] 💸 Broadcasting tip update for pending booking ${booking._id}`);
            
            if (!booking.fromAddress?.latitude || !booking.fromAddress?.longitude) {
                console.log('[WS] ⚠️ Booking missing pickup location for tip broadcast');
                return;
            }

            const pickupLat = booking.fromAddress.latitude;
            const pickupLon = booking.fromAddress.longitude;
            const requiredVehicleType = this.normalizeVehicleType(booking.vehicleType);
            const maxDistance = 5; // 5km radius - same as new booking broadcast

            console.log('[WS] 🎯 Broadcasting tip update to nearby riders:', {
                vehicleType: requiredVehicleType,
                pickup: { lat: pickupLat, lon: pickupLon },
                tipAmount: tipMessage.tipAmount
            });

            let notifiedRiders = 0;

            // Get all riders from DB to check preferred area settings
            const Rider = require('./models/RiderSchema');
            const allRiders = await Rider.find({ 
                isOnline: true 
            }).select('_id vehicleType preferredArea currentLocation');

            // Send to nearby riders who could see this booking
            for (const rider of allRiders) {
                const riderId = rider._id.toString();
                const riderVehicleType = this.normalizeVehicleType(rider.vehicleType);
                
                // Check vehicle type match
                if (riderVehicleType !== requiredVehicleType) {
                    continue;
                }

                // Determine which location to use for distance calculation
                let riderLat, riderLon;
                let checkDropLocation = false;
                
                if (rider.preferredArea?.enabled && 
                    rider.preferredArea?.latitude && 
                    rider.preferredArea?.longitude) {
                    // Use preferred area location
                    riderLat = rider.preferredArea.latitude;
                    riderLon = rider.preferredArea.longitude;
                    checkDropLocation = true; // Check distance to DROP location
                } else {
                    // Use current location from memory or DB
                    const locationFromMemory = this.riderLocations.get(riderId);
                    if (locationFromMemory) {
                        riderLat = locationFromMemory.latitude;
                        riderLon = locationFromMemory.longitude;
                    } else if (rider.currentLocation?.coordinates?.[1] && rider.currentLocation?.coordinates?.[0]) {
                        riderLat = rider.currentLocation.coordinates[1];
                        riderLon = rider.currentLocation.coordinates[0];
                    } else {
                        continue;
                    }
                }

                // Determine target location for distance check
                let targetLat, targetLon;
                
                if (checkDropLocation) {
                    // For preferred area: check distance to DROP location
                    const drop = booking.dropLocation?.[0];
                    if (!drop?.latitude || !drop?.longitude) {
                        continue;
                    }
                    targetLat = drop.latitude;
                    targetLon = drop.longitude;
                } else {
                    // For normal mode: check distance to PICKUP location
                    targetLat = pickupLat;
                    targetLon = pickupLon;
                }

                // Calculate distance
                const distance = this.getDistanceFromLatLonInKm(
                    riderLat,
                    riderLon,
                    targetLat,
                    targetLon
                );

                // Only notify if within range (same criteria as new booking)
                if (distance <= maxDistance) {
                    const ws = this.riderConnections.get(riderId);
                    
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        this.sendToClient(ws, tipMessage);
                        notifiedRiders++;
                        console.log(`[WS] 💰 Sent tip update to rider ${riderId} (${distance.toFixed(2)}km away)`);
                    }
                }
            }

            console.log(`[WS] 📊 Tip update sent to ${notifiedRiders} nearby riders`);
            
        } catch (error) {
            console.error('[WS] ❌ Error broadcasting tip update:', error);
        }
    }

    // Calculate distance between two coordinates (Haversine formula)
    getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
        const R = 6371; // Radius of earth in km
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // Normalize vehicle type to match booking schema
    normalizeVehicleType(type) {
        if (!type) return null;
        const typeStr = type.toString().toLowerCase();
        if (typeStr.includes('2w') || typeStr === '2wheeler' || typeStr === 'bike' || typeStr === 'motorcycle') return '2W';
        if (typeStr.includes('3w') || typeStr === '3wheeler' || typeStr === 'auto' || typeStr === 'rickshaw') return '3W';
        if (typeStr.includes('truck') || typeStr === '4w' || typeStr === 'pickup') return 'Truck';
        if (type === '2W' || type === '3W' || type === 'Truck') return type;
        return null;
    }

    // Broadcast new booking to nearby riders
    async broadcastNewBooking(booking) {
        try {
            console.log(`[WS] 📢 Broadcasting new booking ${booking._id} to nearby riders`);
            
            if (!booking.fromAddress?.latitude || !booking.fromAddress?.longitude) {
                console.log('[WS] ⚠️ Booking missing pickup location, skipping broadcast');
                return;
            }

            const pickupLat = booking.fromAddress.latitude;
            const pickupLon = booking.fromAddress.longitude;
            const requiredVehicleType = this.normalizeVehicleType(booking.vehicleType);

            console.log('[WS] 📍 Booking details:', {
                bookingId: booking._id,
                vehicleType: requiredVehicleType,
                pickup: { lat: pickupLat, lon: pickupLon }
            });

            let notifiedRiders = 0;
            const maxDistance = 5; // 5km radius
            const ridersForPushNotification = []; // Collect riders without active WS connection

            // Get all riders from DB to check preferred area settings
            const Rider = require('./models/RiderSchema');
            const allRiders = await Rider.find({ 
                isOnline: true 
            }).select('_id vehicleType preferredArea currentLocation');

            // Iterate through all online riders
            for (const rider of allRiders) {
                const riderId = rider._id.toString();
                const riderVehicleType = this.normalizeVehicleType(rider.vehicleType);
                
                // Check vehicle type match
                if (riderVehicleType !== requiredVehicleType) {
                    continue;
                }

                // Determine which location to use for distance calculation
                let riderLat, riderLon, usingPreferredArea = false;
                let checkDropLocation = false; // Flag to check drop instead of pickup
                
                if (rider.preferredArea?.enabled && 
                    rider.preferredArea?.latitude && 
                    rider.preferredArea?.longitude) {
                    // Use preferred area location
                    riderLat = rider.preferredArea.latitude;
                    riderLon = rider.preferredArea.longitude;
                    usingPreferredArea = true;
                    checkDropLocation = true; // Check distance to DROP location
                    console.log(`[WS] 🎯 Rider ${riderId} using preferred area: ${rider.preferredArea.name} - will check DROP location`);
                } else {
                    // Use current location from memory or DB
                    const locationFromMemory = this.riderLocations.get(riderId);
                    if (locationFromMemory) {
                        riderLat = locationFromMemory.latitude;
                        riderLon = locationFromMemory.longitude;
                    } else if (rider.currentLocation?.coordinates?.[1] && rider.currentLocation?.coordinates?.[0]) {
                        riderLat = rider.currentLocation.coordinates[1]; // MongoDB stores as [lon, lat]
                        riderLon = rider.currentLocation.coordinates[0];
                    } else {
                        console.log(`[WS] ⚠️ No location data for rider ${riderId}`);
                        continue;
                    }
                }

                // Determine target location for distance check
                let targetLat, targetLon;
                
                if (checkDropLocation) {
                    // For preferred area: check distance to DROP location
                    const drop = booking.dropLocation?.[0];
                    if (!drop?.latitude || !drop?.longitude) {
                        console.log(`[WS] ⚠️ Booking ${booking._id} has no drop location, skipping rider ${riderId}`);
                        continue;
                    }
                    targetLat = drop.latitude;
                    targetLon = drop.longitude;
                } else {
                    // For normal mode: check distance to PICKUP location
                    targetLat = pickupLat;
                    targetLon = pickupLon;
                }

                // Calculate distance from rider's location to target (pickup or drop)
                const distance = this.getDistanceFromLatLonInKm(
                    riderLat,
                    riderLon,
                    targetLat,
                    targetLon
                );

                console.log(`[WS] 🔍 Checking rider ${riderId}: ${distance.toFixed(2)}km to ${checkDropLocation ? 'DROP' : 'PICKUP'}, vehicle: ${riderVehicleType}${usingPreferredArea ? ' (preferred area)' : ''}`);

                // Only notify if within range
                if (distance <= maxDistance) {
                    const ws = this.riderConnections.get(riderId);
                    
                    // Calculate drop distance if available
                    let fromToDropKm = 0;
                    const drop = booking.dropLocation?.[0];
                    if (drop?.latitude && drop?.longitude) {
                        fromToDropKm = this.getDistanceFromLatLonInKm(
                            pickupLat,
                            pickupLon,
                            drop.latitude,
                            drop.longitude
                        );
                    }

                    const notificationData = {
                        type: 'new_booking',
                        booking: {
                            bookingId: booking._id,
                            from: booking.fromAddress,
                            to: drop || {},
                            driverToFromKm: distance.toFixed(2),
                            fromToDropKm: fromToDropKm > 0 ? fromToDropKm.toFixed(2) : '0',
                            price: booking.price || Number(booking.amountPay) || 0,
                            totalFare: booking.price || Number(booking.amountPay) || 0,
                            amountPay: booking.amountPay || booking.price?.toString() || '0',
                            baseFare: booking.baseFare || booking.price,
                            totalDriverEarnings: booking.totalDriverEarnings || 0,
                            platformFee: booking.feeBreakdown?.platformFee || 0,
                            gst: booking.feeBreakdown?.gstAmount || 0,
                            quickFee: booking.quickFee || 0,
                            status: booking.status || booking.bookingStatus,
                            vehicleType: booking.vehicleType,
                            payFrom: booking.payFrom || 'Pay on Delivery'
                        },
                        timestamp: Date.now()
                    };

                    console.log(`[WS] 📦 Sending notification data:`, {
                        bookingId: notificationData.booking.bookingId,
                        price: notificationData.booking.price,
                        totalFare: notificationData.booking.totalFare,
                        totalDriverEarnings: notificationData.booking.totalDriverEarnings,
                        platformFee: notificationData.booking.platformFee
                    });

                    if (ws && ws.readyState === WebSocket.OPEN) {
                        // Send via WebSocket (real-time)
                        this.sendToClient(ws, notificationData);
                        notifiedRiders++;
                        console.log(`[WS] ✅ Notified rider ${riderId} via WebSocket (${distance.toFixed(2)}km away)${usingPreferredArea ? ' - preferred area' : ''}`);
                    } else {
                        // Store for push notification (rider offline or app in background)
                        ridersForPushNotification.push({
                            riderId,
                            distance: distance.toFixed(2),
                            ...notificationData.booking
                        });
                        console.log(`[WS] 📲 Queued rider ${riderId} for push notification (${distance.toFixed(2)}km away)`);
                    }
                }
            }

            console.log(`[WS] 📊 Broadcast complete: ${notifiedRiders} rider(s) notified via WebSocket`);

            // Send push notifications to offline/background riders
            if (ridersForPushNotification.length > 0) {
                try {
                    console.log(`[Push] 📲 Sending push notifications to ${ridersForPushNotification.length} offline riders...`);
                    
                    // Fetch rider documents with push tokens
                    const riderIds = ridersForPushNotification.map(r => r.riderId);
                    const ridersWithTokens = await RiderSchema.find({
                        _id: { $in: riderIds },
                        expoPushToken: { $exists: true, $ne: null }
                    }).select('_id expoPushToken');

                    if (ridersWithTokens.length > 0) {
                        const pushData = ridersWithTokens.map(rider => {
                            const bookingData = ridersForPushNotification.find(r => r.riderId === rider._id.toString());
                            return {
                                expoPushToken: rider.expoPushToken,
                                ...bookingData
                            };
                        });

                        const pushResult = await sendNewBookingNotification(pushData, booking);
                        console.log(`[Push] ✅ Push notifications sent to ${pushResult.sent || 0} riders`);
                    } else {
                        console.log('[Push] ⚠️ No riders found with valid push tokens');
                    }
                } catch (pushError) {
                    console.error('[Push] ❌ Error sending push notifications:', pushError.message);
                }
            }

            console.log(`[WS] 🎯 Total notifications: ${notifiedRiders} WebSocket + ${ridersForPushNotification.length} Push`);
        } catch (error) {
            console.error('[WS] ❌ Error broadcasting new booking:', error);
        }
    }

    // Get online riders count by vehicle type
    getOnlineRidersByVehicleType(vehicleType) {
        const normalizedType = this.normalizeVehicleType(vehicleType);
        let count = 0;
        this.riderLocations.forEach((riderData) => {
            if (this.normalizeVehicleType(riderData.vehicleType) === normalizedType) {
                count++;
            }
        });
        return count;
    }

    // Get connection stats
    getConnectionStats() {
        return {
            totalRiders: this.riderConnections.size,
            totalCustomers: Array.from(this.customerConnections.values()).reduce((sum, set) => sum + set.size, 0),
            ridersWithLocation: this.riderLocations.size,
            timestamp: Date.now()
        };
    }
}

module.exports = WebSocketServer; 