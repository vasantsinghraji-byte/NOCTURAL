# Nocturnal Platform - Setup & Usage Guide

## 🚀 Quick Start

### Prerequisites
- Node.js installed
- MongoDB running (local or Atlas)
- Firebase account configured

### Environment Setup
1. Create `.env` file in root directory:
```env
MONGODB_URI=mongodb://localhost:27017/nocturnal
JWT_SECRET=your-secret-key-here
PORT=5000
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

Server will run on `http://localhost:5000`

---

## 📱 Accessing the Platform

### Landing Page
Visit: `http://localhost:5000/index.html`

**Options:**
- **Get Started** → Register as Doctor/Nurse/Hospital Admin
- **Login** → Enter credentials for existing users
  - New doctors/nurses → Automatically redirected to onboarding
  - Existing doctors → Automatically redirected to dashboard
  - Hospital admins → Automatically redirected to admin dashboard

---

## 👨‍⚕️ Doctor User Flow

### 1. Registration & Onboarding
**URL:** `/doctor-onboarding.html`

**Step 1: Account Creation**
- Enter name, email, phone
- Create password (min 6 characters)
- Firebase creates account automatically

**Step 2: Professional Details**
- MCI Registration Number
- State Medical Council (dropdown)
- Primary Specialization (18 options)
- Years of Experience
- Employment Status
- Select Procedural Skills (14+ options)

**Step 3: Document Upload**
Required documents (max 5MB each):
- MCI Registration Certificate (PDF/JPG/PNG)
- Photo ID - Aadhaar/PAN (PDF/JPG/PNG)
- MBBS Degree Certificate (PDF/JPG/PNG)
- Professional Photo (JPG/PNG)

**Step 4: Skills & Availability**
- Preferred shift times (Morning/Evening/Night/Weekend/24hr)
- Service radius (distance willing to travel)
- Minimum expected rate (₹/hour)
- City/Location
- Bank account details (for payments)

**On completion:** Redirects to Doctor Dashboard

### 2. Doctor Dashboard
**URL:** `/doctor-dashboard.html`

**Quick Access:**
- Browse Shifts
- View Calendar
- Check Applications
- See Earnings
- Update Profile

### 3. Browse & Apply for Shifts
**URL:** `/browse-duties.html`

**Features:**
- **Quick Filters:** Today, Tomorrow, This Week, Custom Date
- **Advanced Filters:**
  - Specialty (dropdown)
  - Shift Time (Morning/Evening/Night/24hr)
  - Distance (5/10/20/50 km)
  - Minimum Pay (₹/hour)
  - Hospital Rating (4.5+, 4.0+, 3.5+)
- **Sort By:** Best Match, Nearest, Highest Paid, Urgent, Soonest Date
- **Quick Apply:** One-click application submission

**Shift Cards Show:**
- Hospital name & rating
- Distance from your location
- Match score (%)
- Specialty badge
- Date, time, duration
- Hourly rate & total compensation
- Perks (meals, parking, etc.)
- Urgency indicators
- Spots remaining

**Click shift card → View full details**
**Click "Quick Apply" → Submit application**

### 4. My Profile
**URL:** `/Doctor-profile.html`

**Sections:**
- **Profile Photo:** Click camera icon to upload/change
- **Profile Strength:** See completion percentage (0-100%)
- **Key Stats:** Rating, Shifts Completed, Completion Rate
- **Documents:**
  - MCI Certificate (upload/view/status)
  - Photo ID (upload/view/status)
  - MBBS Degree (upload/view/status)
  - Status badges: ✅ Verified, ⏳ Pending, ❌ Missing
- **Professional Details:** Click "Edit" to modify
- **Skills & Expertise:** View all selected skills
- **Shift Preferences:** View preferred times
- **Bank Details:** Click "Edit" to update

### 5. Earnings & Payments
**URL:** `/earnings.html`

