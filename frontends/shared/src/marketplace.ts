/**
 * Care marketplace types (physio, home care, nursing, path labs as shops with
 * their own rate cards). Mirrors /api/v1/marketplace. See
 * docs/product/PROVIDER_MARKETPLACE_PLAN.md.
 */

export type ShopKind = 'PHYSIO' | 'LAB' | 'NURSING' | 'HOMECARE';
export type CareMode = 'HOME' | 'CLINIC';
export type PlanPaymentMode = 'PREPAID' | 'PER_SESSION';
export interface LatLng { lat: number; lng: number }
export interface DayHours { day: 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT'; open: string; close: string }

export interface MarketService {
  _id: string;
  name: string;
  displayName: string;
  category: string;
  subCategory?: string;
  shortDescription?: string;
  homeAllowed: boolean;
  clinicAllowed: boolean;
  priceFloor?: number;
  priceCeiling?: number;
  defaultDurationMinutes?: number;
  lab?: { sampleType?: string; fastingHours?: number; homeCollectable?: boolean; defaultReportHours?: number; tests?: string[] };
  providers: number;
  fromPrice: number | null;
}

export interface TravelQuote { straightKm: number; roadKm: number; chargedKm: number; ratePerKm: number; fee: number }

export interface RateCardLine {
  _id: string;
  service: { _id: string; name: string; displayName: string; category: string; shortDescription?: string; lab?: MarketService['lab'] };
  clinic: { enabled: boolean; price?: number };
  home: { enabled: boolean; price?: number };
  durationMinutes: number;
  sessionDiscounts: { minSessions: number; percent: number }[];
  offer: { percent: number; maxDiscount: number; label: string } | null;
  lab?: { reportHours?: number; homeCollection?: boolean };
}

export interface ShopCard {
  _id: string;
  kind: ShopKind;
  format: 'SOLO' | 'CLINIC' | 'LAB';
  name: string;
  bio?: string;
  photos: string[];
  languages: string[];
  gender?: 'FEMALE' | 'MALE' | 'OTHER';
  qualification?: string;
  experienceYears?: number;
  accredited: boolean;
  registered: boolean;
  rating: { avg: number; count: number };
  /** 90+ reliability (on time, completes visits). */
  reliable?: boolean;
  reliabilityScore?: number | null;
  isPaused: boolean;
  city?: string;
  clinic: { enabled: boolean; address?: { line1?: string; line2?: string; city?: string; pincode?: string }; location?: LatLng; hours?: DayHours[] };
  home: { enabled: boolean; radiusKm?: number; ratePerKm?: number; freeCollectionAbove?: number; hours?: DayHours[] };
  distanceKm?: number;
  homeCovered?: boolean;
  travel?: TravelQuote | null;
  item?: RateCardLine | null;
  price?: number | null;
  // Ads (sponsored listings)
  sponsored?: boolean;
  label?: string;
  token?: string;
}

export interface ShopPage extends ShopCard { rateCard: RateCardLine[] }

export interface SlotDay { date: string; times: string[] }

export interface QuoteLine { code: string; label: string; amount: number }

export interface CareQuote {
  _id: string;
  store: ShopCard;
  rateCardItem: string;
  service: string;
  serviceName: string;
  mode: CareMode;
  sessions: number;
  paymentMode: PlanPaymentMode;
  durationMinutes: number;
  schedule: { startDate: string; weekdays: number[]; time: string; dates: string[] };
  address?: { street: string; city?: string; pincode?: string; coordinates: LatLng };
  travel: { perSession: number; roadKm?: number; ratePerKm?: number; waived?: boolean; liveInOnce?: boolean };
  amounts: {
    listPricePerSession: number; discountPercent: number; servicePerSession: number; serviceSubtotal: number;
    discount: number; offer: number; creditAvailable: number; travelTotal: number; platformFee: number; gst: number;
    total: number; perSessionPayable: number;
  };
  lines: QuoteLine[];
  expiresAt: string;
}

export interface QuoteInput {
  storeId: string;
  serviceId: string;
  mode: CareMode;
  sessions: number;
  paymentMode?: PlanPaymentMode;
  schedule: { startDate: string; time: string; weekdays?: number[] };
  addressId?: string;
  address?: { street: string; city?: string; pincode?: string; landmark?: string; coordinates: LatLng };
  patientDetails?: { name: string; age?: number; gender?: 'Male' | 'Female' | 'Other'; relation?: string };
  proposalId?: string;
}

export interface PlanSession {
  _id: string;
  index: number;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  needsAction: boolean;
  mode: CareMode;
  address?: { street?: string; city?: string };
  pricing: { basePrice: number; travelFee?: number; payableAmount: number; totalAmount: number };
  payment?: { status: string; method?: string };
  rating?: { stars: number };
}

export interface CarePlanView {
  _id: string;
  store: ShopCard | null;
  service: string;
  rateCardItem?: string;
  serviceName: string;
  mode: CareMode;
  sessionsTotal: number;
  sessionsCompleted: number;
  sessionsCancelled: number;
  paymentMode: PlanPaymentMode;
  payment: { status: string; amount?: number; holdUntil?: string };
  refund: { amount: number; status: 'NONE' | 'PENDING' | 'PROCESSED'; reason?: string };
  status: 'PENDING_PAYMENT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  price: { listPricePerSession: number; discountPercent: number; servicePerSession: number; travelPerSession: number; offer?: number; total: number };
  creditUsed?: number;
  expiresAt: string;
  patientDetails?: { name?: string };
  sessions?: PlanSession[];
  createdAt: string;
}

export interface PlanProposalView {
  _id: string;
  store: ShopCard | null;
  service: string;
  serviceName: string;
  mode: CareMode;
  sessions: number;
  sessionsPerWeek?: number;
  note?: string;
  expiresAt: string;
}

export interface WalletView { balance: number; entries: { _id: string; type: string; amount: number; reason?: string; createdAt: string }[] }

// ── Labs ─────────────────────────────────────────────────────────────────

export interface LabCompareRow {
  store: ShopCard;
  distanceKm?: number;
  tests: { serviceId: string; name: string; price: number; home: boolean; reportHours: number }[];
  missing: { serviceId: string; name: string }[];
  offersAll: boolean;
  testsSubtotal: number;
  homeCollection: { fee: number; waived: boolean; roadKm: number } | null;
  reportHours: number;
  accredited: boolean;
}

export interface LabMenuItem {
  _id: string;
  service: { _id: string; name: string; category: string; shortDescription?: string; lab?: MarketService['lab']; prescriptionRequired: boolean };
  price: number;
  home: boolean;
  walkIn: boolean;
  reportHours: number;
  save: number;
}

export interface LabOrderInput {
  storeId: string;
  serviceIds: string[];
  mode: CareMode;
  slot: { date: string; time: string };
  addressId?: string;
  address?: QuoteInput['address'];
  paymentMode?: 'PREPAID' | 'PAY_AT_COLLECTION';
  prescriptionKey?: string;
  patientDetails?: QuoteInput['patientDetails'];
  expectedTotal?: number;
}

export interface LabQuote {
  store: ShopCard;
  mode: CareMode;
  slot: { date: string; time: string };
  tests: { service: string; name: string; price: number; fastingHours: number; reportHours: number; sampleType?: string }[];
  fasting: boolean;
  amounts: { testsSubtotal: number; collectionFee: number; collectionWaived: boolean; platformFee: number; gst: number; total: number };
  creditAvailable: number;
  reportHours: number;
}

export interface LabOrderView {
  _id: string;
  store: ShopCard | null;
  items: { name: string; price: number; fastingHours?: number; reportHours?: number; sampleType?: string }[];
  mode: CareMode;
  slot: { date: string; time: string };
  amounts: LabQuote['amounts'] & { credit?: number };
  payment: { mode: string; status: string; amount: number; method?: string; holdUntil?: string };
  status: 'SCHEDULED' | 'COLLECTED' | 'AT_LAB' | 'PROCESSING' | 'REPORT_READY' | 'SAMPLE_REJECTED' | 'CANCELLED';
  collectedAt?: string;
  reportDueAt?: string;
  reportReady: boolean;
  rejection?: { reason: string; recollectionOrder?: string };
  lateCredit?: { amount: number };
  collectionCode?: string;
  patientDetails?: { name?: string };
  timeline: { status: string; at: string; by?: string }[];
  createdAt: string;
}

// ── Partner ──────────────────────────────────────────────────────────────

export interface MyShop {
  _id: string;
  kind: ShopKind;
  format: 'SOLO' | 'CLINIC' | 'LAB';
  name: string;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';
  statusReason?: string;
  isPaused: boolean;
  registration?: { number?: string; body?: string; accredited?: boolean };
  bio?: string;
  languages?: string[];
  gender?: string;
  qualification?: string;
  experienceYears?: number;
  address?: { line1?: string; line2?: string; city?: string; state?: string; pincode?: string };
  location: { type: 'Point'; coordinates: [number, number] };
  clinic: { enabled: boolean; capacity: number; hours: DayHours[] };
  home: { enabled: boolean; radiusKm: number; ratePerKm: number; bufferMinutes: number; capacity: number; hours: DayHours[]; freeCollectionAbove?: number };
  leave: { _id: string; from: string; to: string; reason?: string }[];
  rating: { avg: number; count: number };
  reliability?: { score?: number | null; updatedAt?: string };
  strikes?: { at: string; reason: string }[];
}

export interface MyRateCardItem {
  _id: string;
  service: { _id: string; name: string; displayName: string; category: string; marketplace?: { priceFloor?: number; priceCeiling?: number; defaultDurationMinutes?: number } };
  clinic: { enabled: boolean; price?: number };
  home: { enabled: boolean; price?: number };
  durationMinutes: number;
  liveIn?: boolean;
  sessionDiscounts: { minSessions: number; percent: number }[];
  offer?: { percent: number; maxDiscount: number; status: 'PENDING' | 'APPROVED' | 'REJECTED'; reason?: string };
  isActive: boolean;
}

export interface TeamMember { user: string; role: string; active: boolean; name?: string; gender?: string; qualification?: string }

export interface AdCampaignView {
  _id: string;
  product: 'SPONSORED_LISTING' | 'SPOTLIGHT' | 'CATEGORY_BANNER' | 'MAP_PIN';
  name: string;
  status: 'PENDING_REVIEW' | 'ACTIVE' | 'PAUSED' | 'REJECTED' | 'ENDED';
  bidCpc?: number;
  dailyBudget?: number;
  weeklyPrice?: number;
  creative?: { title?: string; subtitle?: string };
  pausedReason?: string;
  review?: { reason?: string };
  startAt: string;
  endAt: string;
  stats?: { impressions: number; clicks: number; spend: number; bookings: number; ctr: number; costPerBooking: number | null };
  store?: { name: string };
  owner?: { name: string };
}

export interface AdWalletView { balance: number; trusted: boolean; blocked: boolean; entries: { _id: string; type: string; amount: number; note?: string; createdAt: string }[] }

export interface SpotlightAd { sponsored: true; label: string; campaignId: string; token: string; house?: boolean; store?: string; creative?: { title?: string; subtitle?: string; imageUrl?: string; ctaPath?: string } }

export interface LabOrderForLab extends Omit<LabOrderView, 'store' | 'collectionCode'> { address?: { street?: string; city?: string } }

// ── Admin ────────────────────────────────────────────────────────────────

export interface MarketplaceOverview {
  shopsPending: number; refundsPending: number; reports: number; needsAction: number; todaySessions: number;
  labLate: number; labToday: number; adsPending: number; settingsPending: number; offersPending: number; callbacksOpen?: number;
}

export interface SettingField { key: 'revenue' | 'ads'; path: string; type: 'number' | 'boolean'; min?: number; max?: number; label: string; value: number | boolean }

export interface MapShop { _id: string; name: string; kind: ShopKind; format?: string; isPaused?: boolean; rating?: { avg: number; count: number }; lat: number; lng: number }
