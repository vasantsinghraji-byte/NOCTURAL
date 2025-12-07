const mongoose = require('mongoose');

const earningSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    duty: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Duty',
        required: true
    },
    application: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Application',
        required: true
    },
    hospital: {
        type: String,
        required: true
    },
    shiftDate: {
        type: Date,
        required: true
    },
    hoursWorked: {
        type: Number,
        required: true
    },
    hourlyRate: {
        type: Number,
        required: true
    },
    totalAmount: {
        type: Number,
        required: true
    },
    bonuses: [{
        type: {
            type: String,
            enum: ['WEEKEND', 'NIGHT_SHIFT', 'EMERGENCY', 'SERIES_DISCOUNT', 'REFERRAL', 'PERFORMANCE', 'OTHER']
        },
        amount: Number,
        description: String
    }],
    deductions: [{
        type: {
            type: String,
            enum: ['TAX', 'TDS', 'PLATFORM_FEE', 'LATE_CANCELLATION', 'OTHER']
        },
        amount: Number,
        description: String
    }],
    netAmount: {
        type: Number,
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'PAID', 'OVERDUE', 'DISPUTED'],
        default: 'PENDING'
    },
    paymentMethod: {
        type: String,
        enum: ['BANK_TRANSFER', 'UPI', 'CHECK', 'CASH', 'OTHER']
    },
    paymentDate: Date,
    expectedPaymentDate: {
        type: Date,
        required: true
    },
    invoiceNumber: {
        type: String,
        unique: true,
        sparse: true
    },
    invoiceUrl: String,
    taxDocuments: [{
        type: String, // 'FORM_16', 'TDS_CERTIFICATE', etc.
        url: String,
        uploadedAt: Date
    }],
    disputeReason: String,
    disputeResolvedAt: Date,
    paymentReminders: [{
        sentAt: Date,
        method: String // 'EMAIL', 'SMS', 'IN_APP'
    }]
}, {
    timestamps: true
});

// Database Indexes for Performance
earningSchema.index({ user: 1, shiftDate: -1 }); // User's earning history
earningSchema.index({ user: 1, paymentStatus: 1 }); // User's earnings by payment status
earningSchema.index({ shiftDate: 1 }); // Earnings by shift date
// Note: invoiceNumber index created automatically by unique: true in schema
earningSchema.index({ duty: 1 }); // Earnings by duty
earningSchema.index({ paymentStatus: 1, expectedPaymentDate: 1 }); // Overdue payment identification
earningSchema.index({ user: 1, createdAt: -1 }); // Recent earnings
earningSchema.index({ hospital: 1, shiftDate: -1 }); // Hospital's payment tracking

// Pre-save hook to calculate net amount
earningSchema.pre('save', function(next) {
    let bonusTotal = 0;
    let deductionTotal = 0;

    if (this.bonuses && this.bonuses.length > 0) {
        bonusTotal = this.bonuses.reduce((sum, bonus) => sum + (bonus.amount || 0), 0);
    }

    if (this.deductions && this.deductions.length > 0) {
        deductionTotal = this.deductions.reduce((sum, deduction) => sum + (deduction.amount || 0), 0);
    }

    this.netAmount = this.totalAmount + bonusTotal - deductionTotal;

    next();
});

// Method to generate invoice number
earningSchema.methods.generateInvoiceNumber = function() {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.invoiceNumber = `INV-${year}${month}-${random}`;
};

// Static method to calculate monthly earnings
earningSchema.statics.getMonthlyEarnings = async function(userId, year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const earnings = await this.aggregate([
        {
            $match: {
                user: mongoose.Types.ObjectId(userId),
                shiftDate: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: null,
                totalEarnings: { $sum: '$totalAmount' },
                netEarnings: { $sum: '$netAmount' },
                totalHours: { $sum: '$hoursWorked' },
                totalShifts: { $sum: 1 },
                paidAmount: {
                    $sum: {
                        $cond: [{ $eq: ['$paymentStatus', 'PAID'] }, '$netAmount', 0]
                    }
                },
                pendingAmount: {
                    $sum: {
                        $cond: [
                            { $in: ['$paymentStatus', ['PENDING', 'PROCESSING']] },
                            '$netAmount',
                            0
                        ]
                    }
                },
                overdueAmount: {
                    $sum: {
                        $cond: [{ $eq: ['$paymentStatus', 'OVERDUE'] }, '$netAmount', 0]
                    }
                }
            }
        }
    ]);

    return earnings[0] || {
        totalEarnings: 0,
        netEarnings: 0,
        totalHours: 0,
        totalShifts: 0,
        paidAmount: 0,
        pendingAmount: 0,
        overdueAmount: 0
    };
};

const Earning = mongoose.model('Earning', earningSchema);

module.exports = Earning;
