/**
 * MedRush typed API client.
 *
 * Environment-agnostic (browser fetch / React Native fetch). Construct once
 * with the API base URL and an optional token provider; call the typed
 * methods. Errors throw an `ApiError` carrying the HTTP status and message.
 */

import type {
  PharmacyVendor,
  StorefrontItem,
  Medicine,
  PharmacyOrder,
  CreateOrderInput,
  Pagination,
  PatientProfile,
  AuthUser,
  RegisterPatientInput,
  PaymentOptions,
  PaymentCheckout,
  RazorpayHandlerResponse,
  Serviceability,
  CareService,
  CareSuppliesQuote,
  CreateCareBookingInput,
  CareBooking,
  CareCancelQuote,
  PartnerApplication,
  LoginPortal,
  MembershipStatus,
  VisitTracking,
  StaffAvailability,
  NearbyStaff,
  RevenueSummary,
  SharedTracking,
  VisitOffer,
  StaffDashboard,
  HomeFeed,
  SignInMethods,
  SocialSignInResult,
  PartnerApplicationInput,
  AdminMfaChallenge,
  MedicineAvailability,
  CartPlan,
  PharmacyRejectionReason,
  InventoryBatch,
  InventoryImport,
  DemandItem,
  Address
} from './types';

export interface ApiClientOptions {
  /** e.g. "https://api.medrush.app" or "http://localhost:5000" */
  baseUrl: string;
  /** Returns the current bearer token (or null). Sync or async. */
  getToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /** Send cookies (web SSR/browser). Defaults to true. */
  credentials?: RequestCredentials;
  /** API version segment. Defaults to "v1". */
  version?: string;
  fetchImpl?: typeof fetch;
  /** Extra headers on every request (the Expo app sends X-Nocturnal-Mobile). */
  headers?: Record<string, string>;
  /**
   * Bearer-token clients: called once when a request gets 401. Refresh the
   * session and resolve true to retry the request, false to give up.
   */
  onUnauthorized?: () => Promise<boolean>;
}

// Requests that must never trigger a refresh-and-retry.
const NO_REFRESH_PATHS = new Set([
  '/auth/login', '/auth/refresh', '/auth/logout', '/patients/login', '/patients/register',
  '/auth/social/google', '/auth/social/phone/start', '/auth/social/phone/verify', '/auth/social/complete',
  '/auth/admin-mfa/enroll/start', '/auth/admin-mfa/enroll/verify', '/auth/admin-mfa/verify',
  '/auth/password/forgot', '/auth/password/check', '/auth/password/reset'
]);

