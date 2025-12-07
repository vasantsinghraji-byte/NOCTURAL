# Nocturnal Platform - Complete API Documentation

## Base URL
```
http://localhost:5000/api
```

## Authentication
All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## 📅 CALENDAR & AVAILABILITY APIs

### Calendar Events

#### Get Calendar Events
```http
GET /api/calendar/events
```
**Query Parameters:**
- `startDate` (optional) - ISO date string
- `endDate` (optional) - ISO date string
- `eventType` (optional) - SHIFT_ACCEPTED, SHIFT_PENDING, BLACKOUT_DATE, etc.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "title": "ICU Night Shift",
      "eventType": "SHIFT_ACCEPTED",
      "startDate": "2025-03-15T00:00:00Z",
      "endDate": "2025-03-15T00:00:00Z",
      "startTime": "20:00",
      "endTime": "06:00",
      "color": "#28a745",
      "location": "Apollo Hospital, Jaipur",
      "distance": 5.2,
      "travelTime": 15,
      "conflicts": [],
      "warnings": []
    }
  ]
}
```

#### Create Calendar Event
```http
POST /api/calendar/events
```
**Body:**
```json
{
  "title": "Personal Event",
  "eventType": "BLACKOUT_DATE",
  "startDate": "2025-03-20",
  "endDate": "2025-03-25",
  "allDay": true
}
```

#### Check Conflicts
```http
POST /api/calendar/conflicts/check
```
**Body:**
```json
{
  "dutyId": "duty_id_here"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "hasConflicts": true,
    "conflicts": [
      {
        "conflictType": "OVERLAP",
        "severity": "HIGH",
        "message": "This shift conflicts with your duty at Apollo on March 15"
      }
    ],
    "blockedBy": [
      {
        "type": "VACATION",
        "reason": "Spring break"
      }
    ],
    "weeklyHours": 62,
    "warnings": [
      {
        "type": "WEEKLY_HOURS_EXCEEDED",
        "message": "You've worked 62 hours this week - Rest recommended",
        "severity": "WARNING"
      }
    ]
  }
}
```

#### Sync External Calendar
```http
POST /api/calendar/sync
```
**Body:**
```json
{
  "provider": "GOOGLE",
  "events": [
    {
      "title": "Family Event",
      "start": "2025-03-10T10:00:00Z",
      "end": "2025-03-10T12:00:00Z",
      "allDay": false
    }
  ]
}
```

### Availability Settings

#### Get Availability Settings
```http
GET /api/calendar/availability
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "type": "RECURRING",
      "recurring": {
        "dayOfWeek": [0, 6],
        "unavailable": true
      },
      "active": true
    },
    {
      "_id": "...",
      "type": "VACATION",
      "dateRange": {
        "startDate": "2025-03-01",
        "endDate": "2025-03-15",
        "reason": "Family vacation"
      },
      "active": true,
      "autoRejectNonMatching": true
    }
  ]
}
```

#### Create Availability Block
```http
POST /api/calendar/availability
```
**Body Examples:**

**Recurring Unavailability:**
```json
{
  "type": "RECURRING",
  "recurring": {
    "dayOfWeek": [0, 6],
    "unavailable": true
  },
  "autoRejectNonMatching": false
}
```

**Vacation Mode:**
```json
{
  "type": "VACATION",
  "dateRange": {
    "startDate": "2025-03-01",
    "endDate": "2025-03-15",
    "reason": "Annual leave"
  },
  "autoRejectNonMatching": true
}
```

**Preferred Hours:**
```json
{
  "type": "PREFERRED_HOURS",
  "preferredHours": {
    "earliestStart": "09:00",
    "latestEnd": "17:00",
    "flexible": false
  }
}
```

**Max Shifts:**
```json
{
  "type": "MAX_SHIFTS",
  "maxShifts": {
    "perWeek": 5,
    "perMonth": 20,
    "maxHoursPerWeek": 60
  }
}
```

#### Update Availability
```http
PUT /api/calendar/availability/:id
```

#### Delete Availability
```http
DELETE /api/calendar/availability/:id
```

---

## 💰 EARNINGS & FINANCIAL APIs

### Earnings

#### Get Earnings History
```http
GET /api/earnings
```
**Query Parameters:**
- `year` (optional) - e.g., 2025
- `month` (optional) - 1-12
- `status` (optional) - PENDING, PAID, OVERDUE, DISPUTED

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "hospital": "Apollo Hospital",
      "shiftDate": "2025-03-15",
      "hoursWorked": 10,
      "hourlyRate": 4500,
      "totalAmount": 45000,
      "bonuses": [
        {
          "type": "WEEKEND",
          "amount": 9000,
          "description": "20% weekend bonus"
        }
      ],
      "deductions": [
        {
          "type": "TDS",
          "amount": 4500,
          "description": "10% TDS"
        }
      ],
      "netAmount": 49500,
      "paymentStatus": "PAID",
      "paymentDate": "2025-03-20",
      "invoiceNumber": "INV-202503-1234"
    }
  ]
}
```

