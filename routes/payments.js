const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  paymentValidation,
  validateMongoId,
  validate,
  sanitizeInput
} = require('../middleware/validation');
const Payment = require('../models/payment');
const Duty = require('../models/duty');
const User = require('../models/user');

// Apply input sanitization to all routes
router.use(sanitizeInput);

// Get doctor's earnings summary
router.get('/earnings', protect, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { startDate, endDate } = req.query;

    const earnings = await Payment.getDoctorEarnings(req.user._id, { startDate, endDate });

    res.json({
      success: true,
      data: earnings
    });
  } catch (error) {
    console.error('Error fetching earnings:', error);
    res.status(500).json({ success: false, message: 'Error fetching earnings', error: error.message });
  }
});

// Get monthly earnings breakdown
router.get('/earnings/monthly/:year', protect, async (req, res) => {
  try {
    if (req.user.role !== 'doctor') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { year } = req.params;
    const monthlyEarnings = await Payment.getMonthlyEarnings(req.user._id, parseInt(year));

    res.json({
      success: true,
      data: monthlyEarnings
    });
  } catch (error) {
    console.error('Error fetching monthly earnings:', error);
    res.status(500).json({ success: false, message: 'Error fetching monthly earnings', error: error.message });
  }
});

// Get payment history
router.get('/history', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (page - 1) * limit;

    const query = req.user.role === 'doctor'
      ? { doctor: req.user._id }
      : { hospital: req.user._id };

    if (status) {
      query.status = status;
    }

    const payments = await Payment.find(query)
      .sort({ shiftDate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('duty', 'title hospital date specialty')
      .populate('doctor', 'name email phone')
      .populate('hospital', 'name hospitalName')
      .lean();

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ success: false, message: 'Error fetching payment history', error: error.message });
  }
});

// Get single payment details
router.get('/:id', protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('duty')
      .populate('doctor', 'name email phone professional.mciNumber')
      .populate('hospital', 'name hospitalName');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // Authorization check
    if (req.user.role === 'doctor' && payment.doctor._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if ((req.user.role === 'admin' || req.user.role === 'nurse') && payment.hospital._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({ success: false, message: 'Error fetching payment', error: error.message });
  }
});

// Create payment (admin/hospital only)
router.post('/', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'nurse') {
      return res.status(403).json({ success: false, message: 'Access denied. Only hospitals can create payments.' });
    }

    const { dutyId, doctorId, paymentTimeline } = req.body;

    // Validate duty
    const duty = await Duty.findById(dutyId);
    if (!duty) {
      return res.status(404).json({ success: false, message: 'Duty not found' });
    }

    if (duty.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only create payments for your own shifts' });
    }

    // Validate doctor
    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({ success: false, message: 'Doctor not found' });
    }

    // Check if payment already exists
    const existingPayment = await Payment.findOne({ duty: dutyId, doctor: doctorId });
    if (existingPayment) {
      return res.status(400).json({ success: false, message: 'Payment already exists for this shift' });
    }

    // Calculate payment details
    const grossAmount = duty.totalCompensation || (duty.duration * duty.hourlyRate);
    const platformFeePercentage = duty.platformFee || 5;
    const platformFee = (grossAmount * platformFeePercentage) / 100;
    const netAmount = grossAmount - platformFee;

    // Calculate due date based on timeline
    const dueDate = new Date(duty.date);
    if (paymentTimeline === 'Immediate') {
      dueDate.setHours(dueDate.getHours() + 1);
    } else if (paymentTimeline === '48 hours') {
      dueDate.setDate(dueDate.getDate() + 2);
    } else if (paymentTimeline === '7 days') {
      dueDate.setDate(dueDate.getDate() + 7);
    } else {
      dueDate.setDate(dueDate.getDate() + 15);
    }

    // Create payment
    const payment = await Payment.create({
      duty: dutyId,
      doctor: doctorId,
      hospital: req.user._id,
      grossAmount,
      platformFee,
      platformFeePercentage,
      netAmount,
      hourlyRate: duty.hourlyRate,
      hours: duty.duration,
      shiftDate: duty.date,
      dueDate,
      paymentMethod: 'BANK_TRANSFER',
      bankDetails: doctor.bankDetails || {}
    });

    // Update duty payment status
    duty.paymentStatus = 'PENDING';
    await duty.save();

    res.status(201).json({
      success: true,
      message: 'Payment created successfully',
      data: payment
    });
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ success: false, message: 'Error creating payment', error: error.message });
  }
});

// Update payment status (admin/hospital only)
router.put('/:id/status', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'nurse') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { status, transactionId, bankReference, notes } = req.body;

    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    if (payment.hospital.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You can only update your own payments' });
    }

    payment.status = status;
    if (transactionId) payment.transactionId = transactionId;
    if (bankReference) payment.bankReference = bankReference;
    if (notes) payment.notes = notes;

    if (status === 'COMPLETED') {
      payment.paidAt = new Date();
      payment.processedBy = req.user._id;
      payment.processedAt = new Date();

      // Update duty payment status
      const duty = await Duty.findById(payment.duty);
      if (duty) {
        duty.paymentStatus = 'PAID';
        duty.paymentDate = new Date();
        await duty.save();
      }
    }

    await payment.save();

    // TODO: Send notification to doctor

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      data: payment
    });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ success: false, message: 'Error updating payment', error: error.message });
  }
});

// Get pending payments (admin/hospital only)
router.get('/pending/list', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'nurse') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const pendingPayments = await Payment.find({
      hospital: req.user._id,
      status: 'PENDING'
    })
      .sort({ dueDate: 1 })
      .populate('duty', 'title date')
      .populate('doctor', 'name email')
      .lean();

    res.json({
      success: true,
      data: pendingPayments
    });
  } catch (error) {
    console.error('Error fetching pending payments:', error);
    res.status(500).json({ success: false, message: 'Error fetching pending payments', error: error.message });
  }
});

module.exports = router;