**Summary Cards:**
- This Month: Earnings + shift count
- Total Earned: All-time total
- Pending Payments: Amount + count
- Average Per Shift: Calculated average

**Payment History Tab:**
- Filter by time period (3/6/12 months, all time)
- View all transactions:
  - Date & hospital
  - Shift details
  - Gross amount
  - Platform fee (5%)
  - Net amount
  - Status (Paid/Pending/Processing)
  - Payment date

**Bank Details Tab:**
- View account information
- Account number (masked for security)
- IFSC code
- Bank name
- Verification status

**Tax Summary Tab:**
- Select financial year
- View yearly totals:
  - Gross income
  - Platform fees paid
  - Net income
  - Total shifts
- Monthly earnings chart
- Download PDF summary

### 6. My Calendar
**URL:** `/calendar.html`
- View confirmed shifts
- See availability
- Manage schedule

### 7. My Applications
**URL:** `/my-applications.html`
- **Pending:** Applications under review
- **Accepted:** Confirmed shifts
- **Rejected:** Declined applications
- **Withdrawn:** Canceled applications

---

## 🏥 Hospital/Admin User Flow

### 1. Admin Dashboard
**URL:** `/admin-dashboard.html`

**Quick Access:**
- Post New Shift
- Manage Applications
- View Analytics
- Settings
- Profile

### 2. Post a Shift
**URL:** `/admin-post-duty.html`

**Form Sections:**

**Basic Details:**
- Department (Emergency/ICU/OPD/Surgery/etc.)
- Specialty (dropdown with 18+ options)
- Date & time
- Duration (hours)
- Number of positions needed

**Requirements:**
- Minimum experience level
- Required skills (multi-select)
- Expected patient load (Light/Moderate/Heavy)
- Special requirements (text)

**Compensation:**
- Hourly rate (₹)
- Overtime rate (optional)
- Payment timeline (Immediate/48hrs/7days/15days)
- Platform shows market rate indicator

**Facilities & Benefits:**
- Meals provided (breakfast/lunch/dinner)
- Free parking
- Scrubs & PPE provided
- Locker facility
- WiFi available
- Doctor's lounge

**Instructions:**
- Reporting location
- Contact person & number
- Special instructions
- Documents to bring

**Submit → Shift goes live immediately**

### 3. Manage Applications
**URL:** `/admin-applications.html`

**For Each Shift:**
- View all applicants
- See match scores (%)
- Review doctor profiles:
  - Experience & qualifications
  - Skills matching
  - Ratings from previous shifts
  - Completion rate
  - Response time
- **Actions:**
  - Shortlist candidates
  - Accept application (confirms booking)
  - Reject application
  - Send message
  - Compare multiple candidates

**Applicant Profile Shows:**
- Profile photo
- Rating & reviews
- Completed shifts
- Specialty match
- Skills match
- Previous work at your hospital
- All required documents verified

### 4. Analytics Dashboard
**URL:** `/admin-analytics.html`

**Key Metrics:**
- Total shifts posted
- Fill rate (%)
- Average time to fill
- Total spend
- Budget utilization
- Quality score

**Charts & Graphs:**
- Fill rate trend (6 months)
- Budget vs. actual spend
- Quality metrics over time
- Shift distribution by specialty
- Top performing doctors
- Predictions & forecasting

**Filters:**
- Time period (month/quarter/year)
- Department
- Specialty

### 5. Hospital Settings
**URL:** `/admin-settings.html`

**Budget Settings:**
- Monthly budget (₹)
- Alert threshold (%)
- Current month tracking

**Forecasting:**
- Enable/disable predictions
- Look-ahead days (7-90)

**Notifications:**
- Email alerts (on/off)
- Budget alerts (on/off)
- Fill rate alerts (on/off)
- Quality alerts (on/off)

**Analytics Preferences:**
- Preferred metrics
- Dashboard layout

**Budget Preview:**
- Shows current utilization
- Projects end-of-month spend
- Alerts if over threshold

---

