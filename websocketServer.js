const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const RiderSchema = require('./models/RiderSchema');
const Booking = require('./models/Booking');

class WebSocketServer {
    constructor(server) {
        this.wss = new WebSocket.Server({ server });
        this.clients = new Map(); // Map to store connected clients
        this.riderConnections = new Map(); // Map to store rider connections
        this.customerConnections = new Map(); // Map<riderId, Set<ws>>
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
            const role = url.searchParams.get('role'); // 'rider' or 'customer'

            // Debug log for riderId
            ('[WS] Parsed riderId:', riderId);

            // Defensive: ensure only the id part is used (strip any accidental query string)
            if (riderId && riderId.includes('?')) {
                riderId = riderId.split('?')[0];
                ('[WS] Cleaned riderId:', riderId);
            }

            // Log every connection attempt with remote address
            (`[WS] New connection from ${req.socket.remoteAddress} - Role: ${role}, RiderId: ${riderId}`);

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
            // Update rider's location in database
            await RiderSchema.findByIdAndUpdate(riderId, {
                currentLocation: {
                    type: 'Point',
                    coordinates: [locationData.longitude, locationData.latitude]
                },
                lastLocationUpdate: new Date(),
                isOnline: true
            });

            (`[WS] Location update from rider ${riderId}:`, locationData);

            // Broadcast location to relevant clients (admin, customers, etc.)
            this.broadcastLocationUpdate(riderId, locationData);

            // Check for nearby orders
            await this.checkNearbyOrders?.(riderId, locationData);

            (`[WS] Location update for rider ${riderId}: ${locationData.latitude}, ${locationData.longitude}`);
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

    broadcastLocationUpdate(riderId, locationData) {
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
            (`[WS] Broadcasting to ${customers.size} customers for rider ${riderId}:`, message);
            customers.forEach(ws => {
                this.sendToClient(ws, message);
            });
        } else {
            (`[WS] No customers to broadcast for rider ${riderId}`);
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

        // Update rider status in database
        RiderSchema.findByIdAndUpdate(riderId, {
            isOnline: false,
            lastSeen: new Date()
        }).catch(error => {
            console.error('Failed to update rider status on disconnect:', error);
        });

        (`Rider ${riderId} disconnected`);
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
}

module.exports = WebSocketServer; 