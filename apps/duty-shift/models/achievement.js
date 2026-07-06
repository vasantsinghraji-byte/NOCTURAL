const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: [
            'FIRST_SHIFT',
            'MILESTONE_10',
            'MILESTONE_50',
            'MILESTONE_100',
            'MILESTONE_150',
            'PREMIUM_MEMBER',
            'STREAK_7',
            'STREAK_30',
            'LIGHTNING_RESPONDER',
            'COMPLETION_RATE_100',
            'TOP_EARNER_MONTH',
            'TOP_EARNER_YEAR',
            'FIVE_STAR_CHAMPION',
            'WEEKEND_WARRIOR',
            'NIGHT_OWL',
            'SPECIALTY_EXPERT',
            'HOSPITAL_FAVORITE',
            'PERFECT_ATTENDANCE',
            'QUICK_LEARNER',
            'MENTOR',
            'INNOVATOR'
        ],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    icon: {
        type: String, // Emoji or icon class
        required: true
    },
    earnedAt: {
        type: Date,
        default: Date.now
    },
    progress: {
        current: { type: Number, default: 0 },
        target: { type: Number, default: 1 },
        unit: String // 'shifts', 'hours', 'days', etc.
    },
    reward: {
        type: String,
        enum: ['BADGE', 'BONUS', 'FEATURED_PROFILE', 'PRIORITY_MATCHING', 'NONE'],
        default: 'BADGE'
    },
    rewardAmount: Number, // If reward is BONUS
    rewardClaimed: {
        type: Boolean,
        default: false
    },
    claimedAt: Date,
    tier: {
        type: String,
        enum: ['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND'],
        default: 'BRONZE'
    },
    shareableUrl: String,
    sharedOn: [{
        platform: String, // 'LINKEDIN', 'TWITTER', 'FACEBOOK'
        sharedAt: Date
    }],
    visible: {
        type: Boolean,
        default: true // Show on profile
    }
}, {
    timestamps: true
});

// Indexes
achievementSchema.index({ user: 1, type: 1 }, { unique: true });
achievementSchema.index({ user: 1, earnedAt: -1 });
achievementSchema.index({ type: 1 });

// Static method to check and award achievements
achievementSchema.statics.checkAndAward = async function(userId, achievementType, progressData = {}) {
    const achievementDefinitions = {
        FIRST_SHIFT: {
            title: 'First Shift Completed',
            description: 'Completed your first shift on Nocturnal',
            icon: '🏆',
            progress: { current: 1, target: 1, unit: 'shifts' }
        },
        MILESTONE_50: {
            title: '50 Shifts Milestone',
            description: 'Completed 50 shifts successfully',
            icon: '⭐',
            progress: { current: 50, target: 50, unit: 'shifts' }
        },
        MILESTONE_100: {
            title: '100 Shifts Milestone',
            description: 'Completed 100 shifts successfully',
            icon: '💎',
            progress: { current: 100, target: 100, unit: 'shifts' },
            reward: 'BONUS',
            rewardAmount: 5000
        },
        STREAK_7: {
            title: '7-Day Streak',
            description: 'Worked 7 days in a row',
            icon: '🔥',
            progress: { current: 7, target: 7, unit: 'days' }
        },
        LIGHTNING_RESPONDER: {
            title: 'Lightning Responder',
            description: 'Average response time under 5 minutes',
            icon: '⚡',
            progress: { current: 1, target: 1, unit: 'achievement' }
        },
        FIVE_STAR_CHAMPION: {
            title: '5-Star Rating Champion',
            description: 'Maintained 5-star rating for 10+ shifts',
            icon: '🌟',
            progress: { current: 10, target: 10, unit: 'shifts' }
        },
        WEEKEND_WARRIOR: {
            title: 'Weekend Warrior',
            description: 'Completed 50 weekend shifts',
            icon: '💪',
            progress: { current: 50, target: 50, unit: 'shifts' }
        }
    };

    const definition = achievementDefinitions[achievementType];
    if (!definition) return null;

    // Check if already earned
    const existing = await this.findOne({ user: userId, type: achievementType });
    if (existing) return existing;

    // Create new achievement
    const achievement = new this({
        user: userId,
        type: achievementType,
        title: definition.title,
        description: definition.description,
        icon: definition.icon,
        progress: progressData.progress || definition.progress,
        reward: definition.reward || 'BADGE',
        rewardAmount: definition.rewardAmount,
        tier: definition.tier || 'BRONZE'
    });

    await achievement.save();
    return achievement;
};

// Method to generate shareable URL
achievementSchema.methods.generateShareableUrl = function() {
    const baseUrl = process.env.APP_URL || 'https://nocturnal.com';
    this.shareableUrl = `${baseUrl}/achievements/${this._id}`;
};

const Achievement = mongoose.model('Achievement', achievementSchema);

module.exports = Achievement;
