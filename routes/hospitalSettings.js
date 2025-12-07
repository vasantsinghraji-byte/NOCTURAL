const express = require('express');
const router = express.Router();
const HospitalSettings = require('../models/hospitalSettings');
const { protect } = require('../middleware/auth');

// Get hospital settings
router.get('/', protect, async (req, res) => {
    try {
        const settings = await HospitalSettings.getOrCreateSettings(req.user._id);
        res.json({ success: true, data: settings });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch settings' });
    }
});

// Update hospital settings
router.put('/', protect, async (req, res) => {
    try {
        const settings = await HospitalSettings.getOrCreateSettings(req.user._id);

        // Update allowed fields
        if (req.body.budget) {
            settings.budget = { ...settings.budget, ...req.body.budget };
        }

        if (req.body.forecasting) {
            settings.forecasting = { ...settings.forecasting, ...req.body.forecasting };
        }

        if (req.body.autoAccept) {
            settings.autoAccept = { ...settings.autoAccept, ...req.body.autoAccept };
        }

        if (req.body.notifications) {
            settings.notifications = { ...settings.notifications, ...req.body.notifications };
        }

        if (req.body.analytics) {
            settings.analytics = { ...settings.analytics, ...req.body.analytics };
        }

        await settings.save();

        res.json({
            success: true,
            message: 'Settings updated successfully',
            data: settings
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ success: false, message: 'Failed to update settings' });
    }
});

// Add preferred doctor
router.post('/preferred-doctors', protect, async (req, res) => {
    try {
        const { doctorId, priority } = req.body;

        const settings = await HospitalSettings.getOrCreateSettings(req.user._id);

        // Check if doctor already in list
        const exists = settings.preferredDoctors.find(
            pd => pd.doctor.toString() === doctorId
        );

        if (exists) {
            return res.status(400).json({
                success: false,
                message: 'Doctor already in preferred list'
            });
        }

        settings.preferredDoctors.push({
            doctor: doctorId,
            priority: priority || 'MEDIUM'
        });

        await settings.save();

        res.json({
            success: true,
            message: 'Doctor added to preferred list',
            data: settings
        });
    } catch (error) {
        console.error('Error adding preferred doctor:', error);
        res.status(500).json({ success: false, message: 'Failed to add preferred doctor' });
    }
});

// Remove preferred doctor
router.delete('/preferred-doctors/:doctorId', protect, async (req, res) => {
    try {
        const settings = await HospitalSettings.getOrCreateSettings(req.user._id);

        settings.preferredDoctors = settings.preferredDoctors.filter(
            pd => pd.doctor.toString() !== req.params.doctorId
        );

        await settings.save();

        res.json({
            success: true,
            message: 'Doctor removed from preferred list',
            data: settings
        });
    } catch (error) {
        console.error('Error removing preferred doctor:', error);
        res.status(500).json({ success: false, message: 'Failed to remove preferred doctor' });
    }
});

module.exports = router;
