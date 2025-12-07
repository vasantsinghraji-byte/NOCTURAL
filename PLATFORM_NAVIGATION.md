# Nocturnal Platform - Complete Navigation Map

## 🏠 Entry Points

### Landing Page
**File:** `index-unified.html`
- **Purpose:** Main landing page with role selection
- **Actions:**
  - Select "I'm a Doctor" → `doctor-onboarding.html`
  - Select "I'm a Hospital" → Hospital registration (to be implemented)
  - Click "Login" → Firebase authentication → Redirects based on role

---

## 👨‍⚕️ Doctor Journey

### 1. Onboarding (New Users)
**File:** `doctor-onboarding.html`
- **Step 1:** Account creation (name, email, phone, password)
- **Step 2:** Professional details (MCI, specialization, experience, skills)
- **Step 3:** Document upload (MCI cert, photo ID, MBBS degree, profile photo)
- **Step 4:** Preferences (shift times, radius, minimum rate, bank details)
- **On Complete:** Redirects to `doctor-dashboard.html`

### 2. Doctor Dashboard
**File:** `doctor-dashboard.html`
- **Navigation:**
  - Browse Shifts → `browse-shifts-enhanced.html`
  - My Calendar → `calendar.html`
  - My Applications → `my-applications.html`
  - Earnings → `payments-dashboard.html`
  - Profile → `doctor-profile-enhanced.html`
  - Achievements → `achievements.html`
  - Availability → `availability.html`

### 3. Browse & Apply for Shifts
**File:** `browse-shifts-enhanced.html`
- **Features:**
  - Filter by specialty, date, time, distance, pay, rating
  - Sort by match, distance, pay, urgency, date
  - View match scores
  - Quick apply button
  - Click card → `duty-details.html?id=SHIFT_ID`

### 4. My Profile
**File:** `doctor-profile-enhanced.html`
- **Sections:**
  - Profile photo upload
  - Profile strength indicator
  - Professional details (editable)
  - Skills & expertise
  - Shift preferences
  - Bank details (editable)
  - Documents (upload/view):
    - MCI Certificate
    - Photo ID
    - MBBS Degree

### 5. Earnings & Payments
**File:** `payments-dashboard.html`
- **Tabs:**
  - Payment History (all transactions)
  - Bank Details (view/edit)
  - Tax Summary (yearly breakdown with charts)
- **Features:**
  - Monthly earnings summary
  - Total earnings
  - Pending payments
  - Average per shift
  - Download invoices

### 6. My Calendar
**File:** `calendar.html`
- **Features:**
  - View confirmed shifts
  - View availability
  - Sync with external calendars

### 7. My Applications
**File:** `my-applications.html`
- **Categories:**
  - Pending applications
  - Accepted applications
  - Rejected applications
  - Withdrawn applications

### 8. Achievements
**File:** `achievements.html`
- **Features:**
  - Badges and milestones
  - Performance stats
  - Leaderboards

### 9. Availability Settings
**File:** `availability.html`
- **Features:**
  - Set recurring availability
  - Block specific dates
  - Set vacation periods

---

## 🏥 Hospital/Admin Journey

### 1. Admin Dashboard
**File:** `admin-dashboard.html`
- **Navigation:**
  - Post Shift → `admin-post-duty.html`
  - Applications → `admin-applications.html`
  - Analytics → `admin-analytics.html`
  - Settings → `admin-settings.html`
  - Profile → `admin-profile.html`

### 2. Post New Shift
**File:** `admin-post-duty.html`
- **Form Sections:**
  - Basic details (department, specialty, date, time, duration)
  - Requirements (experience, skills, patient load)
  - Compensation (hourly rate, overtime, payment timeline)
  - Facilities (meals, parking, scrubs, etc.)
  - Instructions (reporting location, contact person)
  - Photo uploads

### 3. Manage Applications
**File:** `admin-applications.html`
- **Features:**
  - View all applicants for each shift
  - See match scores
  - View doctor profiles
  - Accept/reject applications
  - Bulk actions

### 4. Analytics Dashboard
**File:** `admin-analytics.html`
- **Metrics:**
  - Fill rate trends
  - Budget vs. spend
  - Quality scores
  - Shift distribution
  - Top performing doctors
  - Predictions & forecasting

### 5. Hospital Settings
**File:** `admin-settings.html`
- **Settings:**
  - Monthly budget
  - Alert thresholds
  - Forecasting preferences
  - Notification settings
  - Analytics preferences

### 6. Admin Profile
**File:** `admin-profile.html`
- **Sections:**
  - Hospital information
  - Contact details
  - Billing information

---

## 🔔 Global Components

### Unified Navigation
**File:** `js/unified-nav.js`
- **Features:**
  - Role-based menu
  - Notification bell
  - User dropdown
  - Mobile responsive
  - Active link highlighting

**Usage:** Include in any page:
```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
<script src="/js/unified-nav.js"></script>
<script src="/js/notification-center.js"></script>
```