## 🔔 Notification System

### Notification Bell (Top Right)
- Shows unread count badge
- Click to open dropdown panel
- Auto-refreshes every 30 seconds

### Notification Types:
1. **Shift Notifications (Green)**
   - New matching shifts
   - Shift reminders
   - Shift cancellations

2. **Application Notifications (Blue)**
   - Application received
   - Application viewed by hospital
   - Application accepted/rejected

3. **Payment Notifications (Orange)**
   - Payment received
   - Payment pending reminder
   - Payment failed

4. **Review Notifications (Purple)**
   - New review received
   - Review reminders

5. **System Notifications (Gray)**
   - Document verified/rejected
   - Profile incomplete reminders
   - System announcements

### Actions:
- Click notification → Navigate to relevant page
- Mark as read → Updates automatically
- "Mark all read" button → Clears all
- "View All Notifications" → Go to full list

---

## 🎯 Key Features

### Smart Matching Algorithm
Calculates match score (0-100%) based on:
- **Specialty Match (40%):** Primary or secondary specialization
- **Skills Match (30%):** Required skills vs doctor skills
- **Experience Match (20%):** Years of experience requirement
- **Rating Bonus (10%):** Doctor's rating score

### Profile Strength Calculator
Tracks completion (0-100%) based on:
- Basic info (25%): Name, email, phone, photo
- Professional details (30%): MCI, specialization, experience, skills
- Documents (30%): MCI cert, photo ID, degree
- Bank details (10%): Account information
- Preferences (5%): Shift times

### Payment Processing
- **Platform Fee:** 5% (configurable)
- **Calculation:** Gross Amount - Platform Fee = Net Amount
- **Timeline Options:**
  - Immediate (within 1 hour)
  - 48 hours (standard)
  - 7 days
  - 15 days
- **Payment Methods:** Bank transfer (primary)
- **Invoice Generation:** Auto-numbered (INV-YYYYMM-XXXXXX)

---

## 🔧 Technical Details

### Authentication
- **Frontend:** Firebase Authentication (email/password)
- **Backend:** JWT + Firebase token support
- **Flow:**
  1. User signs up/logs in with Firebase
  2. Firebase generates token
  3. Token sent to backend
  4. Backend decodes token (Base64)
  5. Checks for Firebase issuer
  6. Auto-creates/fetches MongoDB user
  7. Returns user data

### File Uploads
- **Max Size:** 5MB per file
- **Allowed Types:**
  - Profile photos: JPG, JPEG, PNG
  - Documents: JPG, JPEG, PNG, PDF
- **Storage:** Local filesystem (uploads/ directory)
- **Organization:**
  - `uploads/profile-photos/`
  - `uploads/documents/mci/`
  - `uploads/documents/degrees/`
  - `uploads/documents/ids/`
  - `uploads/documents/certificates/`
- **Filename Format:** `userId_fieldname_timestamp.ext`

### Database Models
- **User:** Profile, professional details, documents, bank info
- **Duty:** Shift details, requirements, compensation, facilities
- **Application:** Doctor-shift mapping, status tracking
- **Payment:** Transaction details, invoice, bank info
- **Notification:** Multi-channel alerts, delivery tracking
- **Review:** Ratings, comments, performance metrics
- **HospitalSettings:** Budget, preferences, notifications

---

## 📲 Adding Navigation to Any Page

**Method 1: Auto-Inject (Easiest)**
Add this single line before `</body>`:
```html
<script src="/js/auto-inject-nav.js"></script>
```

**Method 2: Manual Include**
Add these lines before `</body>`:
```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
<script src="/js/unified-nav.js"></script>
<script src="/js/notification-center.js"></script>
```

**The navigation will automatically:**
- Detect user role (doctor/admin)
- Show appropriate menu items
- Display notification bell
- Show user profile dropdown
- Highlight active page
- Work on mobile (hamburger menu)

---

## 🧪 Testing Checklist

