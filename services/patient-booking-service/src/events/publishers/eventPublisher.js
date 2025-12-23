/**
 * Event Publisher
 * Publishes events to RabbitMQ for event-driven communication
 */

const amqp = require('amqplib');
const config = require('../../config');
const { createLogger } = require('@nocturnal/shared');

const logger = createLogger({ serviceName: 'patient-booking-service' });

class EventPublisher {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.connecting = false;
  }

  /**
   * Connect to RabbitMQ
   */
  async connect() {
    if (this.connection && this.channel) {
      return;
    }

    if (this.connecting) {
      // Wait for ongoing connection to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.connect();
    }

    try {
      this.connecting = true;

      logger.info('Connecting to RabbitMQ...', { url: config.rabbitmq.url });

      this.connection = await amqp.connect(config.rabbitmq.url);
      this.channel = await this.connection.createChannel();

      // Declare exchanges
      await this.channel.assertExchange(config.rabbitmq.exchanges.booking, 'topic', {
        durable: true
      });
      await this.channel.assertExchange(config.rabbitmq.exchanges.patient, 'topic', {
        durable: true
      });
      await this.channel.assertExchange(config.rabbitmq.exchanges.notification, 'topic', {
        durable: true
      });

      logger.info('Connected to RabbitMQ successfully');

      // Handle connection close
      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed. Reconnecting...');
        this.connection = null;
        this.channel = null;
        setTimeout(() => this.connect(), 5000);
      });

      // Handle connection error
      this.connection.on('error', (error) => {
        logger.error('RabbitMQ connection error', { error: error.message });
      });

      this.connecting = false;
    } catch (error) {
      this.connecting = false;
      logger.error('Failed to connect to RabbitMQ', { error: error.message });
      throw error;
    }
  }

  /**
   * Publish event to exchange
   */
  async publish(exchange, routingKey, data) {
    try {
      if (!this.channel) {
        await this.connect();
      }

      const message = {
        ...data,
        timestamp: new Date().toISOString(),
        service: 'patient-booking-service'
      };

      const content = Buffer.from(JSON.stringify(message));

      this.channel.publish(exchange, routingKey, content, {
        persistent: true,
        contentType: 'application/json'
      });

      logger.info('Event published', { exchange, routingKey });
    } catch (error) {
      logger.error('Failed to publish event', {
        exchange,
        routingKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Publish booking created event
   */
  async publishBookingCreated(booking) {
    await this.publish(
      config.rabbitmq.exchanges.booking,
      'booking.created',
      {
        event: 'booking.created',
        data: {
          bookingId: booking._id,
          patientId: booking.patient,
          serviceType: booking.serviceType,
          scheduledDate: booking.scheduledDate,
          scheduledTime: booking.scheduledTime,
          amount: booking.pricing.payableAmount,
          status: booking.status
        }
      }
    );
  }

  /**
   * Publish booking cancelled event
   */
  async publishBookingCancelled(booking) {
    await this.publish(
      config.rabbitmq.exchanges.booking,
      'booking.cancelled',
      {
        event: 'booking.cancelled',
        data: {
          bookingId: booking._id,
          patientId: booking.patient,
          cancelledBy: booking.cancellation.cancelledBy,
          reason: booking.cancellation.reason,
          refundAmount: booking.cancellation.refundAmount
        }
      }
    );
  }

  /**
   * Publish booking completed event
   */
  async publishBookingCompleted(booking) {
    await this.publish(
      config.rabbitmq.exchanges.booking,
      'booking.completed',
      {
        event: 'booking.completed',
        data: {
          bookingId: booking._id,
          patientId: booking.patient,
          serviceProviderId: booking.serviceProvider,
          serviceType: booking.serviceType,
          completedAt: booking.statusTimestamps.completedAt
        }
      }
    );
  }

  /**
   * Publish patient registered event
   */
  async publishPatientRegistered(patient) {
    await this.publish(
      config.rabbitmq.exchanges.patient,
      'patient.registered',
      {
        event: 'patient.registered',
        data: {
          patientId: patient._id,
          name: patient.name,
          email: patient.email,
          phone: patient.phone,
          referralCode: patient.referralCode
        }
      }
    );
  }

  /**
   * Close connection
   */
  async close() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      logger.info('RabbitMQ connection closed');
    } catch (error) {
      logger.error('Error closing RabbitMQ connection', { error: error.message });
    }
  }
}

module.exports = new EventPublisher();
