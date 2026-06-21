const express = require('express');
const HospitalWaitlist = require('../../models/hospitalWaitlist');
const funnelAnalyticsService = require('../../services/funnelAnalyticsService');
const { protect, authorize } = require('../../middleware/auth');

const router = express.Router();

const escapeCsv = (value) => {
  const text = String(value || '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildWaitlistFilters = (query) => {
  const filters = {};

  if (query.status) filters.status = query.status;
  if (query.facilityType) filters.facilityType = query.facilityType;
  if (query.city) filters.city = new RegExp(escapeRegex(query.city.trim()), 'i');

  return filters;
};

router.use(protect, authorize('admin'));

router.get('/analytics/daily', async (req, res, next) => {
  try {
    const report = await funnelAnalyticsService.getDailyReport({
      days: req.query.days,
      event: req.query.event,
      path: req.query.path
    });

    return res.json({ success: true, ...report });
  } catch (error) {
    return next(error);
  }
});

router.get('/waitlist', async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const skip = (page - 1) * limit;
    const filters = buildWaitlistFilters(req.query);

    const [leads, total, summaryRows] = await Promise.all([
      HospitalWaitlist.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      HospitalWaitlist.countDocuments(filters),
      HospitalWaitlist.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    const summary = summaryRows.reduce((acc, row) => ({
      ...acc,
      [row._id || 'unknown']: row.count
    }), {});

    return res.json({
      success: true,
      leads,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      summary
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/waitlist/export', async (req, res, next) => {
  try {
    const filters = buildWaitlistFilters(req.query);
    const leads = await HospitalWaitlist.find(filters).sort({ createdAt: -1 }).limit(5000).lean();
    const header = ['createdAt', 'facilityName', 'facilityType', 'contactName', 'email', 'phone', 'city', 'state', 'status', 'expectedNeed'];
    const rows = leads.map((lead) => header.map((field) => escapeCsv(lead[field])).join(','));
    const csv = [header.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="hospital-waitlist.csv"');
    return res.send(csv);
  } catch (error) {
    return next(error);
  }
});

router.patch('/waitlist/:id/status', async (req, res, next) => {
  try {
    const allowedStatuses = ['new', 'contacted', 'qualified', 'closed'];
    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid waitlist status'
      });
    }

    const update = { status: req.body.status };
    if (req.body.status === 'contacted') {
      update.contactedAt = new Date();
      update.contactedBy = req.user._id || req.user.id;
    }

    const lead = await HospitalWaitlist.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    ).lean();

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Waitlist lead not found'
      });
    }

    return res.json({ success: true, lead });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