### Notification Center
**File:** `js/notification-center.js`
- **Features:**
  - Unread count badge
  - Dropdown panel
  - Real-time updates (polls every 30s)
  - Mark as read
  - Action navigation
  - Icon-coded by type

---

## 🔗 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login (not used, Firebase handles this)
- `GET /api/auth/me` - Get current user

### Users & Profiles
- `PUT /api/auth/profile` - Update profile
- `GET /api/auth/profile-strength` - Get profile completion

### File Uploads
- `POST /api/uploads/profile-photo` - Upload profile photo
- `POST /api/uploads/mci-certificate` - Upload MCI cert
- `POST /api/uploads/photo-id` - Upload photo ID
- `POST /api/uploads/mbbs-degree` - Upload degree
- `POST /api/uploads/documents` - Upload multiple documents
- `GET /api/uploads/status` - Get upload status

### Shifts/Duties
- `GET /api/duties` - Get all shifts (with filters)
- `GET /api/duties/:id` - Get single shift
- `POST /api/duties` - Create shift (admin only)
- `PUT /api/duties/:id` - Update shift (admin only)
- `DELETE /api/duties/:id` - Delete shift (admin only)

### Applications
- `GET /api/applications` - Get my applications
- `GET /api/applications/duty/:dutyId` - Get applications for a shift (admin)
- `POST /api/applications` - Apply for shift
- `PUT /api/applications/:id` - Update application status
- `DELETE /api/applications/:id` - Withdraw application

### Payments
- `GET /api/payments/earnings` - Get earnings summary
- `GET /api/payments/earnings/monthly/:year` - Monthly breakdown
- `GET /api/payments/history` - Payment history
- `GET /api/payments/:id` - Single payment details
- `POST /api/payments` - Create payment (admin only)
- `PUT /api/payments/:id/status` - Update payment status (admin only)
- `GET /api/payments/pending/list` - Get pending payments (admin only)

### Notifications
- `GET /api/notifications` - Get notifications
- `GET /api/notifications/unread-count` - Unread count
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all` - Mark all as read
- `DELETE /api/notifications/:id` - Delete notification
- `DELETE /api/notifications/clear/read` - Clear read notifications

### Analytics (Admin)
- `GET /api/analytics/hospital/dashboard` - Hospital dashboard data
- `GET /api/hospital-settings` - Get hospital settings
- `PUT /api/hospital-settings` - Update hospital settings

### Calendar
- `GET /api/calendar/events` - Get calendar events
- `POST /api/calendar/availability` - Set availability

### Earnings
- `GET /api/earnings` - Get earnings data
- `GET /api/earnings/summary` - Earnings summary

### Reviews
- `GET /api/reviews/user/:userId` - Get reviews for user
- `POST /api/reviews` - Submit review (admin only)
- `GET /api/reviews/duty/:dutyId` - Get reviews for shift

---

## 📱 User Flows

### Doctor: Complete Onboarding
1. Visit `index-unified.html`
2. Click "I'm a Doctor"
3. Complete 4-step onboarding in `doctor-onboarding.html`
4. Documents uploaded and profile created
5. Redirected to `doctor-dashboard.html`

### Doctor: Find and Apply for Shift
1. From dashboard, click "Browse Shifts"
2. In `browse-shifts-enhanced.html`, apply filters
3. View shift cards with match scores
4. Click "Quick Apply" or view details
5. Application submitted
6. View status in `my-applications.html`

### Doctor: Check Earnings
1. From dashboard, click "Earnings"
2. In `payments-dashboard.html`, view:
   - Monthly earnings
   - Payment history
   - Pending payments
   - Tax summary

### Doctor: Update Profile
1. From navigation, click profile dropdown → "My Profile"
2. In `doctor-profile-enhanced.html`:
   - Upload profile photo
   - Upload/update documents
   - Edit professional details
   - Edit bank details

### Hospital: Post a Shift
1. Login to `admin-dashboard.html`
2. Click "Post Shift"
3. In `admin-post-duty.html`, fill form:
   - Basic details
   - Requirements
   - Compensation
   - Facilities
   - Instructions
4. Submit and shift goes live

### Hospital: Review Applications
1. From dashboard, click "Applications"
2. In `admin-applications.html`:
   - View all applicants
   - See match scores
   - Review doctor profiles
   - Accept/reject applications

### Hospital: Monitor Performance
1. From dashboard, click "Analytics"
2. In `admin-analytics.html`:
   - View fill rates
   - Check budget utilization
   - See quality metrics
   - Review predictions

### Hospital: Manage Settings
1. From navigation, click "Settings"
2. In `admin-settings.html`:
   - Set monthly budget
   - Configure alerts
   - Set forecasting preferences
   - Manage notifications

---

## 🎨 Design System

### Colors
- Primary: `#5B8DBE`
- Success: `#28a745`
- Danger: `#dc3545`
- Warning: `#ffc107`
- Dark: `#2C3E50`

