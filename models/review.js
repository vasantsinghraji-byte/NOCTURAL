const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    duty: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Duty',
        required: true
    },
    reviewedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true // The doctor/nurse being reviewed
    },
    reviewer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true // The hospital/admin doing the review
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    // Detailed ratings
    ratings: {
        punctuality: { type: Number, min: 1, max: 5 },
        professionalism: { type: Number, min: 1, max: 5 },
        clinicalSkills: { type: Number, min: 1, max: 5 },
        communication: { type: Number, min: 1, max: 5 },
        teamwork: { type: Number, min: 1, max: 5 }
    },
    comment: {
        type: String,
        maxlength: 1000
    },
    performanceMetrics: {
        arrivedOnTime: Boolean,
        minutesLate: Number,
        completedFullShift: Boolean,
        wouldRehire: Boolean,
        recommendToOthers: Boolean
    },
    tags: [{
        type: String,
        enum: [
            'EXCELLENT_WORK',
            'PUNCTUAL',
            'PROFESSIONAL',
            'SKILLED',
            'TEAM_PLAYER',
            'GOOD_COMMUNICATOR',
            'NEEDS_IMPROVEMENT',
            'LATE',
            'CANCELLED',
            'UNPROFESSIONAL'
        ]
    }],
    visibility: {
        type: String,
        enum: ['PUBLIC', 'PRIVATE', 'HOSPITAL_ONLY'],
        default: 'PUBLIC'
    },
    verified: {
        type: Boolean,
        default: true // Verified since it's from a completed shift
    },
    response: {
        comment: String,
        respondedAt: Date
    },
    helpful: {
        count: { type: Number, default: 0 },
        users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    }
}, {
    timestamps: true
});

// Indexes
reviewSchema.index({ reviewedUser: 1, createdAt: -1 });
reviewSchema.index({ duty: 1 });
reviewSchema.index({ reviewer: 1 });
reviewSchema.index({ rating: 1 });

// Compound index to prevent duplicate reviews
reviewSchema.index({ duty: 1, reviewedUser: 1, reviewer: 1 }, { unique: true });

// Pre-save hook to calculate overall rating from detailed ratings
reviewSchema.pre('save', function(next) {
    if (this.ratings && Object.keys(this.ratings).length > 0) {
        const ratingValues = Object.values(this.ratings).filter(r => r != null);
        if (ratingValues.length > 0) {
            const sum = ratingValues.reduce((acc, val) => acc + val, 0);
            this.rating = Math.round((sum / ratingValues.length) * 10) / 10; // Round to 1 decimal
        }
    }
    next();
});

// Static method to calculate user's average rating
reviewSchema.statics.getUserAverageRating = async function(userId) {
    const result = await this.aggregate([
        { $match: { reviewedUser: mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: null,
                avgRating: { $avg: '$rating' },
                totalReviews: { $sum: 1 },
                avgPunctuality: { $avg: '$ratings.punctuality' },
                avgProfessionalism: { $avg: '$ratings.professionalism' },
                avgClinicalSkills: { $avg: '$ratings.clinicalSkills' },
                avgCommunication: { $avg: '$ratings.communication' },
                avgTeamwork: { $avg: '$ratings.teamwork' },
                wouldRehireCount: {
                    $sum: { $cond: ['$performanceMetrics.wouldRehire', 1, 0] }
                }
            }
        }
    ]);

    if (result.length === 0) {
        return {
            avgRating: 0,
            totalReviews: 0,
            wouldRehirePercentage: 0
        };
    }

    const data = result[0];
    return {
        avgRating: Math.round(data.avgRating * 10) / 10,
        totalReviews: data.totalReviews,
        avgPunctuality: Math.round((data.avgPunctuality || 0) * 10) / 10,
        avgProfessionalism: Math.round((data.avgProfessionalism || 0) * 10) / 10,
        avgClinicalSkills: Math.round((data.avgClinicalSkills || 0) * 10) / 10,
        avgCommunication: Math.round((data.avgCommunication || 0) * 10) / 10,
        avgTeamwork: Math.round((data.avgTeamwork || 0) * 10) / 10,
        wouldRehirePercentage: Math.round((data.wouldRehireCount / data.totalReviews) * 100)
    };
};

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
