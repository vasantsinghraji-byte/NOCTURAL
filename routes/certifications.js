const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const Certification = require('../models/certification');
const { paginate, paginationMiddleware, sendPaginatedResponse } = require('../utils/pagination');
const pickAllowedFields = require('../utils/pickAllowedFields');
const { normalizeObjectId } = require('../utils/safeMongo');

const CERTIFICATION_WRITE_FIELDS = [
    'name',
    'type',
    'issuingAuthority',
    'licenseNumber',
    'issueDate',
    'expiryDate',
    'documentUrl',
    'renewalUrl',
    'notes'
];
const CERTIFICATION_VERIFICATION_STATUSES = ['VERIFIED', 'REJECTED'];

// Apply pagination middleware
router.use(paginationMiddleware);

// @route   GET /api/certifications
// @desc    Get user's certifications with pagination
// @access  Private
router.get('/', protect, async (req, res) => {
    try {
        const result = await paginate(
            Certification,
            { user: req.user._id },
            {
                ...req.pagination,
                sort: req.pagination.sort || { expiryDate: 1 }
            }
        );

        sendPaginatedResponse(res, result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching certifications',
            error: error.message
        });
    }
});

// @route   GET /api/certifications/expiring
// @desc    Get expiring certifications
// @access  Private
router.get('/expiring', protect, async (req, res) => {
    try {
        const { daysAhead = 30 } = req.query;

        const expiring = await Certification.getExpiringCertifications(parseInt(daysAhead));
        const userCerts = expiring.filter(cert => cert.user._id.toString() === req.user._id.toString());

        res.json({
            success: true,
            data: userCerts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching expiring certifications',
            error: error.message
        });
    }
});

// @route   POST /api/certifications
// @desc    Add certification
// @access  Private
router.post('/', protect, async (req, res) => {
    try {
        const certificationData = {
            ...pickAllowedFields(req.body, CERTIFICATION_WRITE_FIELDS),
            user: req.user._id
        };

        const certification = new Certification(certificationData);
        await certification.save();

        res.status(201).json({
            success: true,
            data: certification,
            message: 'Certification added successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error adding certification',
            error: error.message
        });
    }
});

// @route   PUT /api/certifications/:id
// @desc    Update certification
// @access  Private
router.put('/:id', protect, async (req, res) => {
    try {
        const certificationId = normalizeObjectId(req.params.id, 'certification id');
        const certification = await Certification.findOne({
            _id: certificationId,
            user: req.user._id
        });

        if (!certification) {
            return res.status(404).json({
                success: false,
                message: 'Certification not found'
            });
        }

        const updates = pickAllowedFields(req.body, CERTIFICATION_WRITE_FIELDS);
        if (Object.keys(updates).length > 0) {
            certification.set(updates);

            // Any provider-controlled content change invalidates the prior
            // verification decision until a platform admin reviews it again.
            certification.verificationStatus = 'PENDING';
            certification.verifiedBy = undefined;
            certification.verifiedAt = undefined;
        }
        await certification.save();

        res.json({
            success: true,
            data: certification,
            message: 'Certification updated successfully'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error updating certification',
            error: error.message
        });
    }
});

// @route   DELETE /api/certifications/:id
// @desc    Delete certification
// @access  Private
router.delete('/:id', protect, async (req, res) => {
    try {
        const certificationId = normalizeObjectId(req.params.id, 'certification id');
        const certification = await Certification.findOneAndDelete({
            _id: certificationId,
            user: req.user._id
        });

        if (!certification) {
            return res.status(404).json({
                success: false,
                message: 'Certification not found'
            });
        }

        res.json({
            success: true,
            message: 'Certification deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting certification',
            error: error.message
        });
    }
});

// @route   POST /api/certifications/:id/verify
// @desc    Verify certification (Platform admin only)
// @access  Private
// Certifications belong to providers (not a hospital), so verification is a
// cross-tenant, platform-level trust action - restricted to platform_admin to
// prevent one hospital admin from verifying arbitrary providers' credentials.
router.post('/:id/verify', protect, authorize(ROLES.PLATFORM_ADMIN), async (req, res) => {
    try {
        const certificationId = normalizeObjectId(req.params.id, 'certification id');
        const { verificationStatus } = req.body;
        if (!CERTIFICATION_VERIFICATION_STATUSES.includes(verificationStatus)) {
            return res.status(400).json({
                success: false,
                message: 'verificationStatus must be VERIFIED or REJECTED'
            });
        }

        const certification = await Certification.findById(certificationId);
        if (!certification) {
            return res.status(404).json({
                success: false,
                message: 'Certification not found'
            });
        }

        certification.verificationStatus = verificationStatus;
        certification.verifiedBy = req.user._id;
        certification.verifiedAt = new Date();

        await certification.save();

        res.json({
            success: true,
            data: certification,
            message: `Certification ${verificationStatus.toLowerCase()} successfully`
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: 'Error verifying certification',
            error: error.message
        });
    }
});

module.exports = router;