#### Get Earnings Dashboard
```http
GET /api/earnings/dashboard
```

**Response:**
```json
{
  "success": true,
  "data": {
    "currentMonth": {
      "totalEarnings": 245000,
      "netEarnings": 220500,
      "hoursWorked": 48,
      "shiftsCompleted": 6,
      "avgRate": 5104,
      "monthlyGoal": 300000,
      "goalProgress": 82
    },
    "breakdown": {
      "paid": 180000,
      "pending": 45000,
      "overdue": 20000
    },
    "comparison": {
      "lastMonth": 213000,
      "change": 15
    },
    "paymentTimeline": {
      "upcoming": [...],
      "overdue": [...]
    }
  }
}
```

#### Get Rate Intelligence
```http
GET /api/earnings/rate-intelligence/:dutyId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "dutyRate": 4200,
    "marketIntelligence": {
      "averageForSpecialty": 4500,
      "hospitalUsuallyPays": 4800,
      "weekendBonusAvailable": 20,
      "comparison": "BELOW_MARKET"
    },
    "suggestion": {
      "negotiateFor": 5000,
      "successRate": 67,
      "reasoning": "This rate is below market average. Negotiation recommended."
    }
  }
}
```

#### Get Earning Optimizer
```http
GET /api/earnings/optimizer
```

**Response:**
```json
{
  "success": true,
  "data": {
    "currentWeek": {
      "earnings": 150000,
      "hours": 36
    },
    "suggestions": [
      {
        "title": "ICU Coverage",
        "hospital": "Apollo",
        "date": "2025-03-18",
        "hourlyRate": 5200,
        "totalCompensation": 48000
      }
    ],
    "potential": {
      "totalEarnings": 195000,
      "additionalHours": 12,
      "networkAverage": 145000,
      "exceedsLimit": false,
      "warning": null
    }
  }
}
```

#### Create Earning Record (Admin)
```http
POST /api/earnings
```

#### Update Payment Status (Admin)
```http
PUT /api/earnings/:id/payment-status
```
**Body:**
```json
{
  "paymentStatus": "PAID",
  "paymentMethod": "BANK_TRANSFER",
  "paymentDate": "2025-03-20"
}
```

#### Raise Payment Dispute
```http
POST /api/earnings/:id/dispute
```
**Body:**
```json
{
  "reason": "Payment not received despite confirmed completion"
}
```

---

## 📜 CERTIFICATIONS APIs

#### Get Certifications
```http
GET /api/certifications
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "name": "MBBS",
      "type": "DEGREE",
      "issuingAuthority": "Medical Council of India",
      "licenseNumber": "MCI123456",
      "issueDate": "2015-05-20",
      "expiryDate": null,
      "status": "ACTIVE",
      "verificationStatus": "VERIFIED"
    },
    {
      "_id": "...",
      "name": "BLS Certification",
      "type": "CERTIFICATION",
      "issuingAuthority": "American Heart Association",
      "issueDate": "2024-01-15",
      "expiryDate": "2025-03-30",
      "status": "EXPIRING_SOON",
      "verificationStatus": "VERIFIED",
      "renewalUrl": "https://...",
      "impactOnMatches": "+12% more duty matches"
    }
  ]
}
```

