# Patient Booking Service - API Documentation

## Base URL
- Local: `http://localhost:3001`
- Production: `https://nocturnal-patient-booking.onrender.com`

## Authentication
Most endpoints require Bearer token authentication. Include the token in the Authorization header:
```
Authorization: Bearer <token>
```

---

## Patient Endpoints

### Register Patient
Create a new patient account.

**Endpoint:** `POST /api/patients/register`
**Auth Required:** No

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "password": "securepassword123"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Patient registered successfully",
  "data": {
    "patient": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "9876543210",
      "referralCode": "PATABC123",
      "isActive": true,
      "isVerified": false,
      "totalBookings": 0,
      "totalSpent": 0,
      "createdAt": "2025-01-01T10:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### Login Patient
Authenticate and get access token.

**Endpoint:** `POST /api/patients/login`
**Auth Required:** No

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "patient": { /* patient object */ },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### Get Patient Profile
Get authenticated patient's profile.

**Endpoint:** `GET /api/patients/profile`
**Auth Required:** Yes

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "9876543210",
    "dateOfBirth": "1990-01-15T00:00:00.000Z",
    "gender": "Male",
    "bloodGroup": "O+",
    "address": {
      "street": "123 Main St",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001"
    },
    "medicalHistory": { /* medical history object */ },
    "totalBookings": 5,
    "totalSpent": 5000,
    "referralCode": "PATABC123"
  }
}
```

---

### Update Patient Profile
Update patient profile information.

**Endpoint:** `PUT /api/patients/profile`
**Auth Required:** Yes

**Request Body:**
```json
{
  "name": "John Updated Doe",
  "dateOfBirth": "1990-01-15",
  "gender": "Male",
  "bloodGroup": "O+",
  "address": {
    "street": "456 New St",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400002"
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": { /* updated patient object */ }
}
```

---

### Update Password
Change patient password.

**Endpoint:** `PUT /api/patients/password`
**Auth Required:** Yes

**Request Body:**
```json
{
  "currentPassword": "oldpassword123",
  "newPassword": "newpassword456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password updated successfully"
}
```

---

### Add Saved Address
Add a new address to patient's saved addresses.

**Endpoint:** `POST /api/patients/addresses`
**Auth Required:** Yes

**Request Body:**
```json
{
  "label": "Home",
  "street": "123 Main St",
  "landmark": "Near Park",
  "city": "Mumbai",
  "state": "Maharashtra",
  "pincode": "400001",
  "coordinates": {
    "lat": 19.0760,
    "lng": 72.8777
  },
  "isDefault": true
}
```

---

### Get Patient Statistics
Get patient's booking and activity statistics.

**Endpoint:** `GET /api/patients/stats`
**Auth Required:** Yes

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "totalBookings": 10,
    "totalSpent": 15000,
    "memberSince": "2024-01-01T00:00:00.000Z",
    "lastActive": "2025-01-10T15:30:00.000Z",
    "isVerified": true,
    "phoneVerified": true,
    "emailVerified": true
  }
}
```

---

## Booking Endpoints

### Create Booking
Create a new service booking.

**Endpoint:** `POST /api/bookings`
**Auth Required:** Yes

**Request Body:**
```json
{
  "serviceType": "INJECTION",
  "scheduledDate": "2025-01-20",
  "scheduledTime": "10:00 AM",
  "serviceLocation": {
    "type": "HOME",
    "address": {
      "street": "123 Main St",
      "landmark": "Near Park",
      "city": "Mumbai",
      "state": "Maharashtra",
      "pincode": "400001",
      "coordinates": {
        "lat": 19.0760,
        "lng": 72.8777
      }
    },
    "contactPerson": "John Doe",
    "contactPhone": "9876543210",
    "floorNumber": "3rd Floor"
  },
  "serviceDetails": {
    "description": "IV injection required",
    "injectionType": "IV",
    "medicineToBeAdministered": "Vitamin B12",
    "specialInstructions": "Please bring sterile equipment"
  },
  "patientCondition": {
    "age": 45,
    "mobility": "MOBILE",
    "consciousness": "CONSCIOUS",
    "urgency": "ROUTINE"
  }
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Booking created successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "patient": "507f1f77bcf86cd799439012",
    "serviceType": "INJECTION",
    "status": "REQUESTED",
    "scheduledDate": "2025-01-20T00:00:00.000Z",
    "scheduledTime": "10:00 AM",
    "pricing": {
      "basePrice": 500,
      "platformFee": 75,
      "gst": 103.5,
      "totalAmount": 678.5,
      "payableAmount": 678.5
    },
    "createdAt": "2025-01-10T10:00:00.000Z"
  }
}
```

---

### Get All Bookings
Get list of patient's bookings with optional filters.

**Endpoint:** `GET /api/bookings`
**Auth Required:** Yes

**Query Parameters:**
- `status` (optional): Filter by status (REQUESTED, ASSIGNED, COMPLETED, etc.)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 20)