### Doctor Journey
- [ ] Complete onboarding (all 4 steps)
- [ ] Upload profile photo
- [ ] Upload all documents
- [ ] Browse shifts with filters
- [ ] Apply for a shift
- [ ] View application status
- [ ] Check payment history
- [ ] Update bank details
- [ ] View notifications

### Hospital Journey
- [ ] Login as admin
- [ ] Post a new shift
- [ ] View applications for shift
- [ ] Accept an application
- [ ] Check analytics dashboard
- [ ] Update budget settings
- [ ] Create payment record
- [ ] View payment list

### System Features
- [ ] Navigation appears on all pages
- [ ] Notification bell updates
- [ ] Role-based menu displays correctly
- [ ] Mobile menu works
- [ ] File uploads succeed
- [ ] Authentication works
- [ ] API endpoints respond

---

## 🐛 Common Issues & Solutions

### Issue: 404 Not Found on API calls
**Solution:** Ensure server is running on port 5000
```bash
npm start
```

### Issue: Firebase authentication error
**Solution:** Check Firebase config in HTML files:
- API key correct
- Auth domain correct
- Project ID correct

### Issue: MongoDB connection failed
**Solution:** Check `.env` file has correct MONGODB_URI

### Issue: Files not uploading
**Solution:** Check uploads/ directory exists and has write permissions

### Issue: Navigation not appearing
**Solution:** Include the auto-inject script or manual includes

### Issue: Notifications not loading
**Solution:** Check localStorage has valid token
```javascript
localStorage.getItem('token')
```

---

## 📚 API Documentation

### Base URL
```
http://localhost:5000/api
```

### Headers Required
```
Authorization: Bearer <firebase-token>
Content-Type: application/json (for JSON payloads)
```

### Example: Get Current User
```javascript
const response = await fetch('http://localhost:5000/api/auth/me', {
    headers: {
        'Authorization': `Bearer ${token}`
    }
});
const data = await response.json();
console.log(data.user);
```

### Example: Apply for Shift
```javascript
const response = await fetch('http://localhost:5000/api/applications', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        dutyId: 'shift-id-here',
        coverLetter: 'I am interested in this position...'
    })
});
const data = await response.json();
```

See `PLATFORM_NAVIGATION.md` for complete API endpoint list.

---

## 🎨 Customization

### Colors
Edit color variables in any CSS file:
```css
:root {
    --primary: #5B8DBE;      /* Main brand color */
    --success: #28a745;      /* Success states */
    --danger: #dc3545;       /* Error/warning states */
    --warning: #ffc107;      /* Warning states */
    --dark: #2C3E50;         /* Dark text */
}
```

### Logo
Replace the moon emoji (🌙) in:
- `js/unified-nav.js` (line ~183)
- `index-unified.html` (line ~38)

### Platform Fee
Edit in `models/duty.js` (line ~85):
```javascript
platformFee: {
    type: Number,
    default: 5  // Change this percentage
}
```

---

## 🚀 Deployment Checklist

- [ ] Update Firebase config with production credentials
- [ ] Update API_URL in all files (currently localhost:5000)
- [ ] Set strong JWT_SECRET in .env
- [ ] Configure production MongoDB URI
- [ ] Set up file upload storage (S3/Cloudinary)
- [ ] Enable HTTPS
- [ ] Set up domain
- [ ] Configure email service for notifications
- [ ] Configure SMS service for alerts
- [ ] Set up backup system
- [ ] Enable monitoring & logging
- [ ] Test all user flows
- [ ] Load test the system

---

## 📞 Support

For issues or questions:
1. Check this guide
2. Review `PLATFORM_NAVIGATION.md`
3. Check console for errors (F12)
4. Verify server logs
5. Check MongoDB connection

---

## 🎉 You're All Set!

The platform is now fully connected and ready to use. Start by visiting:
**http://localhost:5000/index-unified.html**

Enjoy using Nocturnal! 🌙
