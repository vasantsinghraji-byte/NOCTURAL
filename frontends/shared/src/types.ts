/**
 * MedRush shared domain types.
 *
 * Mirrors the backend constants/enums.js and Mongoose models so web + mobile
 * stay in sync with the API. String unions match the server enum values.
 */

export type Role =
  | 'patient'
  | 'doctor'
  | 'nurse'
  | 'physiotherapist'
  | 'admin'
  | 'platform_admin'
  | 'pharmacy_vendor'
  | 'delivery_partner'
  | 'medical_staff'
  | 'phlebotomist'
  | 'lab_partner';

export type MedicineForm =
  | 'TABLET' | 'CAPSULE' | 'SYRUP' | 'SUSPENSION' | 'INJECTION' | 'DROPS'
  | 'CREAM' | 'OINTMENT' | 'GEL' | 'INHALER' | 'SPRAY' | 'POWDER' | 'SACHET'
  | 'SOLUTION' | 'LOTION' | 'SUPPOSITORY' | 'PATCH' | 'DEVICE' | 'OTHER';

export type MedicineScheduleType =
  | 'OTC' | 'PRESCRIPTION' | 'SCHEDULE_H' | 'SCHEDULE_H1' | 'SCHEDULE_X';

export type MedicineCategory =
  | 'PAIN_RELIEF' | 'ANTIBIOTIC' | 'ANTACID' | 'DIABETES' | 'CARDIAC'
  | 'RESPIRATORY' | 'DERMATOLOGY' | 'VITAMINS_SUPPLEMENTS' | 'COLD_FLU'
  | 'GASTRO' | 'GYNAECOLOGY' | 'PEDIATRIC' | 'OPHTHALMOLOGY' | 'FIRST_AID'
  | 'DEVICES' | 'AYURVEDA' | 'PERSONAL_CARE' | 'OTHER';

export type PharmacyOrderStatus =
  | 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'REJECTED' | 'CANCELLED';

export type PharmacyVendorStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface Address {
  label?: string;
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode: string;
  contactPhone?: string;
}

export interface PharmacyVendor {
  _id: string;
  name: string;
  slug?: string;
  address?: Omit<Address, 'line1' | 'pincode'> & { line1?: string; pincode?: string };
  location?: GeoPoint;
  serviceRadiusKm?: number;
  deliveryFee?: number;
  minOrderValue?: number;
  avgPreparationMinutes?: number;
  isOpen?: boolean;
  status?: PharmacyVendorStatus;
  rating?: { average: number; count: number };
  /** Present on GET /pharmacy/vendors/nearby results. */
  distanceKm?: number;
  effectiveRadiusKm?: number;
  eta?: DeliveryEta;
}

/** Delivery promise split into legs (prep overlaps rider assignment, then last mile). */
export interface DeliveryEta {
  promisedAt: string;
  prepMinutes: number;
  assignmentMinutes: number;
  lastMileMinutes: number;
}

/** Why the customer can (not) be served at this point right now. */
export interface Serviceability {
  zone: { id: string; code: string; name: string } | null;
  stressLevel: 'NORMAL' | 'HIGH' | 'SEVERE';
  serviceable: boolean;
  reason?: 'ZONE_PAUSED' | 'NO_STORE_IN_RANGE';
}

export interface Medicine {
  _id: string;
  name: string;
  genericName?: string;
  brand?: string;
  manufacturer?: string;
  form: MedicineForm;
  strength?: string;
  packSize?: string;
  scheduleType: MedicineScheduleType;
  category: MedicineCategory;
  images?: string[];
  referenceMrp?: number;
  requiresPrescription?: boolean;
}

export interface StorefrontItem {
  inventoryId: string;
  medicine: Medicine;
  mrp: number;
  sellingPrice: number;
  discountPercentage: number;
  inStock: boolean;
  stockQty?: number;
}

export interface OrderItem {
  medicine: string;
  name: string;
  form?: MedicineForm;
  packSize?: string;
  quantity: number;
  unitPrice: number;
  mrp?: number;
  lineTotal: number;
  requiresPrescription?: boolean;
  /** UNAVAILABLE = the store didn't have it: removed from the bill (and refunded if prepaid). */
  status?: 'AVAILABLE' | 'UNAVAILABLE';
  unavailableReason?: string;
}

/** Why a store turned an order down (decides whether it moves to another store). */
export type PharmacyRejectionReason =
  | 'OUT_OF_STOCK' | 'STORE_CLOSED' | 'STORE_BUSY' | 'PRESCRIPTION_INVALID' | 'PRESCRIPTION_MISSING' | 'OTHER';

export interface AssignmentAttempt {
  vendor: string;
  offeredAt: string;
  outcome: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'TIMED_OUT' | 'CANCELLED';
  reasonCode?: PharmacyRejectionReason;
  note?: string;
  resolvedAt?: string;
}

