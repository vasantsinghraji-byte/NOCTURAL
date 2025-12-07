# Analytics Dashboard - Real Data Integration Guide

## Overview
The analytics dashboard now uses **real data** from your database instead of mock/fake data. Admins can also configure their monthly budget and settings through a new Settings page.

---

## 🎯 What Changed

### 1. New Backend Components

#### **Hospital Settings Model** (`models/hospitalSettings.js`)
Stores hospital-specific configuration:
- **Monthly Budget**: Set your budget for doctor shifts per month
- **Alert Threshold**: Get notified when % of budget is used (default: 80%)
- **Forecasting Settings**: Enable/disable predictions, set forecast period
- **Auto-Accept Settings**: Automatically accept high-rated doctors
- **Preferred Doctors List**: Mark doctors for priority hiring
- **Notification Preferences**: Email alerts, budget alerts, staffing gap alerts
- **Analytics Preferences**: Default date ranges, show/hide predictions

#### **Real Analytics API** (`routes/analytics.js`)
New endpoint: `GET /api/analytics/hospital/dashboard`

This endpoint calculates **real-time analytics** from your database:

**Key Metrics:**
- Total duties posted
- Fill rate (% of duties filled)
- Average time to fill (in hours)
- Total spend (current month)

**Budget Analysis:**
- Monthly budget (from settings)
- Amount spent this month
- Remaining budget
- Budget usage percentage

**Predictive Forecasting:**
- Upcoming shifts (next 2 weeks)
- Staffing gap (unfilled upcoming shifts)
- Estimated cost for upcoming shifts

**Top Doctors:**
- Doctors who worked most shifts
- Their ratings, experience, shifts completed

**Fill Rate Trend:**
- Last 6 months fill rate history
- Month-by-month comparison

**Cost Optimization:**
- Identifies opportunities to save money
- Suggests improvements (post earlier, build preferred list, etc.)

**AI Recommendations:**
- Action items based on data
- Priority levels (HIGH/MEDIUM/LOW)
- Expected costs

---

## 💰 How to Set Your Monthly Budget

### Step 1: Navigate to Settings
1. Log in as a hospital admin
2. Click **"Settings"** in the navigation menu
3. You'll see the **Analytics & Budget Settings** page

### Step 2: Configure Budget
1. **Monthly Budget (₹)**: Enter your total budget for doctor shifts per month
   - Example: `500000` for ₹5 lakh
   - This is the maximum you want to spend on shifts monthly

2. **Budget Alert Threshold (%)**: Set when to get alerts
   - Default: `80%` (alert when 80% of budget is used)
   - Adjust based on your needs (50%, 70%, 90%, etc.)

### Step 3: Configure Other Settings

**Forecasting Settings:**
- ✅ **Enable AI Forecasting**: Get predictive insights
- **Forecast Period**: Choose how far ahead to predict (1 week to 3 months)

**Notification Preferences:**
- ✅ **Email Alerts**: General notifications
- ✅ **Budget Alerts**: When approaching budget threshold
- ✅ **Staffing Gap Alerts**: When upcoming shifts are unfilled
- ✅ **New Application Alerts**: When doctors apply

**Analytics Preferences:**
- **Default Date Range**: Last 7/30/90 days or year
- ✅ **Show Predictions**: Display AI forecasts on dashboard

### Step 4: Save Settings
Click **"Save All Settings"** button at the bottom

You'll see a success message and a **Budget Preview** showing:
- Monthly Budget
- Spent This Month
- Remaining
- Usage %

---

## 📊 Analytics Dashboard - Real Data Explained

### Where the Data Comes From

#### **1. Duties Posted**
- Counts all duties you've created
- Source: `Duty` collection in MongoDB
- Filter: `postedBy` matches your hospital ID

#### **2. Fill Rate**
- Formula: `(Filled Duties / Total Duties) * 100`
- A duty is "FILLED" when you accept an application
- Industry average shown for comparison (79%)

#### **3. Average Time to Fill**
- Calculates hours between posting a duty and accepting an applicant
- Only includes filled duties
- Helps identify how quickly you hire

#### **4. Total Spend**
- Sums the `salary` field of all duties posted **this month**
- Current month = from 1st of month to today
- Updates in real-time as you post/accept duties

#### **5. Budget Section**
- **Monthly Budget**: From your settings
- **Spent**: Total spend this month (calculated above)
- **Remaining**: Budget - Spent
- **% Used**: (Spent / Budget) * 100
- **Alert**: Shows if you've exceeded threshold

#### **6. Predictive Forecasting (Next 2 Weeks)**
- **Predicted Shifts**: Counts duties with dates in next 14 days
- **Staffing Gap**: How many of those shifts are still OPEN (unfilled)
- **High Demand Warning**: Shows if gap > 0

#### **7. Fill Rate Trend Chart**
- Shows last 6 months of data
- Calculates fill rate for each month
- Line chart comparing to industry average (79%)

#### **8. Budget Doughnut Chart**
- Visual representation of Spent vs Remaining
- Red = Spent, Green = Remaining
- Updates based on your budget settings

#### **9. Top Performing Doctors**
- Lists doctors who've completed most shifts with you
- Shows: Name, Rating, Experience, Shifts Completed
- Sorted by shifts (most to least)

#### **10. Cost Optimization Opportunities**
- **Time to Fill Issue**: If avg time > 48 hours, suggests posting earlier
- **Staffing Gap**: If > 3 upcoming unfilled shifts, alerts you
- **Preferred Doctors**: If < 5 in your list, suggests building it
- Shows potential savings for each

#### **11. AI Recommendations**
- **Fill Staffing Gaps**: If unfilled shifts exist
- **Budget Alert**: If near/over budget threshold
- **Pending Applications**: If > 5 applications waiting
- Each has priority and expected cost

