/**
 * Database Connection for Patient Booking Service
 * Handles MongoDB connection with retry logic
 */

const mongoose = require('mongoose');
const config = require('./index');

class Database {
  constructor() {
    this.connection = null;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
  }

  async connect(logger) {
    try {
      // Set mongoose configuration
      mongoose.set('strictQuery', false);

      // Connection options
      const options = {
        ...config.database.options,
        autoIndex: config.service.env !== 'production' // Disable in production for performance
      };

      // Connect to MongoDB
      this.connection = await mongoose.connect(config.database.uri, options);

      logger.info('Patient Booking Service - MongoDB Connected', {
        host: this.connection.connection.host,
        database: this.connection.connection.name,
        port: this.connection.connection.port
      });

      // Connection event handlers
      mongoose.connection.on('connected', () => {
        logger.info('Mongoose connected to MongoDB');
        this.retryCount = 0; // Reset retry count on successful connection
      });

      mongoose.connection.on('error', (err) => {
        logger.error('Mongoose connection error', { error: err.message });
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('Mongoose disconnected from MongoDB');

        // Attempt to reconnect
        if (this.retryCount < this.maxRetries) {
          this.retryCount++;
          logger.info(`Attempting to reconnect (${this.retryCount}/${this.maxRetries})...`);
          setTimeout(() => this.connect(logger), this.retryDelay);
        } else {
          logger.error('Max reconnection attempts reached. Manual intervention required.');
        }
      });

      // Handle process termination
      process.on('SIGINT', async () => {
        await this.disconnect(logger);
        process.exit(0);
      });

      return this.connection;
    } catch (error) {
      logger.error('MongoDB connection failed', {
        error: error.message,
        retryCount: this.retryCount,
        maxRetries: this.maxRetries
      });

      // Retry connection
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        logger.info(`Retrying connection in ${this.retryDelay / 1000} seconds... (${this.retryCount}/${this.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.connect(logger);
      } else {
        throw new Error('Failed to connect to MongoDB after maximum retries');
      }
    }
  }

  async disconnect(logger) {
    try {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed gracefully');
    } catch (error) {
      logger.error('Error closing MongoDB connection', { error: error.message });
    }
  }

  getConnection() {
    return this.connection;
  }

  isConnected() {
    return mongoose.connection.readyState === 1;
  }
}

module.exports = new Database();