export interface StoreSummary {
  id: string;
  name: string;
  address?: Address;
  distanceKm?: number;
  etaMinutes: number;
  acceptsPrescriptionOrders: boolean;
  hasColdStorage: boolean;
}

/** GET /pharmacy/medicines/:id/availability */
export interface MedicineAvailability {
  medicine: Medicine;
  blocked?: string;
  message?: string;
  serviceable?: boolean;
  storeCount: number;
  fromPrice?: number;
  stores: Array<{
    store: StoreSummary;
    sellingPrice: number;
    mrp: number;
    discountPercentage?: number;
    stockLevel: 'IN_STOCK' | 'LOW';
    /** LIKELY = the store hasn't recounted recently. */
    confidence: 'CONFIRMED' | 'LIKELY';
  }>;
  substitutes: MedicineSubstitute[];
}

export interface MedicineSubstitute {
  medicine: { id: string; name: string; brand?: string; manufacturer?: string; packSize?: string; packUnits?: number; requiresPrescription: boolean };
  fromPrice: number;
  unitPrice?: number;
  storeCount: number;
  fastestEtaMinutes: number;
}

export interface CartPlanOption {
  store: StoreSummary;
  covered: Array<{ medicineId: string; name: string; quantity: number; unitPrice: number; mrp: number; lineTotal: number; confidence: 'CONFIRMED' | 'LIKELY' }>;
  missing: string[];
  subtotal: number;
  score: number;
}

/** POST /pharmacy/cart/plan */
export interface CartPlan {
  serviceable: boolean;
  reason?: string;
  blocked: Array<{ medicineId: string; reason: string; message: string }>;
  best: CartPlanOption | null;
  split: CartPlanOption[] | null;
  partial: CartPlanOption | null;
  options: CartPlanOption[];
  unavailable: Array<{ medicineId: string; name: string; substitutes: MedicineSubstitute[] }>;
}

export interface OrderAmounts {
  itemsSubtotal: number;
  deliveryFee: number;
  tax: number;
  discount: number;
  total: number;
  originalTotal?: number;
  refunded?: number;
}

