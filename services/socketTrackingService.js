/**
 * Socket Tracking & Real-Time Events Service
 *
 * Real-time staff location streaming, consultation chat rooms,
 * and emergency SOS dispatch notifications.
 */

const User = require('../models/user');
const Consultation = require('../models/consultation');
const logger = require('../utils/logger');

class SocketTrackingService {
  constructor() {
    this.io = null;
  }

  /**
   * Initialize Socket.IO event handlers
   * @param {Object} io Socket.IO Server instance
   */
  initialize(io) {
    this.io = io;

    io.on('connection', (socket) => {
      logger.info(`Socket client connected: ${socket.id}`);

      // Authenticated user joins their personal notification room
      socket.on('join:user', (userId) => {
        if (userId) {
          socket.join(`user:${userId}`);
        }
      });

      // Join active booking room for live staff tracking
      socket.on('join:booking', (bookingId) => {
        if (bookingId) {
          socket.join(`booking:${bookingId}`);
        }
      });

      // Leave active booking room
      socket.on('leave:booking', (bookingId) => {
        if (bookingId) {
          socket.leave(`booking:${bookingId}`);
        }
      });

      // Medical staff sends continuous GPS breadcrumbs
      socket.on('staff:location_update', async (data) => {
        try {
          const { staffId, bookingId, coordinates, heading, speed } = data;
          if (!coordinates || coordinates.length !== 2) return;

          // Broadcast to patient tracking screen
          if (bookingId) {
            socket.to(`booking:${bookingId}`).emit('booking:location_update', {
              bookingId,
              coordinates,
              heading: heading || 0,
              speed: speed || 0,
              timestamp: new Date()
            });
          }

          // Update staff record asynchronously
          if (staffId) {
            await User.findByIdAndUpdate(staffId, {
              currentLocation: {
                type: 'Point',
                coordinates,
                updatedAt: new Date()
              }
            });
          }
        } catch (error) {
          logger.error('Error handling staff location update via socket:', error);
        }
      });

      // Join consultation room for telemedicine chat
      socket.on('join:consultation', (consultationId) => {
        if (consultationId) {
          socket.join(`consultation:${consultationId}`);
        }
      });

      // Consultation real-time messaging
      socket.on('consultation:message', async (data) => {
        try {
          const { consultationId, senderId, senderType, message, attachmentUrl } = data;
          if (!consultationId || !message) return;

          const chatMessage = {
            sender: senderType,
            senderId,
            message,
            attachmentUrl,
            timestamp: new Date()
          };

          // Save message to consultation document
          await Consultation.findByIdAndUpdate(consultationId, {
            $push: { chatMessages: chatMessage }
          });

          // Broadcast to other participant in room
          io.to(`consultation:${consultationId}`).emit('consultation:new_message', {
            consultationId,
            message: chatMessage
          });
        } catch (error) {
          logger.error('Error sending consultation socket message:', error);
        }
      });

      socket.on('disconnect', () => {
        logger.info(`Socket client disconnected: ${socket.id}`);
      });
    });

    return this;
  }

  /**
   * Emit emergency dispatch alert to assigned staff member
   * @param {string} staffId Staff User ID
   * @param {Object} emergency Emergency booking details
   */
  notifyEmergencyDispatch(staffId, emergency) {
    if (this.io && staffId) {
      this.io.to(`user:${staffId}`).emit('emergency:new_dispatch', emergency);
    }
  }

  /**
   * Emit sample status update to patient
   * @param {string} patientId Patient ID
   * @param {Object} payload Lab test booking status
   */
  notifySampleStatus(patientId, payload) {
    if (this.io && patientId) {
      this.io.to(`user:${patientId}`).emit('lab:sample_status_updated', payload);
    }
  }
}

module.exports = new SocketTrackingService();
