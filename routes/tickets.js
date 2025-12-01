const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');

// Create a new ticket (with file upload)
router.post(
  '/tickets',
  ticketController.upload.array('attachments', 3),
  ticketController.createTicket
);

// Get all tickets with filters (Admin)
router.get('/tickets', ticketController.getAllTickets);

// Get ticket statistics (Dashboard) - Must be before :id route
router.get('/tickets/stats', ticketController.getTicketStats);

// Get user's own tickets
router.get('/tickets/my-tickets', ticketController.getMyTickets);

// Get ticket by ID
router.get('/tickets/:id', ticketController.getTicketById);

// Update ticket
router.put('/tickets/:id', ticketController.updateTicket);

// Add comment to ticket (with file upload)
router.post(
  '/tickets/:id/comments',
  ticketController.upload.array('attachments', 2),
  ticketController.addComment
);

// Close ticket with feedback
router.put('/tickets/:id/close', ticketController.closeTicket);

// Delete ticket (Admin only)
router.delete('/tickets/:id', ticketController.deleteTicket);

module.exports = router;