**Example:** `GET /api/bookings?status=COMPLETED&page=1&limit=10`

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    { /* booking object */ },
    { /* booking object */ }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "pages": 3
  }
}
```

---

### Get Booking by ID
Get details of a specific booking.

**Endpoint:** `GET /api/bookings/:id`
**Auth Required:** Yes

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "patient": { /* patient object */ },
    "serviceProvider": {
      "_id": "507f1f77bcf86cd799439013",
      "name": "Nurse Jane",
      "phone": "9876543211",
      "profilePhoto": { "url": "https://..." },
      "rating": 4.8
    },
    "serviceType": "INJECTION",
    "status": "COMPLETED",
    "scheduledDate": "2025-01-15T00:00:00.000Z",
    "scheduledTime": "10:00 AM",
    "serviceLocation": { /* location object */ },
    "pricing": { /* pricing object */ },
    "payment": { /* payment object */ },
    "actualService": { /* service report object */ },
    "rating": {
      "stars": 5,
      "review": "Excellent service!",
      "ratedAt": "2025-01-15T12:00:00.000Z"
    }
  }
}
```

---

### Update Booking
Update booking details (only allowed for REQUESTED/SEARCHING status).

**Endpoint:** `PUT /api/bookings/:id`
**Auth Required:** Yes

**Request Body:**
```json
{
  "scheduledDate": "2025-01-21",
  "scheduledTime": "2:00 PM",
  "serviceDetails": {
    "specialInstructions": "Updated instructions"
  }
}
```

---

### Cancel Booking
Cancel an existing booking.

**Endpoint:** `DELETE /api/bookings/:id`
**Auth Required:** Yes

**Request Body:**
```json
{
  "reason": "Unable to attend due to emergency"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Booking cancelled successfully",
  "data": {
    "booking": { /* cancelled booking object */ },
    "refundDetails": {
      "refundAmount": 500,
      "cancellationFee": 0,
      "refundEligible": true
    }
  }
}
```

---

### Add Review
Add rating and review for a completed booking.

**Endpoint:** `POST /api/bookings/:id/review`
**Auth Required:** Yes

**Request Body:**
```json
{
  "stars": 5,
  "review": "Excellent service! Very professional and punctual.",
  "punctuality": 5,
  "professionalism": 5,
  "skillLevel": 5,
  "communication": 5
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Review added successfully",
  "data": {
    "stars": 5,
    "review": "Excellent service! Very professional and punctual.",
    "punctuality": 5,
    "professionalism": 5,
    "skillLevel": 5,
    "communication": 5,
    "ratedAt": "2025-01-15T12:00:00.000Z"
  }
}
```

---

### Get Upcoming Bookings
Get patient's upcoming bookings.

**Endpoint:** `GET /api/bookings/upcoming`
**Auth Required:** Yes

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "serviceType": "INJECTION",
      "scheduledDate": "2025-01-20T00:00:00.000Z",
      "scheduledTime": "10:00 AM",
      "status": "CONFIRMED",
      "serviceProvider": { /* provider details */ }
    }
  ]
}
```

---

### Get Booking History
Get patient's past bookings (completed/cancelled).

**Endpoint:** `GET /api/bookings/history`
**Auth Required:** Yes

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 20)

---

## Service Catalog Endpoints

### Get All Services
Get list of all available services with optional filters.

**Endpoint:** `GET /api/services`
**Auth Required:** No

**Query Parameters:**
- `category` (optional): NURSING, PHYSIOTHERAPY, PACKAGE
- `city` (optional): Filter by available city
- `featured` (optional): true/false
- `popular` (optional): true/false

**Example:** `GET /api/services?category=NURSING&city=Mumbai`

**Success Response (200):**
```json
{
  "success": true,
  "count": 15,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "INJECTION",
      "slug": "injection-service",
      "category": "NURSING",
      "displayName": "Injection Service",
      "shortDescription": "Professional injection administration at home",
      "pricing": {
        "basePrice": 500,
        "currency": "INR"
      },
      "serviceDetails": {
        "duration": 30,
        "skillLevel": "BASIC"
      },
      "availability": {
        "isActive": true,
        "availableCities": ["Mumbai", "Delhi", "Bangalore"]
      },
      "stats": {
        "totalBookings": 1250,
        "avgRating": 4.7
      },
      "isFeatured": true
    }
  ]
}
```

---

### Get Service by ID or Slug
Get detailed information about a specific service.

**Endpoint:** `GET /api/services/:identifier`
**Auth Required:** No

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "INJECTION",
    "slug": "injection-service",
    "category": "NURSING",
    "displayName": "Injection Service",
    "shortDescription": "Professional injection administration at home",
    "longDescription": "Our trained nurses provide safe and professional injection services...",
    "pricing": {
      "basePrice": 500,
      "currency": "INR",
      "surgePricing": {
        "enabled": true,
        "surgeMultiplier": 1.5,
        "surgeHours": [
          { "start": "18:00", "end": "22:00" }
        ]
      }
    },
    "serviceDetails": {
      "duration": 30,
      "equipmentRequired": ["Syringe", "Sterile gloves", "Alcohol swabs"],
      "skillLevel": "BASIC",
      "certificationRequired": ["Basic Nursing Certification"]
    },
    "requirements": {
      "prescriptionRequired": true,
      "advanceBookingHours": 2
    },
    "included": [
      "Nurse visit fee",
      "Medical equipment",
      "Post-injection monitoring"
    ],
    "notIncluded": [
      "Medicine cost",
      "Prescription consultation"
    ],
    "faqs": [
      {
        "question": "Do I need a prescription?",
        "answer": "Yes, a valid prescription is required for injection services."
      }
    ],
    "stats": {
      "totalBookings": 1250,
      "avgRating": 4.7,
      "totalReviews": 823,
      "completionRate": 98
    }
  }
}
```

