const mongoose = require('mongoose');

const certificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['MEDICAL_LICENSE', 'DEGREE', 'CERTIFICATION', 'TRAINING', 'SPECIALTY', 'OTHER'],
        required: true
    },
    issuingAuthority: {
        type: String,
        required: true
    },
    licenseNumber: String,
    issueDate: {
        type: Date,
        required: true
    },
    expiryDate: Date, // null means never expires
    status: {
        type: String,
        enum: ['ACTIVE', 'EXPIRED', 'EXPIRING_SOON', 'PENDING_RENEWAL', 'SUSPENDED'],
        default: 'ACTIVE'
    },
    documentUrl: String,
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // Admin who verified
    },
    verifiedAt: Date,
    verificationStatus: {
        type: String,
        enum: ['PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED'],
        default: 'PENDING'
    },
    renewalUrl: String, // Link to renewal course/form
    remindersSent: [{
        sentAt: Date,
        daysBeforeExpiry: Number,
        method: String // 'EMAIL', 'SMS', 'IN_APP'
    }],
    notes: String,
    impactOnMatches: {
        type: String,
        description: 'e.g., "+12% more duty matches" or "+8% higher pay rate"'
    }
}, {
    timestamps: true
});

// Indexes
certificationSchema.index({ user: 1, status: 1 });
certificationSchema.index({ user: 1, expiryDate: 1 });
certificationSchema.index({ expiryDate: 1 });

// Pre-save hook to update status based on expiry date
certificationSchema.pre('save', function(next) {
    if (this.expiryDate) {
        const now = new Date();
        const expiryDate = new Date(this.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

        if (expiryDate < now) {
            this.status = 'EXPIRED';
            this.verificationStatus = 'EXPIRED';
        } else if (daysUntilExpiry <= 30) {
            this.status = 'EXPIRING_SOON';
        } else {
            this.status = 'ACTIVE';
        }
    }
    next();
});

// Method to check if renewal reminder should be sent
certificationSchema.methods.shouldSendReminder = function(daysBeforeExpiry) {
    if (!this.expiryDate) return false;

    const now = new Date();
    const expiryDate = new Date(this.expiryDate);
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry !== daysBeforeExpiry) return false;

    // Check if reminder already sent for this period
    const reminderAlreadySent = this.remindersSent.some(
        reminder => reminder.daysBeforeExpiry === daysBeforeExpiry
    );

    return !reminderAlreadySent;
};

// Static method to get expiring certifications
certificationSchema.statics.getExpiringCertifications = async function(daysAhead = 30) {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + daysAhead);

    return await this.find({
        expiryDate: {
            $gte: today,
            $lte: futureDate
        },
        status: { $ne: 'EXPIRED' }
    }).populate('user', 'name email phone');
};

const Certification = mongoose.model('Certification', certificationSchema);

module.exports = Certification;
