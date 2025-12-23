/**
 * Service Catalog Service
 * Business logic for service catalog operations
 */

const { ServiceCatalog } = require('../models');
const { createLogger } = require('@nocturnal/shared');

const logger = createLogger({ serviceName: 'patient-booking-service' });

class ServiceCatalogService {
  /**
   * Get all active services
   */
  async getAllServices(options = {}) {
    const { category, city, featured, popular } = options;

    const query = { 'availability.isActive': true };

    if (category) {
      query.category = category;
    }

    if (city) {
      query['availability.availableCities'] = city;
    }

    if (featured === 'true') {
      query.isFeatured = true;
    }

    if (popular === 'true') {
      query.isPopular = true;
    }

    const services = await ServiceCatalog.find(query)
      .sort({ sortOrder: 1, 'stats.totalBookings': -1 })
      .select('-__v');

    return services;
  }

  /**
   * Get service by ID or slug
   */
  async getServiceByIdOrSlug(identifier) {
    const service = await ServiceCatalog.findOne({
      $or: [
        { _id: identifier },
        { slug: identifier }
      ],
      'availability.isActive': true
    });

    if (!service) {
      throw new Error('Service not found');
    }

    return service;
  }

  /**
   * Get services by category
   */
  async getServicesByCategory(category) {
    const validCategories = ['NURSING', 'PHYSIOTHERAPY', 'PACKAGE'];

    if (!validCategories.includes(category)) {
      throw new Error('Invalid category');
    }

    const services = await ServiceCatalog.find({
      category,
      'availability.isActive': true
    })
      .sort({ sortOrder: 1, 'stats.totalBookings': -1 })
      .select('-__v');

    return services;
  }

  /**
   * Get featured services
   */
  async getFeaturedServices() {
    const services = await ServiceCatalog.find({
      isFeatured: true,
      'availability.isActive': true
    })
      .sort({ sortOrder: 1 })
      .limit(6)
      .select('-__v');

    return services;
  }

  /**
   * Get popular services
   */
  async getPopularServices(limit = 10) {
    const services = await ServiceCatalog.find({
      'availability.isActive': true
    })
      .sort({ 'stats.totalBookings': -1, 'stats.avgRating': -1 })
      .limit(limit)
      .select('-__v');

    return services;
  }

  /**
   * Search services
   */
  async searchServices(searchTerm) {
    if (!searchTerm) {
      throw new Error('Search term is required');
    }

    const services = await ServiceCatalog.find({
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { displayName: { $regex: searchTerm, $options: 'i' } },
        { shortDescription: { $regex: searchTerm, $options: 'i' } },
        { 'seo.keywords': { $in: [new RegExp(searchTerm, 'i')] } }
      ],
      'availability.isActive': true
    })
      .sort({ 'stats.totalBookings': -1 })
      .select('-__v');

    return services;
  }

  /**
   * Get service pricing
   */
  async getServicePricing(serviceId) {
    const service = await ServiceCatalog.findById(serviceId);

    if (!service) {
      throw new Error('Service not found');
    }

    const now = new Date();
    const currentTime = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

    let basePrice = service.pricing.basePrice;
    let surgeApplied = false;

    // Check if surge pricing is enabled
    if (service.pricing.surgePricing?.enabled) {
      const surgeHours = service.pricing.surgePricing.surgeHours || [];

      for (const timeSlot of surgeHours) {
        if (currentTime >= timeSlot.start && currentTime <= timeSlot.end) {
          basePrice = basePrice * service.pricing.surgePricing.surgeMultiplier;
          surgeApplied = true;
          break;
        }
      }
    }

    // Calculate total pricing
    const platformFee = basePrice * 0.15; // 15%
    const gst = (basePrice + platformFee) * 0.18; // 18%
    const totalAmount = basePrice + platformFee + gst;

    return {
      basePrice,
      platformFee,
      gst,
      totalAmount,
      currency: service.pricing.currency,
      surgeApplied,
      packageDetails: service.pricing.packageDetails
    };
  }
}

module.exports = new ServiceCatalogService();
