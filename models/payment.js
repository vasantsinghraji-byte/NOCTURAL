const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // Related entities
  duty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Duty',
    required: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  hospital: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Payment details
  grossAmount: {
    type: Number,
    required: true // Total shift payment before fees
  },
  platformFee: {
    type: Number,
    required: true // Platform commission amount
  },
  platformFeePercentage: {
    type: Number,
    default: 5
  },
  netAmount: {
    type: Number,
    required: true // Amount doctor receives after fees
  },

  // Breakdown
  hourlyRate: Number,
  hours: Number,
  overtimeHours: Number,
  overtimeAmount: Number,

  // Status
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED'],
    default: 'PENDING'
  },

  // Dates
  shiftDate: {
    type: Date,
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  paidAt: Date,

  // Payment method & details
  paymentMethod: {
    type: String,
    enum: ['BANK_TRANSFER', 'UPI', 'WALLET', 'CHEQUE'],
    default: 'BANK_TRANSFER'
  },
  transactionId: String,
  bankReference: String,

  // Bank details used
  bankDetails: {
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String
  },

  // Invoice
  invoiceNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  invoiceUrl: String,

  // Taxes
  tds: {
    applicable: { type: Boolean, default: false },
    percentage: Number,
    amount: Number
  },
  gst: {
    applicable: { type: Boolean, default: false },
    percentage: Number,
    amount: Number
  },

  // Notes & communication
  notes: String,
  failureReason: String,

  // Processing metadata
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: Date,

  // Notifications sent
  notificationsSent: {
    paymentInitiated: { type: Boolean, default: false },
    paymentCompleted: { type: Boolean, default: false },
    paymentFailed: { type: Boolean, default: false }
  }

}, {
  timestamps: true
});

// Database Indexes for Performance
paymentSchema.index({ doctor: 1, shiftDate: -1 }); // Doctor's payment history
paymentSchema.index({ hospital: 1, shiftDate: -1 }); // Hospital's payment history
paymentSchema.index({ status: 1, dueDate: 1 }); // Pending payments sorted by due date
// Note: invoiceNumber index created automatically by unique: true in schema
paymentSchema.index({ doctor: 1, status: 1 }); // Doctor's payments by status
paymentSchema.index({ hospital: 1, status: 1 }); // Hospital's payments by status
paymentSchema.index({ duty: 1 }); // Payment lookup by duty
paymentSchema.index({ status: 1, paidAt: -1 }); // Completed payments chronologically
paymentSchema.index({ createdAt: -1 }); // Recent payments
paymentSchema.index({ dueDate: 1, status: 1 }); // Overdue payment identification

// Generate invoice number
paymentSchema.pre('save', async function(next) {
  if (this.isNew && !this.invoiceNumber) {
    const count = await mongoose.model('Payment').countDocuments();
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    this.invoiceNumber = `INV-${year}${month}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Static method to get doctor earnings summary
paymentSchema.statics.getDoctorEarnings = async function(doctorId, options = {}) {
  const { startDate, endDate } = options;

  const matchQuery = { doctor: mongoose.Types.ObjectId(doctorId) };

  if (startDate || endDate) {
    matchQuery.shiftDate = {};
    if (startDate) matchQuery.shiftDate.$gte = new Date(startDate);
    if (endDate) matchQuery.shiftDate.$lte = new Date(endDate);
  }

  const result = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalShifts: { $sum: 1 },
        totalGross: { $sum: '$grossAmount' },
        totalFees: { $sum: '$platformFee' },
        totalNet: { $sum: '$netAmount' },
        paidCount: {
          $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] }
        },
        paidAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, '$netAmount', 0] }
        },
        pendingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] }
        },
        pendingAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, '$netAmount', 0] }
        }
      }
    }
  ]);

  if (result.length === 0) {
    return {
      totalShifts: 0,
      totalGross: 0,
      totalFees: 0,
      totalNet: 0,
      paidCount: 0,
      paidAmount: 0,
      pendingCount: 0,
      pendingAmount: 0
    };
  }

  return result[0];
};

// Static method to get monthly earnings
paymentSchema.statics.getMonthlyEarnings = async function(doctorId, year) {
  const result = await this.aggregate([
    {
      $match: {
        doctor: mongoose.Types.ObjectId(doctorId),
        shiftDate: {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`)
        }
      }
    },
    {
      $group: {
        _id: { $month: '$shiftDate' },
        month: { $first: { $month: '$shiftDate' } },
        totalShifts: { $sum: 1 },
        totalGross: { $sum: '$grossAmount' },
        totalNet: { $sum: '$netAmount' },
        paidAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, '$netAmount', 0] }
        }
      }
    },
    { $sort: { month: 1 } }
  ]);

  // Fill in missing months with zeros
  const monthlyData = Array(12).fill(null).map((_, i) => ({
    month: i + 1,
    totalShifts: 0,
    totalGross: 0,
    totalNet: 0,
    paidAmount: 0
  }));

  result.forEach(item => {
    monthlyData[item.month - 1] = item;
  });

  return monthlyData;
};

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