#### Get Expiring Certifications
```http
GET /api/certifications/expiring?daysAhead=30
```

#### Add Certification
```http
POST /api/certifications
```
**Body:**
```json
{
  "name": "ACLS Certification",
  "type": "CERTIFICATION",
  "issuingAuthority": "American Heart Association",
  "licenseNumber": "ACLS789",
  "issueDate": "2024-06-01",
  "expiryDate": "2026-06-01",
  "documentUrl": "https://storage.../acls-cert.pdf"
}
```

#### Update Certification
```http
PUT /api/certifications/:id
```

#### Delete Certification
```http
DELETE /api/certifications/:id
```

#### Verify Certification (Admin)
```http
POST /api/certifications/:id/verify
```
**Body:**
```json
{
  "verificationStatus": "VERIFIED"
}
```

---

## ⭐ REVIEWS & RATINGS APIs

#### Get User Reviews
```http
GET /api/reviews/user/:userId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reviews": [
      {
        "_id": "...",
        "rating": 5,
        "ratings": {
          "punctuality": 5,
          "professionalism": 5,
          "clinicalSkills": 5,
          "communication": 5,
          "teamwork": 5
        },
        "comment": "Excellent doctor, punctual and professional",
        "performanceMetrics": {
          "arrivedOnTime": true,
          "minutesLate": 0,
          "completedFullShift": true,
          "wouldRehire": true
        },
        "reviewer": {
          "name": "Apollo Hospital",
          "hospital": "Apollo Hospital Jaipur"
        },
        "duty": {
          "title": "ICU Night Coverage",
          "date": "2025-03-15"
        },
        "createdAt": "2025-03-16"
      }
    ],
    "summary": {
      "avgRating": 4.8,
      "totalReviews": 24,
      "avgPunctuality": 4.9,
      "avgProfessionalism": 4.8,
      "avgClinicalSkills": 4.7,
      "avgCommunication": 4.8,
      "avgTeamwork": 4.9,
      "wouldRehirePercentage": 96
    }
  }
}
```

#### Get My Reviews
```http
GET /api/reviews/my-reviews
```

#### Create Review (Admin Only)
```http
POST /api/reviews
```
**Body:**
```json
{
  "duty": "duty_id",
  "reviewedUser": "user_id",
  "ratings": {
    "punctuality": 5,
    "professionalism": 5,
    "clinicalSkills": 5,
    "communication": 5,
    "teamwork": 5
  },
  "comment": "Excellent performance",
  "performanceMetrics": {
    "arrivedOnTime": true,
    "completedFullShift": true,
    "wouldRehire": true
  },
  "tags": ["EXCELLENT_WORK", "PUNCTUAL", "PROFESSIONAL"]
}
```

#### Respond to Review
```http
PUT /api/reviews/:id/respond
```
**Body:**
```json
{
  "comment": "Thank you for the positive feedback!"
}
```

#### Mark Review as Helpful
```http
POST /api/reviews/:id/helpful
```

---

## 🏆 ACHIEVEMENTS & GAMIFICATION APIs

#### Get User Achievements
```http
GET /api/achievements
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "type": "FIRST_SHIFT",
      "title": "First Shift Completed",
      "description": "Completed your first shift on Nocturnal",
      "icon": "🏆",
      "earnedAt": "2025-01-15",
      "progress": {
        "current": 1,
        "target": 1,
        "unit": "shifts"
      },
      "reward": "BADGE",
      "tier": "BRONZE",
      "visible": true
    },
    {
      "_id": "...",
      "type": "MILESTONE_100",
      "title": "100 Shifts Milestone",
      "description": "Completed 100 shifts successfully",
      "icon": "💎",
      "earnedAt": "2025-03-10",
      "reward": "BONUS",
      "rewardAmount": 5000,
      "rewardClaimed": false,
      "tier": "PLATINUM"
    }
  ]
}
```

#### Get Leaderboard
```http
GET /api/achievements/leaderboard?category=shifts&period=month
```