---

### Get Services by Category
Get all services in a specific category.

**Endpoint:** `GET /api/services/category/:category`
**Auth Required:** No

**Example:** `GET /api/services/category/NURSING`

---

### Get Featured Services
Get featured services (max 6).

**Endpoint:** `GET /api/services/featured`
**Auth Required:** No

---

### Get Popular Services
Get popular services sorted by booking count.

**Endpoint:** `GET /api/services/popular`
**Auth Required:** No

**Query Parameters:**
- `limit` (optional): Number of results (default: 10)

---

### Search Services
Search services by keyword.

**Endpoint:** `GET /api/services/search`
**Auth Required:** No

**Query Parameters:**
- `q` (required): Search query

**Example:** `GET /api/services/search?q=physiotherapy`

---

### Get Service Pricing
Get current pricing for a service (including surge pricing if applicable).

**Endpoint:** `GET /api/services/:id/pricing`
**Auth Required:** No

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "basePrice": 750,
    "platformFee": 112.5,
    "gst": 155.25,
    "totalAmount": 1017.75,
    "currency": "INR",
    "surgeApplied": true,
    "packageDetails": null
  }
}
```

---

## Error Responses

All endpoints return consistent error responses:

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Validation error message"
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "message": "Not authorized - No token provided"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "Resource not found"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## Service Types

### Nursing Services
- `INJECTION`
- `IV_DRIP`
- `WOUND_DRESSING`
- `CATHETER_CARE`
- `BED_SORE_CARE`
- `POST_SURGERY_CARE`
- `ELDERLY_CARE`
- `BABY_CARE`
- `NEBULIZATION`
- `BLOOD_PRESSURE_CHECK`
- `BLOOD_SUGAR_CHECK`
- `GENERAL_NURSING`

### Physiotherapy Services
- `PHYSIOTHERAPY_SESSION`
- `POST_SURGERY_REHAB`
- `SPORTS_INJURY`
- `BACK_PAIN_THERAPY`
- `KNEE_PAIN_THERAPY`
- `STROKE_REHAB`
- `GERIATRIC_PHYSIO`
- `PEDIATRIC_PHYSIO`
- `NEUROLOGICAL_REHAB`

### Packages
- `ELDERLY_CARE_PACKAGE` (30 days)
- `POST_SURGERY_PACKAGE` (14 days)
- `PHYSIO_PACKAGE_10` (10 sessions)
- `OTHER`

---

## Booking Status Flow

1. `REQUESTED` - Patient created booking
2. `SEARCHING` - System searching for nurse
3. `ASSIGNED` - Nurse assigned
4. `CONFIRMED` - Nurse accepted
5. `EN_ROUTE` - Nurse on the way
6. `IN_PROGRESS` - Service started
7. `COMPLETED` - Service finished
8. `CANCELLED` - Cancelled by patient/nurse/system
9. `NO_SHOW` - Nurse didn't show up
10. `FAILED` - Couldn't assign nurse

---

## Rate Limiting

- Global: 1000 requests per 15 minutes per IP
- Authentication endpoints: 5 requests per 15 minutes per IP

---

## Webhooks (Future)

The service will publish events to RabbitMQ for:
- `booking.created`
- `booking.cancelled`
- `booking.completed`
- `patient.registered`
