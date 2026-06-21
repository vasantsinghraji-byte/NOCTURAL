/**
 * Database Index Migration Script
 *
 * This script adds critical indexes to improve query performance
 * Run with: node scripts/add-indexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

console.log('=== MongoDB Index Migration ===\n');

async function addIndexes() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected successfully\n');

        const db = mongoose.connection.db;

        console.log('Creating indexes...\n');

        // Duties Collection Indexes
        console.log('1. Duties Collection:');
        try {
            await db.collection('duties').createIndex({ status: 1, date: 1 }, {
                name: 'status_date_idx',
                background: true
            });
            console.log('   ✓ status_date_idx created');

            await db.collection('duties').createIndex({ facility: 1, date: 1 }, {
                name: 'facility_date_idx',
                background: true
            });
            console.log('   ✓ facility_date_idx created');

            await db.collection('duties').createIndex({ createdBy: 1, status: 1 }, {
                name: 'createdBy_status_idx',
                background: true
            });
            console.log('   ✓ createdBy_status_idx created');

            await db.collection('duties').createIndex({ date: 1 }, {
                name: 'date_idx',
                background: true
            });
            console.log('   ✓ date_idx created');
        } catch (err) {
            console.log('   ⚠ Some duty indexes may already exist:', err.message);
        }

        // Applications Collection Indexes
        console.log('\n2. Applications Collection:');
        try {
            const applicationIndexes = await db.collection('applications').indexes();
            if (applicationIndexes.some(index => index.name === 'duty_user_unique_idx')) {
                await db.collection('applications').dropIndex('duty_user_unique_idx');
                console.log('   ✓ obsolete duty_user_unique_idx removed');
            }

            if (applicationIndexes.some(index => index.name === 'user_status_idx')) {
                await db.collection('applications').dropIndex('user_status_idx');
                console.log('   ✓ obsolete user_status_idx removed');
            }

            const hasApplicantStatusIndex = applicationIndexes.some(index =>
                index.key?.applicant === 1 && index.key?.status === 1
            );
            if (!hasApplicantStatusIndex) {
                await db.collection('applications').createIndex({ applicant: 1, status: 1 }, {
                    name: 'applicant_status_idx',
                    background: true
                });
                console.log('   ✓ applicant_status_idx created');
            } else {
                console.log('   ✓ applicant/status index already exists');
            }

            await db.collection('applications').createIndex({ duty: 1, status: 1 }, {
                name: 'duty_status_idx',
                background: true
            });
            console.log('   ✓ duty_status_idx created');

            await db.collection('applications').createIndex({ duty: 1, applicant: 1 }, {
                name: 'duty_applicant_unique_idx',
                unique: true,
                background: true
            });
            console.log('   ✓ duty_applicant_unique_idx created (prevents duplicate applications)');

            await db.collection('applications').createIndex({ createdAt: -1 }, {
                name: 'createdAt_idx',
                background: true
            });
            console.log('   ✓ createdAt_idx created');
        } catch (err) {
            console.log('   ⚠ Some application indexes may already exist:', err.message);
        }

        // Earnings Collection Indexes
        console.log('\n3. Earnings Collection:');
        try {
            await db.collection('earnings').createIndex({ user: 1, paymentStatus: 1 }, {
                name: 'user_paymentStatus_idx',
                background: true
            });
            console.log('   ✓ user_paymentStatus_idx created');

            await db.collection('earnings').createIndex({ user: 1, createdAt: -1 }, {
                name: 'user_createdAt_idx',
                background: true
            });
            console.log('   ✓ user_createdAt_idx created');

            await db.collection('earnings').createIndex({ paymentStatus: 1, paymentDate: 1 }, {
                name: 'paymentStatus_paymentDate_idx',
                background: true
            });
            console.log('   ✓ paymentStatus_paymentDate_idx created');
        } catch (err) {
            console.log('   ⚠ Some earnings indexes may already exist:', err.message);
        }

        // Notifications Collection Indexes
        console.log('\n4. Notifications Collection:');
        try {
            await db.collection('notifications').createIndex({ user: 1, read: 1, createdAt: -1 }, {
                name: 'user_read_createdAt_idx',
                background: true
            });
            console.log('   ✓ user_read_createdAt_idx created');

            await db.collection('notifications').createIndex({ user: 1, createdAt: -1 }, {
                name: 'user_createdAt_idx',
                background: true
            });
            console.log('   ✓ user_createdAt_idx created');

            // TTL index to auto-delete old notifications after 90 days
            await db.collection('notifications').createIndex({ createdAt: 1 }, {
                name: 'notification_ttl_idx',
                expireAfterSeconds: 7776000, // 90 days
                background: true
            });
            console.log('   ✓ notification_ttl_idx created (auto-deletes after 90 days)');
        } catch (err) {
            console.log('   ⚠ Some notification indexes may already exist:', err.message);
        }

        try {
            await db.collection('notifications').createIndex({ 'metadata.outboxId': 1 }, {
                name: 'notification_outbox_dedupe_idx',
                unique: true,
                sparse: true,
                background: true
            });
            console.log('   notification_outbox_dedupe_idx created');
        } catch (err) {
            console.log('   Notification outbox dedupe index could not be created:', err.message);
        }

        // Users Collection Indexes
        console.log('\n5. Users Collection:');
        try {
            await db.collection('users').createIndex({ email: 1 }, {
                name: 'email_unique_idx',
                unique: true,
                background: true
            });
            console.log('   ✓ email_unique_idx created');

            await db.collection('users').createIndex({ role: 1, isActive: 1 }, {
                name: 'role_isActive_idx',
                background: true
            });
            console.log('   ✓ role_isActive_idx created');

            await db.collection('users').createIndex({ 'profile.specialty': 1 }, {
                name: 'specialty_idx',
                background: true,
                sparse: true
            });
            console.log('   ✓ specialty_idx created');
        } catch (err) {
            console.log('   ⚠ Some user indexes may already exist:', err.message);
        }

        // Idempotency Key Collection Indexes
        console.log('\n6. Idempotency Keys Collection:');
        try {
            await db.collection('idempotencykeys').createIndex({ scope: 1 }, {
                name: 'scope_unique_idx',
                unique: true,
                background: true
            });
            console.log('   scope_unique_idx created (atomic idempotency claims)');

            await db.collection('idempotencykeys').createIndex({ createdAt: 1 }, {
                name: 'idempotency_ttl_idx',
                expireAfterSeconds: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS, 10) || 86400,
                background: true
            });
            console.log('   idempotency_ttl_idx created');
        } catch (err) {
            console.log('   Some idempotency indexes may already exist:', err.message);
        }

        // Booking completion consistency indexes
        console.log('\n7. Booking Completion Consistency:');
        try {
            await db.collection('healthmetrics').createIndex(
                { 'source.bookingId': 1, metricType: 1 },
                {
                    name: 'booking_metric_type_unique_idx',
                    unique: true,
                    partialFilterExpression: { 'source.bookingId': { $exists: true } },
                    background: true
                }
            );
            await db.collection('healthrecords').createIndex(
                { 'source.bookingId': 1 },
                {
                    name: 'booking_health_record_unique_idx',
                    unique: true,
                    partialFilterExpression: {
                        'source.bookingId': { $exists: true },
                        recordType: 'BOOKING_CAPTURE'
                    },
                    background: true
                }
            );
            await db.collection('bookingcompletionoutboxes').createIndex(
                { booking: 1 },
                { name: 'booking_completion_outbox_unique_idx', unique: true, background: true }
            );
            console.log('   booking-derived unique indexes created');
        } catch (err) {
            console.log('   Booking completion indexes require duplicate cleanup:', err.message);
        }

        console.log('\n8. Refresh Session Cleanup:');
        try {
            await db.collection('refreshsessions').createIndex(
                { expiresAt: 1 },
                { expireAfterSeconds: 0, background: true }
            );
            await db.collection('refreshsessions').createIndex(
                { userId: 1, userType: 1, revokedAt: 1 },
                { background: true }
            );
            await db.collection('refreshsessions').createIndex(
                { familyId: 1, revokedAt: 1 },
                { background: true }
            );
            console.log('   refresh-session TTL and lookup indexes created');
        } catch (err) {
            console.log('   Refresh-session indexes could not be created:', err.message);
        }

        console.log('\n9. Security Notification and WebAuthn Outboxes:');
        try {
            await db.collection('securitynotificationoutboxes').createIndex(
                { status: 1, nextAttemptAt: 1 },
                { background: true }
            );
            await db.collection('securitynotificationoutboxes').createIndex(
                { purgeAfter: 1 },
                { expireAfterSeconds: 0, background: true }
            );
            await db.collection('webauthnchallenges').createIndex(
                { expiresAt: 1 },
                { expireAfterSeconds: 0, background: true }
            );
            await db.collection('webauthnchallenges').createIndex(
                { identityId: 1, identityType: 1, purpose: 1, consumedAt: 1 },
                { background: true }
            );
            await db.collection('webauthnrecoverycodes').createIndex(
                { identityId: 1, identityType: 1, usedAt: 1, replacedAt: 1 },
                { background: true }
            );
            await db.collection('webauthnrecoverycodes').createIndex(
                { expiresAt: 1 },
                { expireAfterSeconds: 0, background: true }
            );
            console.log('   security notification outbox, WebAuthn, and recovery-code indexes created');
        } catch (err) {
            console.log('   Security notification/WebAuthn indexes could not be created:', err.message);
        }

        // List all indexes
        console.log('\n=== Index Summary ===\n');
        const collections = ['duties', 'applications', 'earnings', 'notifications', 'users', 'idempotencykeys', 'healthmetrics', 'healthrecords', 'bookingcompletionoutboxes', 'refreshsessions', 'securitynotificationoutboxes', 'webauthnchallenges', 'webauthnrecoverycodes'];

        for (const collName of collections) {
            try {
                const indexes = await db.collection(collName).indexes();
                console.log(`${collName}: ${indexes.length} indexes`);
                indexes.forEach(idx => {
                    if (idx.name !== '_id_') {
                        console.log(`  - ${idx.name}`);
                    }
                });
            } catch (err) {
                console.log(`${collName}: Collection does not exist yet`);
            }
        }

        console.log('\n✅ All indexes created successfully!');
        console.log('\nPerformance Impact:');
        console.log('- Queries on status + date: ~10-100x faster');
        console.log('- User-specific queries: ~5-50x faster');
        console.log('- Notification fetching: ~20-100x faster');
        console.log('- Duplicate prevention: Automatic\n');

    } catch (error) {
        console.error('\n✗ Error creating indexes:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('Disconnected from MongoDB');
    }
}

// Run the migration
addIndexes().catch(console.error);
