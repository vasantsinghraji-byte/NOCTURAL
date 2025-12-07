/**
 * HashiCorp Vault Integration
 * Secure secrets management using Vault
 *
 * Setup Instructions:
 * 1. Install Vault: https://www.vaultproject.io/downloads
 * 2. Start Vault dev server: vault server -dev
 * 3. Export Vault address: export VAULT_ADDR='http://127.0.0.1:8200'
 * 4. Initialize secrets: node scripts/init-vault.js
 */

const logger = require('../utils/logger');

class VaultManager {
  constructor() {
    this.enabled = process.env.VAULT_ENABLED === 'true';
    this.vaultAddr = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
    this.vaultToken = process.env.VAULT_TOKEN;
    this.namespace = process.env.VAULT_NAMESPACE || 'nocturnal';
    this.client = null;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Initialize Vault client
   */
  async initialize() {
    if (!this.enabled) {
      logger.info('Vault is disabled, using environment variables');
      return;
    }

    try {
      // Lazy load vault module (install with: npm install node-vault)
      const vault = require('node-vault');

      this.client = vault({
        apiVersion: 'v1',
        endpoint: this.vaultAddr,
        token: this.vaultToken
      });

      // Test connection
      await this.client.health();
      logger.info('Vault connected successfully', {
        address: this.vaultAddr,
        namespace: this.namespace
      });

      return true;
    } catch (error) {
      logger.error('Vault initialization failed', {
        error: error.message,
        address: this.vaultAddr
      });

      if (process.env.NODE_ENV === 'production') {
        throw new Error('Vault is required in production');
      }

      logger.warn('Falling back to environment variables');
      this.enabled = false;
      return false;
    }
  }

  /**
   * Get secret from Vault or cache
   */
  async getSecret(path, key) {
    // Check cache first
    const cacheKey = `${path}:${key}`;
    const cached = this.cache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.value;
    }

    if (!this.enabled || !this.client) {
      // Fallback to environment variable
      return process.env[key];
    }

    try {
      const fullPath = `${this.namespace}/${path}`;
      const response = await this.client.read(fullPath);

      if (response && response.data && response.data.data) {
        const value = response.data.data[key];

        // Cache the secret
        this.cache.set(cacheKey, {
          value,
          timestamp: Date.now()
        });

        return value;
      }

      logger.warn(`Secret not found in Vault: ${fullPath}/${key}`);
      return process.env[key]; // Fallback
    } catch (error) {
      logger.error('Error reading secret from Vault', {
        path,
        key,
        error: error.message
      });

      return process.env[key]; // Fallback
    }
  }

  /**
   * Write secret to Vault
   */
  async setSecret(path, key, value) {
    if (!this.enabled || !this.client) {
      logger.warn('Cannot write to Vault (disabled or not initialized)');
      return false;
    }

    try {
      const fullPath = `${this.namespace}/${path}`;

      // Read existing secrets
      let existingData = {};
      try {
        const existing = await this.client.read(fullPath);
        existingData = existing.data.data || {};
      } catch (error) {
        // Path doesn't exist yet, that's okay
      }

      // Merge with new secret
      const data = {
        ...existingData,
        [key]: value
      };

      await this.client.write(fullPath, { data });

      // Invalidate cache
      this.cache.delete(`${path}:${key}`);

      logger.info('Secret written to Vault', { path, key });
      return true;
    } catch (error) {
      logger.error('Error writing secret to Vault', {
        path,
        key,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Delete secret from Vault
   */
  async deleteSecret(path, key) {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      const fullPath = `${this.namespace}/${path}`;

      // Read existing secrets
      const existing = await this.client.read(fullPath);
      const data = existing.data.data || {};

      // Remove the key
      delete data[key];

      // Write back
      await this.client.write(fullPath, { data });

      // Invalidate cache
      this.cache.delete(`${path}:${key}`);

      logger.info('Secret deleted from Vault', { path, key });
      return true;
    } catch (error) {
      logger.error('Error deleting secret from Vault', {
        path,
        key,
        error: error.message
      });
      return false;
    }
  }

  /**
   * List all secrets at path
   */
  async listSecrets(path) {
    if (!this.enabled || !this.client) {
      return [];
    }

    try {
      const fullPath = `${this.namespace}/${path}`;
      const response = await this.client.list(fullPath);

      return response.data.keys || [];
    } catch (error) {
      logger.error('Error listing secrets from Vault', {
        path,
        error: error.message
      });
      return [];
    }
  }

  /**
   * Rotate secret with grace period
   */
  async rotateSecret(path, key, newValue, gracePeriodDays = 7) {
    if (!this.enabled || !this.client) {
      return false;
    }

    try {
      const oldKey = `${key}_old`;
      const expiryKey = `${key}_old_expiry`;

      // Get current value
      const currentValue = await this.getSecret(path, key);

      // Set new value
      await this.setSecret(path, key, newValue);

      // Store old value with expiry
      if (currentValue) {
        await this.setSecret(path, oldKey, currentValue);

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + gracePeriodDays);

        await this.setSecret(path, expiryKey, expiryDate.toISOString());
      }

      logger.info('Secret rotated in Vault', {
        path,
        key,
        gracePeriodDays
      });

      return true;
    } catch (error) {
      logger.error('Error rotating secret in Vault', {
        path,
        key,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Clean up expired old secrets
   */
  async cleanupExpiredSecrets() {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      const paths = await this.listSecrets('');

      for (const path of paths) {
        const secrets = await this.client.read(`${this.namespace}/${path}`);
        const data = secrets.data.data || {};

        for (const [key, value] of Object.entries(data)) {
          if (key.endsWith('_old_expiry')) {
            const expiryDate = new Date(value);
            if (expiryDate < new Date()) {
              // Expired, remove old secret
              const secretKey = key.replace('_old_expiry', '');
              await this.deleteSecret(path, `${secretKey}_old`);
              await this.deleteSecret(path, key);

              logger.info('Cleaned up expired secret', { path, key: secretKey });
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error cleaning up expired secrets', {
        error: error.message
      });
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.info('Vault cache cleared');
  }
}

// Singleton instance
const vaultManager = new VaultManager();

// Helper functions for common secrets
const secrets = {
  async getJWTSecret() {
    return await vaultManager.getSecret('auth', 'JWT_SECRET');
  },

  async getEncryptionKey() {
    return await vaultManager.getSecret('encryption', 'ENCRYPTION_KEY');
  },

  async getDatabasePassword() {
    return await vaultManager.getSecret('database', 'MONGODB_PASSWORD');
  },

  async getFirebaseCredentials() {
    return {
      apiKey: await vaultManager.getSecret('firebase', 'API_KEY'),
      authDomain: await vaultManager.getSecret('firebase', 'AUTH_DOMAIN'),
      projectId: await vaultManager.getSecret('firebase', 'PROJECT_ID')
    };
  },

  async getRazorpayCredentials() {
    return {
      keyId: await vaultManager.getSecret('razorpay', 'KEY_ID'),
      keySecret: await vaultManager.getSecret('razorpay', 'KEY_SECRET')
    };
  },

  async getAWSCredentials() {
    return {
      accessKeyId: await vaultManager.getSecret('aws', 'ACCESS_KEY_ID'),
      secretAccessKey: await vaultManager.getSecret('aws', 'SECRET_ACCESS_KEY'),
      region: await vaultManager.getSecret('aws', 'REGION')
    };
  }
};

module.exports = {
  vaultManager,
  secrets
};