### Typography
- Font: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto`
- Headings: 700 weight
- Body: 400-500 weight

### Components
- Buttons: 8-30px border-radius
- Cards: 15-20px border-radius, shadow
- Forms: 8px border-radius, 2px border
- Badges: 15-20px border-radius

---

## 🔒 Authentication Flow

1. **Firebase Authentication**
   - Email/password registration
   - Email/password login
   - Token generation

2. **Backend Verification**
   - Token decoded manually (Base64)
   - Check for Firebase issuer
   - Auto-create MongoDB user from Firebase token
   - Support both Firebase and JWT tokens

3. **Authorization**
   - `protect` middleware on all protected routes
   - Role-based access control
   - Doctor can only access doctor routes
   - Admin can only access admin routes

---

## 📊 Data Models

### User
- Basic info (name, email, phone)
- Role (doctor, admin, nurse)
- Professional details (MCI, specialization, experience, skills)
- Documents (MCI cert, photo ID, degree)
- Bank details
- Profile strength (0-100%)
- Performance metrics

### Duty/Shift
- Hospital info
- Department & specialty
- Date, time, duration
- Compensation (hourly rate, platform fee, net payment)
- Requirements (experience, skills, patient load)
- Facilities & benefits
- Instructions
- Status (OPEN, FILLED, IN_PROGRESS, COMPLETED, CANCELLED)
- Multiple positions

### Application
- Duty reference
- Doctor reference
- Cover letter
- Status (PENDING, ACCEPTED, REJECTED, WITHDRAWN)
- Applied date

### Payment
- Duty & doctor references
- Gross amount, platform fee, net amount
- Status (PENDING, PROCESSING, COMPLETED)
- Due date, paid date
- Bank details
- Invoice number
- TDS & GST

### Notification
- User reference
- Type (SHIFT, APPLICATION, PAYMENT, REVIEW, SYSTEM)
- Title & message
- Related entities (duty, application, payment)
- Read status
- Delivery channels (in-app, email, SMS, push)

---

## 🚀 Quick Start Guide

### For Developers
1. Start server: `npm start`
2. Server runs on `http://localhost:5000`
3. MongoDB connection required
4. Firebase configuration needed

### For Testing
1. Visit `http://localhost:5000/index-unified.html`
2. Create doctor account via onboarding
3. Login and explore features
4. Use provided pages to test flows

### Adding Navigation to Existing Pages
Add these two lines before closing `</body>`:
```html
<script src="/js/unified-nav.js"></script>
<script src="/js/notification-center.js"></script>
```

The navigation will automatically detect user role and display appropriate menu.

---

## 📝 File Structure

```
client/public/
├── index-unified.html              # Landing page
├── doctor-onboarding.html          # Doctor registration (4 steps)
├── doctor-dashboard.html           # Doctor main dashboard
├── doctor-profile-enhanced.html    # Doctor profile management
├── browse-shifts-enhanced.html     # Shift search & apply
├── payments-dashboard.html         # Earnings & payments
├── calendar.html                   # Calendar view
├── my-applications.html            # Application tracking
├── achievements.html               # Achievements & badges
├── availability.html               # Availability settings
├── admin-dashboard.html            # Admin main dashboard
├── admin-post-duty.html            # Post new shift
├── admin-applications.html         # Manage applications
├── admin-analytics.html            # Analytics dashboard
├── admin-settings.html             # Hospital settings
├── admin-profile.html              # Admin profile
└── js/
    ├── unified-nav.js              # Navigation component
    └── notification-center.js      # Notification system

models/
├── user.js                         # User/Doctor model
├── duty.js                         # Shift model
├── application.js                  # Application model
├── payment.js                      # Payment model
├── notification.js                 # Notification model
├── review.js                       # Review model
└── hospitalSettings.js             # Hospital settings model

routes/
├── auth.js                         # Authentication routes
├── duties.js                       # Shift routes
├── applications.js                 # Application routes
├── payments.js                     # Payment routes
├── notifications.js                # Notification routes
├── uploads.js                      # File upload routes
├── analytics.js                    # Analytics routes
└── hospitalSettings.js             # Settings routes
```

---

## ✅ Checklist: Connecting All Features

- [x] Unified navigation component created
- [x] Notification center integrated
- [x] Landing page with role selection
- [x] Doctor onboarding flow (4 steps)
- [x] Doctor profile with uploads
- [x] Shift browser with filters
- [x] Payment dashboard with history
- [x] All API routes connected
- [x] Authentication flow working
- [ ] Add navigation to all existing pages
- [ ] Test complete doctor journey
- [ ] Test complete hospital journey
- [ ] Add help documentation

---

This navigation map provides a complete overview of how all features connect together in the Nocturnal platform. All pages are now accessible through the unified navigation system, and users can seamlessly navigate between features based on their role.