export interface PharmacyOrder {
  _id: string;
  orderNumber: string;
  patient: string;
  vendor: string | PharmacyVendor;
  items: OrderItem[];
  requiresPrescription: boolean;
  prescription?: { key?: string; verified?: boolean };
  status: PharmacyOrderStatus;
  timeline?: Array<{ status: PharmacyOrderStatus; at: string; note?: string }>;
  deliveryAddress?: Address;
  amounts: OrderAmounts;
  paymentMode: 'PREPAID' | 'COD';
  paymentStatus: PaymentStatus;
  /** PREPAID only: unpaid orders are auto-cancelled after this. */
  paymentExpiresAt?: string;
  razorpay?: { orderId?: string; paymentId?: string; failureReason?: string; refundId?: string };
  distanceKm?: number;
  eta?: DeliveryEta;
  /** STAFF_PICKUP = supplies for a home-care visit, collected by the nurse. */
  fulfilment?: 'DELIVERY' | 'STAFF_PICKUP';
  feeBreakdown?: { base: number; surgeMultiplier: number; surgeAmount: number; nightSurcharge: number; waiver: 'MEMBER' | 'FREE_ABOVE' | 'STAFF_PICKUP' | null };
  careVisit?: { booking: string; serviceType: string; scheduledDate: string; scheduledTime: string };
  cancellationReason?: string;
  rejectionReasonCode?: PharmacyRejectionReason;
  /** The current store must accept by this time or the order moves on. */
  acceptBy?: string;
  assignmentAttempts?: AssignmentAttempt[];
  refunds?: Array<{ amount: number; reason?: string; status: 'PENDING' | 'DONE' | 'FAILED'; doneAt?: string }>;
  createdAt?: string;
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED';

/** GET /pharmacy/payment-options */
export interface PaymentOptions {
  online: boolean;
  razorpayKeyId: string | null;
  currency: string;
  paymentWindowMinutes: number;
}

/** POST /pharmacy/orders/:id/payment — everything the Razorpay checkout needs. */
export interface PaymentCheckout {
  razorpayKeyId: string;
  gatewayOrder: { id: string; amount: number; currency: string };
  order: { _id: string; orderNumber: string; total: number; paymentExpiresAt?: string };
}

/** Razorpay checkout `handler` response, forwarded verbatim to /payment/verify. */
export interface RazorpayHandlerResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** Request body for POST /pharmacy/orders */
export interface CreateOrderInput {
  vendorId: string;
  items: Array<{ medicineId: string; quantity: number }>;
  deliveryAddress: Address;
  deliveryLocation?: { coordinates: [number, number] };
  /** `key` returned by POST /pharmacy/prescriptions (must be the patient's own upload). */
  prescriptionKey?: string;
  paymentMode?: 'PREPAID' | 'COD';
  /** Items total the customer saw; the order is refused (409) if prices changed since. */
  quotedSubtotal?: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

/** Standard API envelope (responseHelper spreads data into the top level). */
export interface ApiEnvelope {
  success: boolean;
  message?: string;
  [key: string]: unknown;
}

// ── Auth ──────────────────────────────────────────────────────────────────

export interface SavedAddress {
  _id?: string;
  label?: string;
  street?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  coordinates?: { lat?: number; lng?: number };
  isDefault?: boolean;
}

/** Authenticated patient profile (GET /patients/me). */
export interface PatientProfile {
  _id: string;
  id?: string;
  name: string;
  email: string;
  phone: string;
  savedAddresses?: SavedAddress[];
  address?: SavedAddress;
  preferredLanguage?: string;
}

/** Authenticated staff/partner user (GET /auth/me). */
export interface AuthUser {
  _id: string;
  id?: string;
  name: string;
  email: string;
  role: Role;
  pharmacyVendor?: string;
}

export interface RegisterPatientInput {
  name: string;
  email: string;
  password: string;
  phone: string;
}


// ── Home care (nurse / physio visits) ──────────────────────────────────────

export type CareSupplySource = 'PATIENT_HAS' | 'STAFF_BRINGS';

export interface CareSupply {
  key: string;
  name: string;
  medicineSlug?: string;
  quantity: number;
  kind: 'MEDICINE' | 'CONSUMABLE';
  defaultSource: CareSupplySource;
  note?: string;
}

/** GET /care/services */
export interface CareService {
  _id: string;
  serviceType: string;
  name: string;
  displayName?: string;
  category: 'NURSING' | 'PHYSIOTHERAPY' | 'PACKAGE';
  subCategory?: string;
  shortDescription?: string;
  pricing: { basePrice: number; currency?: string };
  serviceDetails?: { duration?: number };
  requirements?: { prescriptionRequired?: boolean; advanceBookingHours?: number };
  included?: string[];
  supplies?: CareSupply[];
  /** Server-computed customer price, without and with Nabz Plus. */
  pricingPreview?: { regular: CarePriceQuote; member: CarePriceQuote };
}

export interface CarePriceQuote {
  basePrice: number;
  platformFee: number;
  gst: number;
  totalAmount: number;
  payableAmount: number;
  memberFeeWaived: boolean;
}

/** GET /care/supplies/quote */
export interface CareSuppliesQuote {
  serviceType: string;
  serviceName: string;
  basePrice?: number;
  vendor: { _id: string; name: string; distanceKm?: number } | null;
  items: Array<{
    key: string;
    name: string;
    kind: 'MEDICINE' | 'CONSUMABLE';
    quantity: number;
    note?: string;
    defaultSource: CareSupplySource;
    medicineId: string | null;
    productName: string | null;
    requiresPrescription: boolean;
    available: boolean;
    unitPrice: number | null;
  }>;
}

export interface CreateCareBookingInput {
  serviceType: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:MM (24h)
  scheduledTimezone: string;
  scheduledTimezoneOffsetMinutes: number;
  serviceLocation: {
    type?: 'HOME';
    address: { street: string; city: string; pincode: string; state?: string; coordinates?: { lat: number; lng: number } };
    contactPhone?: string;
  };
  patientDetails: { name: string; age: number; gender: 'Male' | 'Female' | 'Other' };
  specialRequirements?: string;
  supplies?: Array<{ key: string; source: CareSupplySource }>;
  suppliesVendorId?: string;
  prescriptionKey?: string;
  prescriptionUrl?: string;
  /** Book now (nearest online nurse is offered the visit) or schedule for later. */
  mode?: 'ASAP' | 'SCHEDULED';
  preferredGender?: 'FEMALE' | 'MALE' | 'ANY';
}

export interface CareBooking {
  _id: string;
  serviceType: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  pricing?: { payableAmount?: number; basePrice?: number };
  serviceLocation?: CreateCareBookingInput['serviceLocation'];
  supplies?: {
    items: Array<{ key: string; name: string; quantity: number; source: CareSupplySource; lineTotal?: number }>;
    pharmacyVendor?: string;
    pharmacyOrder?: string;
    amount?: number;
    status: 'NONE' | 'ORDERED' | 'CANCELLED';
  };
  dispatch?: { mode: 'ASAP' | 'SCHEDULED'; status: DispatchStatus; preferredGender?: string };
  rating?: { stars?: number; ratedAt?: string; tags?: string[] };
  serviceProvider?: { _id: string; name: string } | string;
  createdAt?: string;
}

/** Password step of an admin login: finish with /auth/admin-mfa/*. */
export interface AdminMfaChallenge { success: true; mfaRequired: true; mfaToken: string; enrolled: boolean }

/** Separate login per partner type (server enforces the role). */
export type LoginPortal = 'staff' | 'pharmacy' | 'lab' | 'rider' | 'admin';

// ── Nabz Plus membership ───────────────────────────────────────────────────

export interface MembershipPlan { code: string; name: string; price: number; days: number }

export interface MembershipStatus {
  active: boolean;
  validUntil: string | null;
  trialAvailable: boolean;
  trialDays: number;
  plans: MembershipPlan[];
  onlinePayment: boolean;
}

// ── Live tracking & staff availability ─────────────────────────────────────

export interface StaffVerification { id?: boolean; police?: boolean; council?: boolean; vaccinated?: boolean }

export type DispatchStatus = 'IDLE' | 'SEARCHING' | 'OFFERED' | 'MATCHED' | 'NO_STAFF' | 'CANCELLED';

export interface VisitTracking {
  bookingId: string;
  status: string;
  serviceType?: string;
  dispatch?: { mode: 'ASAP' | 'SCHEDULED'; status: DispatchStatus; attempts: number };
  /** Patient only: tell this to the nurse at the door. */
  visitCode?: string;
  /** Patient only: public family tracking link token. */
  shareToken?: string;
  staff: {
    name: string;
    phone?: string;
    qualification?: string;
    experienceYears?: number;
    languages?: string[];
    rating?: number | null;
    totalReviews?: number;
    photo?: string;
    verification?: StaffVerification;
  } | null;
  staffLocation: { lat: number; lng: number; lastUpdated: string } | null;
  destination: { lat: number; lng: number } | null;
  distanceKm: number | null;
  estimatedArrival: string | null;
}

export interface SharedTracking {
  status: string;
  serviceType: string;
  staff: { firstName: string; qualification?: string } | null;
  staffLocation: { lat: number; lng: number; lastUpdated: string } | null;
  estimatedArrival: string | null;
  expired: boolean;
}

export interface VisitOffer {
  bookingId: string;
  serviceType: string;
  area: string;
  distanceKm: number | null;
  when: string;
  earnings: number;
  patientFirstName?: string;
  supplies: { store?: string; items: string[] } | null;
  expiresAt: string;
}

export interface StaffDashboard {
  name: string;
  today: { earnings: number; visits: number };
  week: { earnings: number; visits: number };
  pendingPayout: number;
  rating: number | null;
  totalReviews: number;
  availability: StaffAvailability;
  offer: VisitOffer | null;
  upcomingVisits: number;
  demand: Array<{ lat: number; lng: number; count: number; pincode?: string }>;
  profile: { qualification?: string; languages: string[]; gender?: string; experienceYears?: number; verified: Required<StaffVerification> };
}

export interface HomeBanner { id: string; kind: 'PLUS' | 'SUPPLIES' | 'PHARMACY' | 'TRUST'; title: string; subtitle: string; cta: string; action: 'plus' | 'book' | 'pharmacy' | 'trust' }

export interface HomeFeed { banners: HomeBanner[]; packages: CareService[]; popular: CareService[] }

// ── Sign-in (phone OTP / Google) & partner onboarding ─────────────────────

export interface SignInMethods { google: boolean; phone: boolean; email: boolean }

export type SocialSignInResult =
  | { success: true; needsProfile: true; signupToken: string; profile: { phone?: string; email?: string; name?: string; needs: string[] } }
  | { success: true; needsProfile?: undefined; patient: PatientProfile; tokens?: { accessToken: string; refreshToken: string } };

export type PartnerKind = 'MEDICAL_STAFF' | 'PHARMACY' | 'PATH_LAB' | 'DELIVERY';

export interface PartnerApplicationInput {
  kind: PartnerKind;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  qualification?: string;
  registrationNumber?: string;
  experienceYears?: number;
  businessName?: string;
  gstin?: string;
  address?: string;
  vehicle?: string;
}

export interface StaffAvailability { online: boolean; wentStale: boolean; lastSeenAt: string | null }

export interface NearbyStaff { count: number; nearestKm: number | null; staff: Array<{ role: string; lat: number; lng: number }> }

// ── Revenue (platform admin) ───────────────────────────────────────────────

export interface RevenueSummary {
  from: string | null;
  to: string | null;
  platformRevenue: number;
  partnerEarnings: number;
  grossValue: number;
  pendingPayouts: number;
  byType: Record<string, number>;
  revenueByLine: { PHARMACY_ORDER: number; CARE_BOOKING: number; MEMBERSHIP: number };
}