**Query Parameters:**
- `category` - shifts, earnings, rating
- `period` - month, year, alltime

**Response:**
```json
{
  "success": true,
  "data": {
    "leaderboard": [
      {
        "rank": 1,
        "user": {
          "name": "Dr. Sharma",
          "specialty": "Cardiology"
        },
        "shifts": 18,
        "earnings": 245000,
        "rating": 4.9,
        "badges": 12
      },
      {
        "rank": 2,
        "user": {
          "name": "Dr. Patel",
          "specialty": "ICU"
        },
        "shifts": 16,
        "earnings": 210000,
        "rating": 4.8,
        "badges": 10
      }
    ],
    "userRank": 3,
    "category": "shifts",
    "period": "month"
  }
}
```

#### Claim Achievement Reward
```http
POST /api/achievements/:id/claim
```

#### Share Achievement
```http
POST /api/achievements/:id/share
```
**Body:**
```json
{
  "platform": "LINKEDIN"
}
```

---

## 💬 MESSAGING APIs

#### Get Conversations
```http
GET /api/messages/conversations
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "participants": [
        {
          "name": "Dr. Kumar",
          "role": "doctor"
        },
        {
          "name": "Apollo Hospital",
          "role": "admin",
          "hospital": "Apollo Hospital Jaipur"
        }
      ],
      "lastMessage": {
        "content": "Thank you for accepting my application",
        "createdAt": "2025-03-15T10:30:00Z"
      },
      "lastMessageAt": "2025-03-15T10:30:00Z",
      "unreadCount": 2,
      "dutyRelated": {
        "title": "ICU Night Coverage",
        "date": "2025-03-20"
      }
    }
  ]
}
```

#### Get Messages in Conversation
```http
GET /api/messages/conversation/:conversationId?limit=50&before=2025-03-15T12:00:00Z
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "sender": {
        "name": "Dr. Kumar",
        "role": "doctor"
      },
      "content": "Thank you for accepting my application. Looking forward to working with you!",
      "messageType": "TEXT",
      "readStatus": {
        "isRead": true,
        "readAt": "2025-03-15T10:35:00Z"
      },
      "deliveryStatus": "READ",
      "createdAt": "2025-03-15T10:30:00Z"
    }
  ]
}
```

#### Send Message
```http
POST /api/messages/send
```
**Body:**
```json
{
  "recipientId": "user_id",
  "content": "Thank you for accepting my application",
  "messageType": "TEXT",
  "templateType": "THANK_YOU",
  "dutyId": "duty_id"
}
```

#### Get Message Templates
```http
GET /api/messages/templates
```

**Response:**
```json
{
  "success": true,
  "data": {
    "THANK_YOU": "Thank you for accepting my application. Looking forward to working with you!",
    "APPLICATION_ACCEPTED": "Your application has been accepted. We look forward to having you on our team!",
    "DISCUSS_SHIFT": "I would like to discuss the shift details. Can we schedule a call?",
    "RESCHEDULE_REQUEST": "I need to reschedule due to an emergency. Could we discuss alternative dates?",
    "PAYMENT_REMINDER": "This is a friendly reminder about the pending payment for the shift completed on {date}.",
    "REVIEW_REQUEST": "Thank you for completing the shift. We would appreciate your feedback!"
  }
}
```

#### Get Unread Count
```http
GET /api/messages/unread-count
```

---

## 📊 ANALYTICS APIs

#### Get Doctor Analytics
```http
GET /api/analytics/doctor
```
**Access:** Doctor/Nurse only