export interface SessionTokens { accessToken: string; refreshToken: string }

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export class MedRushApi {
  private baseUrl: string;
  private version: string;
  private getToken?: ApiClientOptions['getToken'];
  private credentials: RequestCredentials;
  private fetchImpl: typeof fetch;
  private extraHeaders: Record<string, string>;
  private onUnauthorized?: () => Promise<boolean>;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.version = opts.version ?? 'v1';
    this.getToken = opts.getToken;
    this.credentials = opts.credentials ?? 'include';
    this.extraHeaders = opts.headers ?? {};
    this.onUnauthorized = opts.onUnauthorized;
    const rawFetch = opts.fetchImpl ?? globalThis.fetch;
    if (!rawFetch) {
      throw new Error('No fetch implementation available; pass fetchImpl.');
    }
    // Native fetch must run bound to the global; calling it as this.fetchImpl(...)
    // would rebind `this` to this instance and throw "Illegal invocation".
    this.fetchImpl = rawFetch.bind(globalThis);
  }

  /** Point the client at another server (mobile: emulator vs. LAN vs. cloud). */
  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setUnauthorizedHandler(handler: (() => Promise<boolean>) | undefined) {
    this.onUnauthorized = handler;
  }

  /** fetch with auth headers; on 401 refresh the session once and retry. */
  private async send(path: string, init: { method: string; headers: Record<string, string>; body?: BodyInit }, query?: Query): Promise<Response> {
    const attempt = async () => {
      const headers = { ...this.extraHeaders, ...init.headers };
      const token = this.getToken ? await this.getToken() : undefined;
      if (token) headers.Authorization = `Bearer ${token}`;
      return this.fetchImpl(this.buildUrl(path, query), {
        method: init.method, headers, credentials: this.credentials, body: init.body
      });
    };
    const res = await attempt();
    if (res.status === 401 && this.onUnauthorized && !NO_REFRESH_PATHS.has(path) && await this.onUnauthorized()) {
      return attempt();
    }
    return res;
  }

  private buildUrl(path: string, query?: Query): string {
    const url = `${this.baseUrl}/api/${this.version}${path.startsWith('/') ? path : `/${path}`}`;
    if (!query) return url;
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return qs ? `${url}?${qs}` : url;
  }

  private async request<T>(method: string, path: string, opts: { query?: Query; body?: unknown; rawBody?: string; contentType?: string } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.rawBody !== undefined) headers['Content-Type'] = opts.contentType || 'text/plain';
    else if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await this.send(path, {
      method,
      headers,
      body: opts.rawBody !== undefined ? opts.rawBody : opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    }, opts.query);

    let payload: any = null;
    const text = await res.text();
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = { message: text }; }
    }

    if (!res.ok || (payload && payload.success === false)) {
      // The server's limiter text ("API rate limit exceeded") means nothing to a customer.
      const message = res.status === 429
        ? 'Nabz is busy right now. Please wait a few seconds and try again.'
        : (payload && (payload.message || payload.error)) || `Request failed (${res.status})`;
      throw new ApiError(res.status, message, payload && payload.details);
    }
    return payload as T;
  }

  // ── Auth: patient (B2C) ──────────────────────────────────────────────────
  login(email: string, password: string) {
    return this.request<{ success: true; patient: PatientProfile; tokens?: { accessToken: string; refreshToken: string } }>(
      'POST', '/patients/login', { body: { email, password } }
    );
  }

  register(input: RegisterPatientInput) {
    return this.request<{ success: true; patient: PatientProfile; tokens?: { accessToken: string; refreshToken: string } }>(
      'POST', '/patients/register', { body: input }
    );
  }

  me() {
    return this.request<{ success: true; patient: PatientProfile }>('GET', '/patients/me');
  }

  /** Delete my customer account (personal data erased; needs confirm = 'DELETE'). */
  deleteMyAccount(confirm: string) {
    return this.request<{ success: true }>('DELETE', '/patients/me', { body: { confirm } });
  }

  logout() {
    return this.request<{ success: true }>('POST', '/auth/logout');
  }

  // ── Auth: staff / vendor / admin ─────────────────────────────────────────
  /**
   * Partner login. `portal` makes the server refuse accounts of other types
   * (a pharmacy login can't open the medical-staff app).
   */
  staffLogin(email: string, password: string, portal?: LoginPortal) {
    // Admin accounts get an MFA challenge instead of a session (see adminMfa* below).
    return this.request<{ success: true; user: AuthUser; tokens?: { accessToken: string; refreshToken: string }; mfaRequired?: undefined } | AdminMfaChallenge>(
      'POST', '/auth/login', { body: { email, password, ...(portal ? { portal } : {}) } }
    );
  }

  // ── Forgot / reset password (customers and partners) ────────────────────
  /** Always resolves with the same message (the server never reveals whether the email exists). */
  forgotPassword(email: string) {
    return this.request<{ success: true; message: string }>('POST', '/auth/password/forgot', { body: { email } });
  }

  checkPasswordReset(token: string) {
    return this.request<{ success: true; valid: boolean; expiresAt: string | null }>('POST', '/auth/password/check', { body: { token } });
  }

  resetPassword(token: string, password: string, confirmPassword: string) {
    return this.request<{ success: true; message: string; accountType: 'patient' | 'user'; role: string }>(
      'POST', '/auth/password/reset', { body: { token, password, confirmPassword } }
    );
  }

  // ── Admin two-step login (authenticator app) ────────────────────────────
  adminMfaEnrollStart(mfaToken: string) {
    return this.request<{ success: true; secret: string; otpauthUri: string }>('POST', '/auth/admin-mfa/enroll/start', { body: { mfaToken } });
  }

  adminMfaEnrollVerify(mfaToken: string, code: string) {
    return this.request<{ success: true; user: AuthUser; recoveryCodes: string[]; tokens?: SessionTokens }>('POST', '/auth/admin-mfa/enroll/verify', { body: { mfaToken, code } });
  }

  adminMfaVerify(mfaToken: string, factor: { code?: string; recoveryCode?: string }) {
    return this.request<{ success: true; user: AuthUser; recoveryCodesLeft?: number; tokens?: SessionTokens }>('POST', '/auth/admin-mfa/verify', { body: { mfaToken, ...factor } });
  }

  /** Fresh code before a sensitive admin action (server replied details.stepUpRequired). */
  adminMfaStepUp(code: string) {
    return this.request<{ success: true; user: AuthUser; tokens?: SessionTokens }>('POST', '/auth/admin-mfa/step-up', { body: { code } });
  }

  adminMfaStatus() {
    return this.request<{ success: true; enrolled: boolean; enabledAt: string | null; recoveryCodesLeft: number }>('GET', '/auth/admin-mfa/status');
  }

  adminMfaNewRecoveryCodes(code: string) {
    return this.request<{ success: true; recoveryCodes: string[] }>('POST', '/auth/admin-mfa/recovery-codes', { body: { code } });
  }

  /** Medical staff: visits assigned to me. */
  getMyAssignedVisits() {
    return this.request<{ success: true; data?: CareBooking[] }>('GET', '/bookings/provider/me');
  }

  /** Medical staff: confirm / en-route / start (start needs the patient's 4-digit visit code). */
  updateVisitStep(id: string, step: 'confirm' | 'en-route' | 'start' | 'complete', body?: { visitCode?: string; observations?: string; recommendations?: string; cashCollected?: number }) {
    return this.request<{ success: true; booking: CareBooking }>('PUT', `/bookings/${id}/${step}`, body ? { body } : {});
  }

  // ── Sign-in: phone OTP / Google (customers) ──────────────────────────────
  getSignInMethods() {
    return this.request<{ success: true; methods: SignInMethods }>('GET', '/auth/social/methods');
  }

  startPhoneSignIn(phone: string) {
    return this.request<{ success: true; sent: boolean; expiresInSeconds: number; resendAfterSeconds: number }>('POST', '/auth/social/phone/start', { body: { phone } });
  }

  verifyPhoneSignIn(phone: string, code: string) {
    return this.request<SocialSignInResult>('POST', '/auth/social/phone/verify', { body: { phone, code } });
  }

  googleSignIn(idToken: string) {
    return this.request<SocialSignInResult>('POST', '/auth/social/google', { body: { idToken } });
  }

  completeSignup(input: { signupToken: string; name: string; email?: string; phone?: string }) {
    return this.request<SocialSignInResult>('POST', '/auth/social/complete', { body: input });
  }

  // ── Partner onboarding ───────────────────────────────────────────────────
  applyAsPartner(input: PartnerApplicationInput) {
    return this.request<{ success: true; application: { id: string; status: string; createdAt: string } }>('POST', '/partners/apply', { body: input });
  }

  // ── Matching (Uber-style offers to staff) ────────────────────────────────
  getMyOffer() {
    return this.request<{ success: true; offer: VisitOffer | null }>('GET', '/bookings/offers/me');
  }

  acceptOffer(bookingId: string) {
    return this.request<{ success: true; booking: CareBooking }>('POST', `/bookings/${bookingId}/offer/accept`);
  }

  declineOffer(bookingId: string) {
    return this.request<{ success: true }>('POST', `/bookings/${bookingId}/offer/decline`);
  }

  getStaffDashboard() {
    return this.request<{ success: true; dashboard: StaffDashboard }>('GET', '/care/staff/dashboard');
  }

  updateStaffProfile(body: { qualification?: string; languages?: string[]; gender?: string; bio?: string; experienceYears?: number }) {
    return this.request<{ success: true; profile: unknown }>('PUT', '/care/staff/profile', { body });
  }

  /** Rotate a bearer session (mobile). Returns fresh tokens. */
  refreshSession(refreshToken: string) {
    return this.request<{ success: true; tokens?: SessionTokens; user?: AuthUser; patient?: PatientProfile }>(
      'POST', '/auth/refresh', { body: { refreshToken } }
    );
  }

  staffMe() {
    return this.request<{ success: true; user: AuthUser }>('GET', '/auth/me');
  }

  /** GET /health — used by the mobile app's "Test connection". */
  health() {
    return this.request<{ success?: boolean; status?: string }>('GET', '/health');
  }

  // ── Push devices (FCM token of this phone) ───────────────────────────────
  registerPushDevice(token: string, platform: 'android' | 'ios') {
    return this.request<{ success: true }>('POST', '/mobile-devices', { body: { token, platform } });
  }

  unregisterPushDevice(token: string) {
    return this.request<{ success: true }>('DELETE', '/mobile-devices', { body: { token } });
  }

  /**
   * Upload a prescription (image/PDF). Pass a browser File/Blob or an object
   * `{ uri, name, type }` for React Native. Returns the stored file URL.
   */
  async uploadPrescription(file: unknown, filename = 'prescription'): Promise<{ success: true; url: string; key: string }> {
    const form = new FormData();
    // Works for both web File/Blob and RN { uri, name, type } shapes.
    form.append('prescription', file as any, filename);
    const res = await this.send('/pharmacy/prescriptions', {
      method: 'POST',
      headers: { Accept: 'application/json' }, // no Content-Type: the runtime sets the multipart boundary
      body: form
    });
    const text = await res.text();
    const payload = text ? JSON.parse(text) : null;
    if (!res.ok || (payload && payload.success === false)) {
      throw new ApiError(res.status, (payload && payload.message) || `Upload failed (${res.status})`);
    }
    return payload;
  }

  /**
   * Link that opens an order's prescription (private file, served via a
   * short-lived signed URL after an access check). Cookies authenticate it.
   */
  prescriptionLink(orderId: string, as: 'patient' | 'vendor' | 'admin' = 'patient'): string {
    const scope = as === 'vendor' ? '/vendor' : as === 'admin' ? '/admin' : '';
    return this.buildUrl(`/pharmacy${scope}/orders/${orderId}/prescription`);
  }

  // ── Pharmacy: public browse ──────────────────────────────────────────────
  getNearbyVendors(params: { lat: number; lng: number; radiusKm?: number; limit?: number }) {
    return this.request<{ success: true; vendors: PharmacyVendor[]; serviceability: Serviceability }>('GET', '/pharmacy/vendors/nearby', { query: params });
  }

  searchMedicines(params: { q?: string; vendorId?: string; category?: string; page?: number; limit?: number }) {
    return this.request<{ success: true; results: StorefrontItem[] | Medicine[] }>('GET', '/pharmacy/medicines/search', { query: params });
  }

  /** Which nearby stores have this medicine now (plus same-salt substitutes). */
  getMedicineAvailability(medicineId: string, params: { lat: number; lng: number; quantity?: number }) {
    return this.request<{ success: true } & MedicineAvailability>('GET', `/pharmacy/medicines/${medicineId}/availability`, { query: params });
  }

  /** Best store (or 2-store split) for a whole cart at a delivery point. */
  planCart(body: { lat: number; lng: number; items: Array<{ medicineId: string; quantity: number }> }) {
    return this.request<{ success: true } & CartPlan>('POST', '/pharmacy/cart/plan', { body });
  }

  getVendorStorefront(vendorId: string) {
    return this.request<{ success: true; vendor: PharmacyVendor; items: StorefrontItem[] }>('GET', `/pharmacy/vendors/${vendorId}`);
  }

  // ── Pharmacy: patient orders ─────────────────────────────────────────────
  createOrder(input: CreateOrderInput) {
    return this.request<{ success: true; order: PharmacyOrder }>('POST', '/pharmacy/orders', { body: input });
  }

  getMyOrders(params: { status?: string; page?: number; limit?: number } = {}) {
    return this.request<{ success: true; orders: PharmacyOrder[]; pagination: Pagination }>('GET', '/pharmacy/orders', { query: params });
  }

  getOrder(id: string) {
    return this.request<{ success: true; order: PharmacyOrder }>('GET', `/pharmacy/orders/${id}`);
  }

  cancelOrder(id: string, reason?: string) {
    return this.request<{ success: true; order: PharmacyOrder }>('POST', `/pharmacy/orders/${id}/cancel`, { body: { reason } });
  }

  // ── Pharmacy: online payment (Razorpay) ──────────────────────────────────
  getPaymentOptions() {
    return this.request<{ success: true } & PaymentOptions>('GET', '/pharmacy/payment-options');
  }

  /** Create (or reuse) the Razorpay order for a PREPAID pharmacy order. */
  startPayment(orderId: string) {
    return this.request<{ success: true } & PaymentCheckout>('POST', `/pharmacy/orders/${orderId}/payment`);
  }

  verifyPayment(orderId: string, response: RazorpayHandlerResponse) {
    return this.request<{ success: true; order: PharmacyOrder }>('POST', `/pharmacy/orders/${orderId}/payment/verify`, { body: response });
  }

  reportPaymentFailure(orderId: string, reason?: string) {
    return this.request<{ success: true; order: PharmacyOrder }>('POST', `/pharmacy/orders/${orderId}/payment/failure`, { body: { reason } });
  }

  // ── Pharmacy: vendor dashboard ───────────────────────────────────────────
  vendorListOrders(params: { status?: string; page?: number; limit?: number } = {}) {
    return this.request<{ success: true; orders: PharmacyOrder[]; pagination: Pagination }>('GET', '/pharmacy/vendor/orders', { query: params });
  }

  vendorUpdateOrderStatus(id: string, status: string, note?: string, extra: { reasonCode?: PharmacyRejectionReason; unavailableMedicineIds?: string[]; deliveryCode?: string; deliveredWithoutCodeReason?: string } = {}) {
    return this.request<{ success: true; order: PharmacyOrder }>('PATCH', `/pharmacy/vendor/orders/${id}/status`, { body: { status, note, ...extra } });
  }

  /** Store has the order but not these items: they're dropped and refunded. */
  vendorMarkItemsUnavailable(id: string, medicineIds: string[], reason?: string) {
    return this.request<{ success: true; order: PharmacyOrder }>('POST', `/pharmacy/vendor/orders/${id}/items/unavailable`, { body: { medicineIds, reason } });
  }

  // ── Pharmacy: batches, prescriptions, stock files, demand (store side) ───
  vendorListBatches(medicineId?: string) {
    return this.request<{ success: true; batches: InventoryBatch[] }>('GET', '/pharmacy/vendor/inventory/batches', { query: medicineId ? { medicineId } : {} });
  }

  vendorReceiveBatch(body: { medicineId: string; batchNumber: string; expiryDate: string; qty: number; mrp?: number; sellingPrice?: number }) {
    return this.request<{ success: true; batch: InventoryBatch }>('POST', '/pharmacy/vendor/inventory/batches', { body });
  }

  vendorSetBatchCount(batchId: string, qty: number) {
    return this.request<{ success: true; batch: InventoryBatch }>('PATCH', `/pharmacy/vendor/inventory/batches/${batchId}`, { body: { qty } });
  }

  /** Pharmacist confirms the prescription (required before packing prescription orders). */
  vendorVerifyPrescription(orderId: string, body: { prescriberName: string; prescriberRegistrationNumber: string; prescriberAddress?: string; prescribedOn: string }) {
    return this.request<{ success: true; order: PharmacyOrder }>('POST', `/pharmacy/vendor/orders/${orderId}/prescription/verify`, { body });
  }

  /** Upload a CSV exported from billing software (Marg, GoFrugal, Busy…). */
  vendorImportInventory(csv: string) {
    return this.request<{ success: true; import: InventoryImport }>('POST', '/pharmacy/vendor/inventory/import', { rawBody: csv, contentType: 'text/csv' });
  }

  vendorResolveImportRow(importId: string, line: number, choice: { medicineId?: string; skip?: boolean }) {
    return this.request<{ success: true; import: InventoryImport }>('POST', `/pharmacy/vendor/inventory/imports/${importId}/rows/${line}`, { body: choice });
  }

  vendorDemand(days = 14) {
    return this.request<{ success: true; items: DemandItem[] }>('GET', '/pharmacy/vendor/demand', { query: { days } });
  }

  /** CSV download of the store's Schedule H1 register (cookie-authenticated link). */
  h1RegisterLink(from: string, to: string): string {
    return this.buildUrl(`/pharmacy/vendor/register/h1?format=csv&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  }

  // ── Pharmacy: customer extras ────────────────────────────────────────────
  /** Tell me when a store near me has this again. */
  notifyWhenInStock(medicineId: string, coords: { lat: number; lng: number }) {
    return this.request<{ success: true; alert: { _id: string; status: string } }>('POST', `/pharmacy/medicines/${medicineId}/notify-me`, { body: coords });
  }

  cancelStockAlert(medicineId: string) {
    return this.request<{ success: true; cancelled: number }>('DELETE', `/pharmacy/medicines/${medicineId}/notify-me`);
  }

  /** One checkout, several stores (cash on delivery). */
  createSplitCheckout(body: {
    groups: Array<{ vendorId: string; items: Array<{ medicineId: string; quantity: number }>; quotedSubtotal?: number }>;
    deliveryAddress: Address;
    deliveryLocation?: { coordinates: [number, number] };
    prescriptionKey?: string;
  }) {
    return this.request<{ success: true; checkout: { _id: string; total: number; status: string }; orders: PharmacyOrder[] }>('POST', '/pharmacy/checkouts', { body });
  }

  /** "My stock counts are right" (all listings, or the given ones). */
  vendorConfirmInventory(medicineIds?: string[]) {
    return this.request<{ success: true; confirmed: number }>('POST', '/pharmacy/vendor/inventory/confirm', { body: medicineIds ? { medicineIds } : {} });
  }

  vendorListInventory(params: { page?: number; limit?: number } = {}) {
    return this.request<{ success: true; items: unknown[]; pagination: Pagination }>('GET', '/pharmacy/vendor/inventory', { query: params });
  }

  vendorUpsertInventory(body: {
    medicineId: string; mrp: number; sellingPrice: number; stockQty?: number; isAvailable?: boolean;
  }) {
    return this.request<{ success: true; item: unknown }>('PUT', '/pharmacy/vendor/inventory', { body });
  }

  // ── Home care: nurse / physio visits ─────────────────────────────────────
  listCareServices() {
    return this.request<{ success: true; services: CareService[] }>('GET', '/care/services');
  }

  quoteCareSupplies(params: { serviceType: string; lat: number; lng: number; vendorId?: string }) {
    return this.request<{ success: true; quote: CareSuppliesQuote }>('GET', '/care/supplies/quote', { query: params });
  }

  createCareBooking(input: CreateCareBookingInput) {
    return this.request<{ success: true; booking: CareBooking }>('POST', '/bookings', { body: input });
  }

  /** Customer Home: offer banners, packages, popular services. */
  getHomeFeed() {
    return this.request<{ success: true } & HomeFeed>('GET', '/care/home');
  }

  /** Emergency during a visit: alerts Nabz ops; returns emergency numbers. */
  raiseSos(bookingId: string, body: { lat?: number; lng?: number; note?: string } = {}) {
    return this.request<{ success: true; emergencyNumbers: Record<string, string> }>('POST', `/bookings/${bookingId}/sos`, { body });
  }

  /** Family tracking link (no login). */
  getSharedTracking(token: string) {
    return this.request<{ success: true; tracking: SharedTracking }>('GET', `/care/track/${encodeURIComponent(token)}`);
  }

  rateVisit(bookingId: string, body: { stars: number; comment?: string; tags?: string[] }) {
    return this.request<{ success: true; booking: CareBooking }>('POST', `/bookings/${bookingId}/review`, { body });
  }

  getMyCareBookings() {
    return this.request<{ success: true; data?: CareBooking[]; bookings?: CareBooking[] }>('GET', '/bookings/patient/me');
  }

  cancelCareBooking(id: string, reason: string) {
    return this.request<{ success: true; booking: CareBooking }>('PUT', `/bookings/${id}/cancel`, { body: { reason } });
  }

  /** What cancelling costs right now (free until the nurse is on the way). */
  getCareCancelQuote(id: string) {
    return this.request<{ success: true; quote: CareCancelQuote }>('GET', `/bookings/${id}/cancel-quote`);
  }

  /** Move a visit nobody has taken yet (e.g. after "no nurse available"). */
  rescheduleCareBooking(id: string, scheduledDate: string, scheduledTime: string) {
    return this.request<{ success: true; booking: CareBooking }>('PUT', `/bookings/${id}/reschedule`, {
      body: { scheduledDate, scheduledTime, scheduledTimezoneOffsetMinutes: -new Date().getTimezoneOffset() }
    });
  }

  // ── Nabz Plus membership ─────────────────────────────────────────────────
  getMembership() {
    return this.request<{ success: true } & MembershipStatus>('GET', '/membership');
  }

  startMembershipTrial() {
    return this.request<{ success: true }>('POST', '/membership/trial');
  }

  membershipCheckout(plan = 'PLUS_MONTHLY') {
    return this.request<{ success: true; razorpayOrderId: string; amount: number; currency: string; keyId: string }>('POST', '/membership/checkout', { body: { plan } });
  }

  verifyMembership(response: RazorpayHandlerResponse) {
    return this.request<{ success: true }>('POST', '/membership/verify', { body: response });
  }

  // ── Live tracking & staff "Go online" ────────────────────────────────────
  getVisitTracking(bookingId: string) {
    return this.request<{ success: true; tracking: VisitTracking }>('GET', `/bookings/${bookingId}/tracking`);
  }

  shareVisitLocation(bookingId: string, lat: number, lng: number) {
    return this.request<{ success: true }>('PUT', `/bookings/${bookingId}/location`, { body: { lat, lng } });
  }

  getStaffAvailability() {
    return this.request<{ success: true; availability: StaffAvailability }>('GET', '/care/staff/availability');
  }

  setStaffAvailability(online: boolean, coords?: { lat: number; lng: number }) {
    return this.request<{ success: true; availability: StaffAvailability }>('PUT', '/care/staff/availability', { body: { online, ...(coords || {}) } });
  }

  getNearbyStaff(params: { lat: number; lng: number; radiusKm?: number }) {
    return this.request<{ success: true } & NearbyStaff>('GET', '/care/staff/nearby', { query: params });
  }

  // ── Revenue (platform admin) ─────────────────────────────────────────────
  getRevenueSummary(params: { from?: string; to?: string } = {}) {
    return this.request<{ success: true; summary: RevenueSummary }>('GET', '/admin/revenue/summary', { query: params });
  }

  getPendingPayouts() {
    return this.request<{ success: true; payouts: Array<{ partyKind: string; partyId: string; amount: number; entries: number; oldest: string }> }>('GET', '/admin/revenue/payouts');
  }

  // ── Pharmacy: admin ──────────────────────────────────────────────────────
  adminListPartnerApplications(status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING') {
    return this.request<{ success: true; applications: PartnerApplication[] }>('GET', '/partners/admin/applications', { query: { status } });
  }

  /** Approving a nurse/physio or pharmacy creates their login and sends a set-password invite. */
  adminReviewPartnerApplication(id: string, body: { status: 'APPROVED' | 'REJECTED'; note?: string; email?: string }) {
    return this.request<{ success: true; application: PartnerApplication }>('PATCH', `/partners/admin/applications/${id}`, { body });
  }

  adminListVendors(params: { status?: string; page?: number; limit?: number } = {}) {
    return this.request<{ success: true; vendors: PharmacyVendor[]; pagination: Pagination }>('GET', '/pharmacy/admin/vendors', { query: params });
  }

  adminSetVendorStatus(id: string, status: string) {
    return this.request<{ success: true; vendor: PharmacyVendor }>('PATCH', `/pharmacy/admin/vendors/${id}/status`, { body: { status } });
  }

  adminListMedicines(params: { q?: string; category?: string; page?: number; limit?: number } = {}) {
    return this.request<{ success: true; medicines: Medicine[]; pagination: Pagination }>('GET', '/pharmacy/admin/medicines', { query: params });
  }

  adminCreateMedicine(body: Partial<Medicine> & { name: string }) {
    return this.request<{ success: true; medicine: Medicine }>('POST', '/pharmacy/admin/medicines', { body });
  }
}

export function createApiClient(opts: ApiClientOptions): MedRushApi {
  return new MedRushApi(opts);
}
