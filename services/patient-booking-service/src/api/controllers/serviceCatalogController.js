/**
 * Service Catalog Controller
 * Handles HTTP requests for service catalog operations
 */

const serviceCatalogService = require('../../services/serviceCatalogService');
const { createLogger } = require('@nocturnal/shared');

const logger = createLogger({ serviceName: 'patient-booking-service' });

class ServiceCatalogController {
  /**
   * Get all services
   * GET /api/services
   */
  async getAllServices(req, res) {
    try {
      const { category, city, featured, popular } = req.query;

      const services = await serviceCatalogService.getAllServices({
        category,
        city,
        featured,
        popular
      });

      res.json({
        success: true,
        count: services.length,
        data: services
      });
    } catch (error) {
      logger.error('Error fetching services', { error: error.message });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get service by ID or slug
   * GET /api/services/:identifier
   */
  async getService(req, res) {
    try {
      const service = await serviceCatalogService.getServiceByIdOrSlug(
        req.params.identifier
      );

      res.json({
        success: true,
        data: service
      });
    } catch (error) {
      logger.error('Error fetching service', {
        identifier: req.params.identifier,
        error: error.message
      });

      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get services by category
   * GET /api/services/category/:category
   */
  async getServicesByCategory(req, res) {
    try {
      const services = await serviceCatalogService.getServicesByCategory(
        req.params.category.toUpperCase()
      );

      res.json({
        success: true,
        count: services.length,
        data: services
      });
    } catch (error) {
      logger.error('Error fetching services by category', {
        category: req.params.category,
        error: error.message
      });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get featured services
   * GET /api/services/featured
   */
  async getFeaturedServices(req, res) {
    try {
      const services = await serviceCatalogService.getFeaturedServices();

      res.json({
        success: true,
        count: services.length,
        data: services
      });
    } catch (error) {
      logger.error('Error fetching featured services', { error: error.message });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get popular services
   * GET /api/services/popular
   */
  async getPopularServices(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;

      const services = await serviceCatalogService.getPopularServices(limit);

      res.json({
        success: true,
        count: services.length,
        data: services
      });
    } catch (error) {
      logger.error('Error fetching popular services', { error: error.message });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Search services
   * GET /api/services/search
   */
  async searchServices(req, res) {
    try {
      const { q } = req.query;

      if (!q) {
        return res.status(400).json({
          success: false,
          message: 'Search query parameter "q" is required'
        });
      }

      const services = await serviceCatalogService.searchServices(q);

      res.json({
        success: true,
        count: services.length,
        data: services
      });
    } catch (error) {
      logger.error('Error searching services', { error: error.message });

      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get service pricing
   * GET /api/services/:id/pricing
   */
  async getServicePricing(req, res) {
    try {
      const pricing = await serviceCatalogService.getServicePricing(
        req.params.id
      );

      res.json({
        success: true,
        data: pricing
      });
    } catch (error) {
      logger.error('Error fetching service pricing', {
        serviceId: req.params.id,
        error: error.message
      });

      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new ServiceCatalogController();