**Response:**
```json
{
  "success": true,
  "data": {
    "applicationStats": {
      "totalApplied": 45,
      "totalAccepted": 12,
      "totalRejected": 28,
      "totalWithdrawn": 5,
      "successRate": 27,
      "avgResponseTime": 15,
      "fastestResponse": 2
    },
    "performanceBySpecialty": {
      "Cardiology": {
        "applied": 20,
        "accepted": 7,
        "successRate": 35
      }
    },
    "shiftStats": {
      "totalCompleted": 127,
      "totalCancelled": 3,
      "completionRate": 98,
      "totalHoursWorked": 1245,
      "avgHoursPerShift": 9.8,
      "punctualityScore": 95
    },
    "earningsAnalytics": {
      "totalEarnings": 5500000,
      "thisMonthEarnings": 245000,
      "lastMonthEarnings": 213000,
      "avgHourlyRate": 4420,
      "highestHourlyRate": 5500
    },
    "rankings": {
      "overallRank": 3,
      "specialtyRank": 1,
      "locationRank": 2,
      "percentile": 92
    }
  }
}
```

#### Get Hospital Analytics
```http
GET /api/analytics/hospital
```
**Access:** Admin only

**Response:**
```json
{
  "success": true,
  "data": {
    "dutyStats": {
      "totalPosted": 45,
      "totalFilled": 38,
      "totalCancelled": 2,
      "totalOpen": 5,
      "fillRate": 84,
      "avgTimeToFill": 6.2,
      "avgApplicationsPerDuty": 8.4
    },
    "applicantStats": {
      "totalApplicationsReceived": 378,
      "totalAccepted": 38,
      "totalRejected": 340,
      "acceptanceRate": 72,
      "avgDoctorRating": 4.7
    },
    "financialStats": {
      "totalBudget": 500000,
      "totalSpent": 345000,
      "remainingBudget": 155000,
      "avgCostPerShift": 9079,
      "onTimePaymentRate": 98
    },
    "predictions": {
      "nextMonthDemand": 52,
      "estimatedCost": 468000,
      "staffingGap": 6
    }
  }
}
```

#### Get Application Insights
```http
GET /api/analytics/application-insights/:dutyId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "competition": {
      "totalApplicants": 47,
      "message": "High competition"
    },
    "possibleReasons": [
      {
        "reason": "Selected doctor has higher rating",
        "detail": "4.9★ vs your 4.2★"
      },
      {
        "reason": "Selected doctor has more experience",
        "detail": "85 shifts vs your 45 shifts"
      },
      {
        "reason": "Faster response time by other applicant",
        "detail": "Applied 45 min after posting"
      }
    ],
    "suggestions": [
      {
        "action": "Complete profile 100%",
        "current": "78%",
        "impact": "Increases visibility and trust"
      },
      {
        "action": "Get more reviews from past shifts",
        "current": "4.2★",
        "impact": "Higher ratings improve acceptance rate"
      },
      {
        "action": "Apply within first 2 hours of posting",
        "impact": "Early applicants have 2.3x higher success rate"
      }
    ]
  }
}
```

#### Update Doctor Analytics
```http
POST /api/analytics/update-doctor/:userId
```
**Access:** System/Admin

---

## 🔄 SHIFT SERIES APIs

#### Get Available Shift Series
```http
GET /api/shift-series?specialty=Cardiology&status=OPEN
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "title": "ICU Night Coverage - Monday to Friday",
      "description": "5-night ICU coverage series",
      "hospital": "Apollo Hospital",
      "specialty": "ICU",
      "totalShifts": 5,
      "filledShifts": 0,
      "seriesDiscount": 10,
      "baseHourlyRate": 5000,
      "discountedRate": 4500,
      "totalCompensation": 225000,
      "shifts": [
        {
          "date": "2025-03-15",
          "startTime": "20:00",
          "endTime": "06:00",
          "status": "PENDING"
        }
      ],
      "status": "OPEN",
      "acceptPartialSeries": false
    }
  ]
}
```

#### Get Shift Series Details
```http
GET /api/shift-series/:id
```

#### Create Shift Series (Admin)
```http
POST /api/shift-series
```
**Body:**
```json
{
  "title": "ICU Night Coverage Series",
  "description": "Week-long ICU night coverage",
  "hospital": "Apollo Hospital",
  "specialty": "ICU",
  "location": "Jaipur",
  "seriesType": "CONSECUTIVE_DAYS",
  "shifts": [
    {
      "date": "2025-03-15",
      "startTime": "20:00",
      "endTime": "06:00",
      "hourlyRate": 5000
    },
    {
      "date": "2025-03-16",
      "startTime": "20:00",
      "endTime": "06:00",
      "hourlyRate": 5000
    }
  ],
  "totalShifts": 5,
  "seriesDiscount": 10,
  "baseHourlyRate": 5000,
  "acceptPartialSeries": false
}
```

