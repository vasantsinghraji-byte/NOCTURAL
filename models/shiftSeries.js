const mongoose = require('mongoose');

const shiftSeriesSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    hospital: {
        type: String,
        required: true
    },
    postedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    specialty: {
        type: String,
        required: true
    },
    location: {
        type: String,
        required: true
    },
    seriesType: {
        type: String,
        enum: ['CONSECUTIVE_DAYS', 'WEEKLY', 'CUSTOM'],
        required: true
    },
    // Individual shifts in the series
    shifts: [{
        date: { type: Date, required: true },
        startTime: { type: String, required: true },
        endTime: { type: String, required: true },
        hourlyRate: { type: Number, required: true },
        status: {
            type: String,
            enum: ['PENDING', 'FILLED', 'CANCELLED'],
            default: 'PENDING'
        },
        dutyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Duty' }
    }],
    totalShifts: {
        type: Number,
        required: true
    },
    filledShifts: {
        type: Number,
        default: 0
    },
    // Discount for booking the series
    seriesDiscount: {
        type: Number,
        default: 10, // percentage
        min: 0,
        max: 100
    },
    baseHourlyRate: {
        type: Number,
        required: true
    },
    discountedRate: {
        type: Number,
        required: true
    },
    totalCompensation: {
        type: Number,
        required: true
    },
    // Requirements
    requirements: {
        minExperience: Number,
        requiredCertifications: [String],
        preferredQualifications: [String]
    },
    // Application settings
    acceptPartialSeries: {
        type: Boolean,
        default: false // If true, can apply for individual shifts
    },
    applicants: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        appliedFor: {
            type: String,
            enum: ['FULL_SERIES', 'PARTIAL'],
            default: 'FULL_SERIES'
        },
        selectedShifts: [Number], // Indices of shifts if partial
        status: {
            type: String,
            enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
            default: 'PENDING'
        },
        appliedAt: { type: Date, default: Date.now },
        coverLetter: String
    }],
    status: {
        type: String,
        enum: ['OPEN', 'PARTIAL', 'FILLED', 'CANCELLED'],
        default: 'OPEN'
    },
    deadline: {
        type: Date
    },
    createdDuties: {
        type: Boolean,
        default: false // Whether individual duties have been created
    }
}, {
    timestamps: true
});

// Indexes
shiftSeriesSchema.index({ postedBy: 1, createdAt: -1 });
shiftSeriesSchema.index({ status: 1 });
shiftSeriesSchema.index({ 'shifts.date': 1 });
shiftSeriesSchema.index({ hospital: 1 });

// Pre-save hook to calculate discounted rate and total compensation
shiftSeriesSchema.pre('save', function(next) {
    if (this.baseHourlyRate && this.seriesDiscount !== undefined) {
        this.discountedRate = this.baseHourlyRate * (1 - this.seriesDiscount / 100);
    }

    // Calculate total compensation
    if (this.shifts && this.shifts.length > 0) {
        let total = 0;
        this.shifts.forEach(shift => {
            const start = shift.startTime.split(':');
            const end = shift.endTime.split(':');
            const startMinutes = parseInt(start[0]) * 60 + parseInt(start[1]);
            const endMinutes = parseInt(end[0]) * 60 + parseInt(end[1]);
            const hours = (endMinutes - startMinutes) / 60;
            total += hours * this.discountedRate;
        });
        this.totalCompensation = Math.round(total);
    }

    // Update filled shifts count
    if (this.shifts) {
        this.filledShifts = this.shifts.filter(s => s.status === 'FILLED').length;
    }

    next();
});

// Method to apply for series
shiftSeriesSchema.methods.applyForSeries = async function(userId, appliedFor, selectedShifts, coverLetter) {
    // Check if user already applied
    const existingApplication = this.applicants.find(
        app => app.user.toString() === userId.toString()
    );

    if (existingApplication) {
        throw new Error('You have already applied for this series');
    }

    // Add application
    this.applicants.push({
        user: userId,
        appliedFor,
        selectedShifts,
        coverLetter,
        appliedAt: new Date()
    });

    await this.save();
};

// Method to accept application
shiftSeriesSchema.methods.acceptApplication = async function(applicationId) {
    const application = this.applicants.id(applicationId);
    if (!application) {
        throw new Error('Application not found');
    }

    application.status = 'ACCEPTED';

    // Update shift statuses
    if (application.appliedFor === 'FULL_SERIES') {
        this.shifts.forEach(shift => {
            if (shift.status === 'PENDING') {
                shift.status = 'FILLED';
            }
        });
        this.status = 'FILLED';
    } else if (application.appliedFor === 'PARTIAL' && application.selectedShifts) {
        application.selectedShifts.forEach(index => {
            if (this.shifts[index] && this.shifts[index].status === 'PENDING') {
                this.shifts[index].status = 'FILLED';
            }
        });

        // Check if partially filled
        const allFilled = this.shifts.every(s => s.status === 'FILLED');
        this.status = allFilled ? 'FILLED' : 'PARTIAL';
    }

    await this.save();
};

// Static method to create individual duties from series
shiftSeriesSchema.statics.createDutiesFromSeries = async function(seriesId) {
    const Duty = mongoose.model('Duty');
    const series = await this.findById(seriesId);

    if (!series) {
        throw new Error('Series not found');
    }

    if (series.createdDuties) {
        throw new Error('Duties already created for this series');
    }

    const createdDuties = [];

    for (let i = 0; i < series.shifts.length; i++) {
        const shift = series.shifts[i];

        const duty = new Duty({
            title: `${series.title} - Day ${i + 1}`,
            hospital: series.hospital,
            specialty: series.specialty,
            description: series.description + `\n\nPart of a ${series.totalShifts}-shift series with ${series.seriesDiscount}% discount.`,
            date: shift.date,
            startTime: shift.startTime,
            endTime: shift.endTime,
            hourlyRate: series.discountedRate,
            location: series.location,
            postedBy: series.postedBy,
            seriesId: series._id,
            seriesIndex: i
        });

        await duty.save();
        shift.dutyId = duty._id;
        createdDuties.push(duty);
    }

    series.createdDuties = true;
    await series.save();

    return createdDuties;
};

const ShiftSeries = mongoose.model('ShiftSeries', shiftSeriesSchema);

module.exports = ShiftSeries;