---

## 🔧 API Endpoints Created

### 1. Hospital Settings API
```
GET    /api/hospital-settings          - Get current settings
PUT    /api/hospital-settings          - Update settings
POST   /api/hospital-settings/preferred-doctors    - Add preferred doctor
DELETE /api/hospital-settings/preferred-doctors/:id - Remove preferred doctor
```

### 2. Analytics Dashboard API
```
GET    /api/analytics/hospital/dashboard   - Get real-time analytics data
```

**Response Structure:**
```json
{
  "success": true,
  "data": {
    "keyMetrics": {
      "totalPosted": 45,
      "openDuties": 8,
      "fillRate": 82,
      "avgTimeToFill": 6,
      "totalSpend": 450000
    },
    "budget": {
      "monthlyBudget": 500000,
      "spent": 450000,
      "remaining": 50000,
      "percentUsed": 90,
      "alertThreshold": 80
    },
    "predictions": {
      "nextTwoWeeks": 12,
      "staffingGap": 3,
      "upcomingDuties": [...]
    },
    "topDoctors": [...],
    "fillRateTrend": [...],
    "optimizationOpportunities": [...],
    "recommendations": [...],
    "qualityMetrics": {...}
  }
}
```

---

## 📝 Files Created/Modified

### New Files Created:
1. **`models/hospitalSettings.js`** - Hospital settings schema
2. **`routes/hospitalSettings.js`** - Settings API endpoints
3. **`client/public/admin-settings.html`** - Settings configuration page

### Modified Files:
1. **`routes/analytics.js`** - Added `/hospital/dashboard` endpoint with real calculations
2. **`server.js`** - Registered hospital settings routes
3. **`client/public/admin-analytics.html`** - Updated to fetch and display real data
4. **All admin navigation** - Added "Settings" link to:
   - `admin-dashboard.html`
   - `admin-post-duty.html`
   - `admin-applications.html`
   - `admin-analytics.html`
   - `admin-profile.html`

---

## 🚀 How to Use the System

### First Time Setup:
1. **Login as hospital admin**
2. **Go to Settings** (new link in navigation)
3. **Set your monthly budget** (e.g., ₹500,000)
4. **Configure alert threshold** (e.g., 80%)
5. **Enable forecasting and notifications**
6. **Click "Save All Settings"**

### Viewing Analytics:
1. **Go to Analytics** (in navigation)
2. Dashboard now shows **real data** based on:
   - Your posted duties
   - Accepted applications
   - Actual salaries paid
   - Your budget settings

### Understanding the Data:
- **If you haven't posted duties yet**: Metrics will show 0 or empty
- **As you post duties**: Total Posted increases
- **As doctors apply**: Applications count increases
- **As you accept applications**: Fill Rate increases, Total Spend increases
- **Budget tracking**: Compares spending against your set budget
- **Forecasting**: Shows upcoming unfilled shifts based on duty dates

---

## 🎨 Visual Indicators

### Budget Status Colors:
- **Green**: Under budget threshold (< 80% used)
- **Yellow**: Near threshold (80-99% used)
- **Red**: Over budget (≥ 100% used)

### Fill Rate Performance:
- **Green**: Above industry avg (> 79%)
- **Yellow**: At industry avg (≈ 79%)
- **Red**: Below industry avg (< 79%)

### Priority Levels:
- **HIGH**: 🔴 Urgent action needed
- **MEDIUM**: 🟡 Should address soon
- **LOW**: 🟢 Nice to have

---

## 💡 Pro Tips

### 1. Set Realistic Budgets
- Review past spending history
- Add 10-15% buffer for unexpected needs
- Adjust monthly based on seasonal demand

### 2. Monitor Staffing Gaps
- Check forecasting section weekly
- Post duties at least 2 weeks in advance
- Build a preferred doctors list for faster hiring

### 3. Optimize Costs
- Follow optimization suggestions
- Post duties earlier to get better rates
- Use preferred doctors to reduce time-to-fill

### 4. Track Trends
- Monitor fill rate trend chart
- If declining, investigate why
- Compare to industry average (79%)

### 5. Respond to Alerts
- Set up notifications
- Act quickly when budget threshold is reached
- Review pending applications daily

---

## 🐛 Troubleshooting

### "Analytics showing all zeros"
**Solution**: You need to:
1. Post some duties first
2. Have doctors apply
3. Accept some applications
Then data will populate

### "Budget section shows 0"
**Solution**:
1. Go to Settings page
2. Enter your monthly budget
3. Click Save
Budget tracking will then work

### "Charts not displaying"
**Solution**:
- Ensure you have historical data (duties from past months)
- Clear browser cache
- Check browser console for errors

### "Forecasting shows 0 upcoming shifts"
**Solution**:
- You need to post duties with future dates (next 2 weeks)
- System only forecasts based on actual duty postings

---

## 📧 Support

If you encounter issues:
1. Check browser console (F12) for errors
2. Verify MongoDB connection
3. Ensure backend server is running
4. Check that you're logged in as hospital admin

---

## 🔐 Security Notes

- All endpoints require authentication (`protect` middleware)
- Settings are hospital-specific (one per hospital)
- Budget data is private to each hospital
- Analytics only show your own duties/applications

---

## ✅ Next Steps

1. ✅ Set your monthly budget in Settings
2. ✅ Post some duties to start collecting data
3. ✅ Review analytics dashboard weekly
4. ✅ Act on AI recommendations
5. ✅ Monitor budget usage throughout the month
6. ✅ Adjust settings as needed

---

**Your analytics dashboard is now powered by real data!** 🎉

The more duties you post and applications you process, the more accurate and valuable the insights become.