#### Apply for Shift Series
```http
POST /api/shift-series/:id/apply
```
**Body:**
```json
{
  "appliedFor": "FULL_SERIES",
  "coverLetter": "I am interested in covering all shifts in this series..."
}
```

OR for partial:
```json
{
  "appliedFor": "PARTIAL",
  "selectedShifts": [0, 2, 4],
  "coverLetter": "I can cover shifts on Mon, Wed, Fri..."
}
```

#### Accept/Reject Series Application (Admin)
```http
PUT /api/shift-series/:id/applications/:appId
```
**Body:**
```json
{
  "status": "ACCEPTED"
}
```

#### Create Individual Duties from Series (Admin)
```http
POST /api/shift-series/:id/create-duties
```

#### Get My Posted Series (Admin)
```http
GET /api/shift-series/my/posted
```

---

## 🔐 ERROR CODES

### Common Error Responses

**400 Bad Request**
```json
{
  "success": false,
  "message": "Validation error",
  "error": "Detailed error message"
}
```

**401 Unauthorized**
```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

**404 Not Found**
```json
{
  "success": false,
  "message": "Resource not found"
}
```

**500 Server Error**
```json
{
  "success": false,
  "message": "Server error",
  "error": "Error details"
}
```

---

## 📝 Usage Examples

### Complete Flow: Doctor Applying to a Duty with Conflict Check

```javascript
// 1. Check for conflicts
const conflictCheck = await fetch('/api/calendar/conflicts/check', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ dutyId: 'duty_123' })
});

const conflicts = await conflictCheck.json();

if (conflicts.data.hasConflicts) {
  // Show warnings to user
  showWarnings(conflicts.data);

  // Ask for confirmation
  if (!await confirmApplication()) {
    return;
  }
}

// 2. Apply for duty
const application = await fetch('/api/applications', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    duty: 'duty_123',
    coverLetter: 'I am interested in this position...'
  })
});

// 3. Calendar event is automatically created as SHIFT_PENDING
```

### Complete Flow: Admin Reviewing Applications with AI Ranking

```javascript
// 1. Get duty details with applications
const duty = await fetch('/api/duties/duty_123', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// 2. Get applications with populated applicant data
const applications = await fetch('/api/applications/duty/duty_123', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const apps = await applications.json();

// Applications are pre-sorted by match score
// [0] = best match, [n] = worst match

// 3. Accept best applicant
await fetch(`/api/applications/${apps.data[0]._id}`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'ACCEPTED' })
});

// 4. Duty status automatically updated
// Calendar event created for doctor
// Notification sent to doctor
```

---

## 🎯 Quick Reference

### Most Used Endpoints

**For Doctors:**
```
GET    /api/calendar/events           - View calendar
POST   /api/calendar/conflicts/check  - Check before apply
GET    /api/earnings/dashboard        - View earnings
GET    /api/achievements              - View achievements
GET    /api/messages/conversations    - View messages
GET    /api/analytics/doctor          - View stats
```

**For Admins:**
```
POST   /api/duties                    - Post duty
GET    /api/applications/received     - View applications
PUT    /api/applications/:id          - Accept/reject
GET    /api/analytics/hospital        - View analytics
POST   /api/shift-series              - Create series
POST   /api/reviews                   - Review doctor
```

---

## 📚 Additional Notes

- All dates should be in ISO 8601 format
- All monetary values are in Indian Rupees (₹)
- Pagination is not implemented (can be added later with `?page=1&limit=20`)
- File uploads for attachments/documents need separate implementation
- Real-time features (live messaging) would require WebSocket implementation
- External calendar sync (Google/Apple/Outlook) requires OAuth setup

---

**Last Updated:** March 2025
**API Version:** 1.0.0
**Backend Framework:** Express.js + MongoDB
