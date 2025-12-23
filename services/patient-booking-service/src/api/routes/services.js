/**
 * Service Catalog Routes
 * Endpoints for browsing available services
 */

const express = require('express');
const router = express.Router();
const serviceCatalogController = require('../controllers/serviceCatalogController');

/**
 * All service catalog routes are public (no authentication required)
 */

// Search services
router.get('/search', serviceCatalogController.searchServices.bind(serviceCatalogController));

// Get featured services
router.get('/featured', serviceCatalogController.getFeaturedServices.bind(serviceCatalogController));

// Get popular services
router.get('/popular', serviceCatalogController.getPopularServices.bind(serviceCatalogController));

// Get services by category
router.get('/category/:category', serviceCatalogController.getServicesByCategory.bind(serviceCatalogController));

// Get all services (with optional filters)
router.get('/', serviceCatalogController.getAllServices.bind(serviceCatalogController));

// Get service pricing
router.get('/:id/pricing', serviceCatalogController.getServicePricing.bind(serviceCatalogController));

// Get specific service by ID or slug
router.get('/:identifier', serviceCatalogController.getService.bind(serviceCatalogController));

module.exports = router;
