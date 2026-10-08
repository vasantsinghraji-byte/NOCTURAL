/**
 * MedRush typed API client.
 *
 * Environment-agnostic (browser fetch / React Native fetch). Construct once
 * with the API base URL and an optional token provider; call the typed
 * methods. Errors throw an `ApiError` carrying the HTTP status and message.
 */

import type {
  StoreProfile,
  StoreProfileUpdate,
  StoreToday,
  StockFilter,
  StoreStockItem,
  StoreEarnings,
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
  StaffMix,
  PartnerAccount,
  PayoutDetails,
  PayoutDetailsInput,
  PayoutSummary,
  Withdrawal,
  CareProvider,
  CarePreferences,
  CarePackageInput,
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
  Address,
  AdminUserType,
  AdminUserRow,
  AdminUserDetail,
  AdminVerificationRow,
  AdminLogs,
  PaymentLog,
  PaymentLogKind,
  Campaign,
  CampaignInput,
  FeedUpdate,
  AdminDocumentRow,
  PartnerDocument,
  PartnerDocumentKind,
  VerificationStatus,
  SubstituteOption
} from './types';
import type * as M from './marketplace';

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
  /** Machine-readable reason the screens act on, e.g. PRICE_CHANGED, SLOT_TAKEN, OUT_OF_RANGE. */
  code?: string;
  constructor(status: number, message: string, details?: unknown, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
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
      throw new ApiError(res.status, message, payload && payload.details, payload && typeof payload.code === 'string' ? payload.code : undefined);
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

  /** Same-salt medicines this store has in stock for an ordered line (cheapest first). */
  vendorSubstitutes(orderId: string, medicineId: string) {
    return this.request<{ success: true; substitutes: SubstituteOption[] }>('GET', `/pharmacy/vendor/orders/${orderId}/substitutes`, { query: { medicineId } });
  }

  /** Suggest a substitute; the customer accepts or declines within 15 minutes. */
  vendorSuggestSubstitute(orderId: string, body: { medicineId: string; substituteId: string; note?: string }) {
    return this.request<{ success: true; order: PharmacyOrder }>('POST', `/pharmacy/vendor/orders/${orderId}/substitutions`, { body });
  }

  /** The customer's answer to a suggested substitute. */
  answerSubstitute(orderId: string, medicineId: string, accept: boolean) {
    return this.request<{ success: true; order: PharmacyOrder }>('POST', `/pharmacy/orders/${orderId}/substitutions/${medicineId}`, { body: { accept } });
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

  /** Store's stock, sorted by name: search by name, salt or maker, and filter. */
  vendorListInventory(params: { q?: string; filter?: StockFilter; page?: number; limit?: number } = {}) {
    return this.request<{ success: true; items: StoreStockItem[]; pagination: Pagination }>('GET', '/pharmacy/vendor/inventory', { query: params });
  }

  vendorUpsertInventory(body: {
    medicineId: string; mrp: number; sellingPrice: number; stockQty?: number; isAvailable?: boolean; lowStockThreshold?: number;
  }) {
    return this.request<{ success: true; item: unknown }>('PUT', '/pharmacy/vendor/inventory', { body });
  }

  /** Store home: orders, sales, stock and expiry alerts, open state. */
  vendorToday() {
    return this.request<{ success: true; today: StoreToday }>('GET', '/pharmacy/vendor/today');
  }

  vendorProfile() {
    return this.request<{ success: true; vendor: StoreProfile }>('GET', '/pharmacy/vendor/profile');
  }

  vendorUpdateProfile(patch: StoreProfileUpdate) {
    return this.request<{ success: true; vendor: StoreProfile }>('PATCH', '/pharmacy/vendor/profile', { body: patch });
  }

  /** Sales statement for the last 1 to 90 days (withdrawals: getPayouts). */
  vendorEarnings(days = 30) {
    return this.request<{ success: true; earnings: StoreEarnings }>('GET', '/pharmacy/vendor/earnings', { query: { days } });
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

  /** Verified professionals the customer can choose for a service. */
  listCareProviders(serviceType?: string) {
    return this.request<{ success: true; providers: CareProvider[] }>('GET', '/care/providers', { query: { serviceType } });
  }

  /** Book all sessions of a package (e.g. 10 physio sessions on Mon/Wed/Fri). */
  bookCarePackage(input: CarePackageInput) {
    return this.request<{ success: true; seriesId: string; sessions: CareBooking[] }>('POST', '/bookings/package', { body: input });
  }

  /** Change the professional for a package's remaining sessions (null = best available). */
  changeCareSeriesProvider(seriesId: string, providerId: string | null) {
    return this.request<{ success: true; moved: number }>('PUT', `/bookings/series/${seriesId}/provider`, { body: { providerId } });
  }

  getCarePreferences() {
    return this.request<{ success: true; preferences: CarePreferences | null }>('GET', '/patients/me/care-preferences');
  }

  saveCarePreferences(prefs: Omit<CarePreferences, 'preferredProvider'> & { preferredProvider?: string | null }) {
    return this.request<{ success: true; preferences: CarePreferences }>('PUT', '/patients/me/care-preferences', { body: prefs });
  }

  /** Partner: balance, payout details and recent withdrawals. */
  getPayouts() {
    return this.request<{ success: true; payouts: PayoutSummary }>('GET', '/partners/me/payouts');
  }

  savePayoutDetails(input: PayoutDetailsInput) {
    return this.request<{ success: true; details: PayoutDetails }>('PUT', '/partners/me/payout-details', { body: input });
  }

  /** Withdraw the whole available balance. */
  requestWithdrawal() {
    return this.request<{ success: true; withdrawal: Withdrawal }>('POST', '/partners/me/withdrawals');
  }

  adminListWithdrawals(status: 'REQUESTED' | 'PAID' | 'REJECTED' = 'REQUESTED') {
    return this.request<{ success: true; withdrawals: Withdrawal[] }>('GET', '/partners/admin/withdrawals', { query: { status } });
  }

  /** Bank / UPI details to make the transfer (needs a fresh admin 2FA code). */
  adminWithdrawalDestination(id: string) {
    return this.request<{ success: true; destination: { method: 'UPI' | 'BANK'; upiId?: string; accountName?: string; accountNumber?: string; ifsc?: string; bankName?: string } }>('GET', `/partners/admin/withdrawals/${id}/destination`);
  }

  adminMarkWithdrawalPaid(id: string, utr: string, note?: string) {
    return this.request<{ success: true; withdrawal: Withdrawal }>('POST', `/partners/admin/withdrawals/${id}/paid`, { body: { utr, note } });
  }

  adminRejectWithdrawal(id: string, note?: string) {
    return this.request<{ success: true; withdrawal: Withdrawal }>('POST', `/partners/admin/withdrawals/${id}/reject`, { body: { note } });
  }

  /** Partner: profile, earnings, rating and referral code. */
  getPartnerAccount() {
    return this.request<{ success: true; account: PartnerAccount }>('GET', '/partners/me/account');
  }

  /** Customer: use a Nabz partner's referral code (before the first order). */
  applyPartnerReferral(code: string) {
    return this.request<{ success: true; message: string; referredBy: string }>('POST', '/patients/me/referral', { body: { code } });
  }

  // ── Profile pictures (customers and partners) ──

  /** Upload my profile picture (JPG/PNG). Returns its path; view it with profilePhotoUrl(). */
  async uploadProfilePhoto(file: unknown, filename = 'photo.jpg'): Promise<{ success: true; profilePhoto: { url: string; uploadedAt: string } }> {
    const form = new FormData();
    form.append('profilePhoto', file as any, filename);
    const res = await this.send('/profile-photo', { method: 'POST', headers: { Accept: 'application/json' }, body: form });
    const text = await res.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; }
    if (!res.ok || (payload && payload.success === false)) {
      throw new ApiError(res.status, (payload && payload.message) || `Upload failed (${res.status})`, payload?.details);
    }
    return payload;
  }

  removeProfilePhoto() {
    return this.request<{ success: true }>('DELETE', '/profile-photo');
  }

  /** Absolute URL for a stored photo path like /api/v1/profile-photo/user/<id>?v=... */
  absoluteUrl(path: string) {
    return /^https?:/.test(path) ? path : `${this.baseUrl}${path}`;
  }

  // ── Partner verification documents ──

  getMyVerification() {
    return this.request<{ success: true; verification: VerificationStatus }>('GET', '/partners/me/verification');
  }

  /** Upload one document (multipart field "partnerDocument"). */
  async uploadPartnerDocument(input: { kind: PartnerDocumentKind; number?: string; expiresAt?: string; file: unknown; filename?: string }): Promise<{ success: true; document: PartnerDocument }> {
    const form = new FormData();
    form.append('kind', input.kind);
    if (input.number) form.append('number', input.number);
    if (input.expiresAt) form.append('expiresAt', input.expiresAt);
    // Works for both web File/Blob and RN { uri, name, type } shapes.
    form.append('partnerDocument', input.file as any, input.filename || 'document');
    const res = await this.send('/partners/me/documents', {
      method: 'POST',
      headers: { Accept: 'application/json' }, // the runtime sets the multipart boundary
      body: form
    });
    const text = await res.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; }
    if (!res.ok || (payload && payload.success === false)) {
      throw new ApiError(res.status, (payload && payload.message) || `Upload failed (${res.status})`, payload?.details);
    }
    return payload;
  }

  /** Link to share Aadhaar from DigiLocker (only when DigiLocker is set up). */
  startDigilocker(returnTo: 'web' | 'app' = 'web') {
    return this.request<{ success: true; url: string }>('POST', '/partners/me/digilocker/start', { body: { returnTo } });
  }

  adminDocuments(status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'ALL' = 'PENDING') {
    return this.request<{ success: true; documents: AdminDocumentRow[] }>('GET', '/admin/ops/documents', { query: { status } });
  }

  adminPartnerVerification(userId: string) {
    return this.request<{ success: true; verification: VerificationStatus }>('GET', `/admin/ops/documents/partner/${userId}`);
  }

  /** Short-lived link to the file (fresh 2FA; audited). */
  adminViewDocument(id: string) {
    return this.request<{ success: true; url: string; mimeType: string; expiresInSeconds: number }>('POST', `/admin/ops/documents/${id}/view`);
  }

  adminReviewDocument(id: string, input: { decision: 'APPROVED' | 'REJECTED'; note?: string; expiresAt?: string }) {
    return this.request<{ success: true; document: PartnerDocument; awaitingSecondApproval?: boolean }>('PATCH', `/admin/ops/documents/${id}`, { body: input });
  }

  // ── Admin panel operations ──

  /** Recent redacted server logs (this API instance). Poll with `after`. */
  adminLogs(opts: { after?: number; level?: string; q?: string } = {}) {
    return this.request<{ success: true } & AdminLogs>('GET', '/admin/ops/logs', { query: opts });
  }

  adminPaymentLog(opts: { from?: string; to?: string; kind?: PaymentLogKind } = {}) {
    return this.request<{ success: true } & PaymentLog>('GET', '/admin/ops/payments', { query: opts });
  }

  adminUsers(opts: { type: AdminUserType; q?: string; role?: string; active?: 'true' | 'false'; page?: number }) {
    return this.request<{ success: true; users: AdminUserRow[]; total: number; page: number; pages: number }>('GET', '/admin/ops/users', { query: opts });
  }

  adminUser(type: AdminUserType, id: string) {
    return this.request<{ success: true; user: AdminUserDetail }>('GET', `/admin/ops/users/${type}/${id}`);
  }

  /** Full email and phone (fresh 2FA; recorded in the audit log with the reason). */
  adminRevealContact(type: AdminUserType, id: string, reason: string) {
    return this.request<{ success: true; contact: { email: string | null; phone: string | null } }>('POST', `/admin/ops/users/${type}/${id}/reveal`, { body: { reason } });
  }

  adminSetUserActive(type: AdminUserType, id: string, active: boolean, reason: string) {
    return this.request<{ success: true; active: boolean; releasedVisits: number }>('PATCH', `/admin/ops/users/${type}/${id}/status`, { body: { active, reason } });
  }

  adminVerificationQueue(status: 'pending' | 'verified' | 'all' = 'pending', q?: string) {
    return this.request<{ success: true; staff: AdminVerificationRow[] }>('GET', '/admin/ops/verification', { query: { status, q } });
  }

  adminSetStaffVerification(id: string, flags: Partial<Record<'id' | 'police' | 'council' | 'vaccinated', boolean>>) {
    return this.request<{ success: true; updated: boolean; releasedVisits: number }>('PATCH', `/partners/admin/staff/${id}/verification`, { body: flags });
  }

  adminCampaigns() {
    return this.request<{ success: true; campaigns: Campaign[] }>('GET', '/admin/ops/campaigns');
  }

  adminCreateCampaign(input: CampaignInput) {
    return this.request<{ success: true; campaign: Campaign }>('POST', '/admin/ops/campaigns', { body: input });
  }

  adminCancelCampaign(id: string) {
    return this.request<{ success: true; campaign: Campaign }>('POST', `/admin/ops/campaigns/${id}/cancel`);
  }

  /** Customer: live offers and updates from Nabz. */
  getMyOffers() {
    return this.request<{ success: true; offers: FeedUpdate[] }>('GET', '/patients/me/offers');
  }

  markOfferOpened(id: string) {
    return this.request<{ success: true }>('POST', `/patients/me/offers/${id}/open`);
  }

  /** Partner: live updates and offers from Nabz. */
  getPartnerUpdates() {
    return this.request<{ success: true; updates: FeedUpdate[] }>('GET', '/partners/me/updates');
  }

  markPartnerUpdateOpened(id: string) {
    return this.request<{ success: true }>('POST', `/partners/me/updates/${id}/open`);
  }

  adminStaffMix() {
    return this.request<{ success: true; mix: StaffMix }>('GET', '/partners/admin/staff-mix');
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
  // ── Address book (saved places for visits and deliveries) ───────────────
  addAddress(body: { label?: string; street: string; landmark?: string; city: string; state: string; pincode: string; coordinates?: { lat: number; lng: number }; isDefault?: boolean }) {
    return this.request<{ success: true; data?: PatientProfile; patient?: PatientProfile }>('POST', '/patients/me/addresses', { body });
  }

  updateAddress(id: string, body: { label?: string; street: string; landmark?: string; city: string; state: string; pincode: string; coordinates?: { lat: number; lng: number }; isDefault?: boolean }) {
    return this.request<{ success: true; data?: PatientProfile; patient?: PatientProfile }>('PUT', `/patients/me/addresses/${id}`, { body });
  }

  deleteAddress(id: string) {
    return this.request<{ success: true }>('DELETE', `/patients/me/addresses/${id}`);
  }

  // ── Support: "Call me back" ───────────────────────────────────────────────
  requestCallback(body: { topic?: CallbackTopic; note?: string; language?: 'en' | 'hi'; context?: { kind: 'VISIT' | 'PLAN' | 'LAB_ORDER' | 'PHARMACY_ORDER'; id: string } } = {}) {
    return this.request<{ success: true; request: CallbackView; existing: boolean }>('POST', '/support/callback', { body });
  }

  myCallback() {
    return this.request<{ success: true; request: CallbackView | null }>('GET', '/support/callback');
  }

  adminCallbacks(status: 'OPEN' | 'CALLED' | 'CLOSED' | 'ALL' = 'OPEN') {
    return this.request<{ success: true; requests: (CallbackView & { customer: string; phone: string; language: string; reveals: number; context?: { kind: string; id: string } })[] }>('GET', '/support/admin/callbacks', { query: { status } });
  }

  adminRevealCallback(id: string) {
    return this.request<{ success: true; phone: string; name?: string }>('POST', `/support/admin/callbacks/${id}/reveal`);
  }

  adminUpdateCallback(id: string, body: { status: 'OPEN' | 'CALLED' | 'CLOSED'; outcome?: string }) {
    return this.request<{ success: true; request: CallbackView }>('PUT', `/support/admin/callbacks/${id}`, { body });
  }

  // ── Medicine refills ──────────────────────────────────────────────────────
  myRefills() {
    return this.request<{ success: true; refills: RefillView[] }>('GET', '/refills');
  }

  createRefill(orderId: string, everyDays: 15 | 30 | 60 | 90 = 30) {
    return this.request<{ success: true; refill: RefillView }>('POST', '/refills', { body: { orderId, everyDays } });
  }

  updateRefill(id: string, body: { everyDays?: 15 | 30 | 60 | 90; status?: 'ACTIVE' | 'PAUSED' | 'CANCELLED' }) {
    return this.request<{ success: true; refill: RefillView }>('PUT', `/refills/${id}`, { body });
  }

  refillReorder(id: string) {
    return this.request<{ success: true; refillId: string; vendor: { _id: string; name: string; available: boolean } | null; items: { medicineId: string; name?: string; quantity: number }[] }>('GET', `/refills/${id}/reorder`);
  }

  refillOrdered(id: string, orderId: string) {
    return this.request<{ success: true; refill: RefillView }>('POST', `/refills/${id}/ordered`, { body: { orderId } });
  }

  // ── Rider app (delivery partners) ─────────────────────────────────────────
  riderOnline(online: boolean, point?: { lat: number; lng: number }) {
    return this.request<{ success: true; online: boolean }>('POST', '/rider/online', { body: { online, ...(point || {}) } });
  }

  riderHeartbeat(point: { lat: number; lng: number }) {
    return this.request<{ success: true; online: boolean }>('POST', '/rider/heartbeat', { body: point });
  }

  riderJobs() {
    return this.request<{ success: true; batches: RiderBatch[] }>('GET', '/rider/jobs');
  }

  riderStep(orderId: string, action: 'arrived-store' | 'picked-up' | 'arrived' | 'delivered', body: { code?: string; reason?: string } = {}) {
    return this.request<{ success: true; ok?: boolean; delivered?: boolean; pay?: number }>('POST', `/rider/jobs/${orderId}/${action}`, { body });
  }

  riderRelease(orderId: string, reason?: string) {
    return this.request<{ success: true; released: boolean }>('POST', `/rider/jobs/${orderId}/release`, { body: { reason } });
  }

  riderEarnings() {
    return this.request<{ success: true; today: RiderEarning; week: RiderEarning }>('GET', '/rider/earnings');
  }

  // ── Care Circle (family) and care logs ────────────────────────────────────
  myFamily() {
    return this.request<{ success: true; members: FamilyLinkView[]; helpers: FamilyLinkView[]; invites: FamilyLinkView[] }>('GET', '/family');
  }

  inviteFamily(body: { phone: string; relation?: string }) {
    return this.request<{ success: true; link: FamilyLinkView }>('POST', '/family/invite', { body });
  }

  answerFamilyInvite(linkId: string, accept: boolean) {
    return this.request<{ success: true; link: FamilyLinkView }>('POST', `/family/${linkId}/${accept ? 'accept' : 'decline'}`);
  }

  removeFamilyLink(linkId: string) {
    return this.request<{ success: true; removed: boolean }>('DELETE', `/family/${linkId}`);
  }

  familyMemberCare(memberId: string) {
    return this.request<{ success: true } & FamilyMemberCare>('GET', `/family/members/${memberId}/care`);
  }

  visitCareLog(bookingId: string) {
    return this.request<{ success: true; log: CareLogView }>('GET', `/family/care-log/visit/${bookingId}`);
  }

  planCareLogs(planId: string) {
    return this.request<{ success: true; logs: { bookingId: string; count: number; last: string | null }[] }>('GET', `/family/care-log/plan/${planId}`);
  }

  staffCareLog(bookingId: string) {
    return this.request<{ success: true; log: CareLogView }>('GET', `/family/care-log/staff/${bookingId}`);
  }

  addCareLogEntry(bookingId: string, body: { kind: CareLogKind; text?: string; vitals?: CareVitals }) {
    return this.request<{ success: true; log: CareLogView }>('POST', `/family/care-log/staff/${bookingId}`, { body });
  }

  // ── Care marketplace (physio, home care, nursing, labs) ─────────────────
  // See docs/product/PROVIDER_MARKETPLACE_PLAN.md. Errors carry `code`
  // (PRICE_CHANGED, SLOT_TAKEN, OUT_OF_RANGE, …) and `details`.

  marketHome(city?: string) {
    return this.request<{ success: true; spotlight: M.SpotlightAd[]; physio: M.MarketService[]; homecare: M.MarketService[]; labs: M.MarketService[] }>('GET', '/marketplace/home', { query: { city } });
  }

  marketServices(kind: M.ShopKind) {
    return this.request<{ success: true; services: M.MarketService[] }>('GET', '/marketplace/services', { query: { kind } });
  }

  marketServiceBanner(serviceId: string, city?: string) {
    return this.request<{ success: true; banner: M.SpotlightAd | null }>('GET', `/marketplace/services/${serviceId}/banner`, { query: { city } });
  }

  marketStores(q: { kind: M.ShopKind; serviceId?: string; mode?: M.CareMode; lat?: number; lng?: number; sort?: 'recommended' | 'price' | 'distance' | 'rating'; gender?: 'FEMALE' | 'MALE'; language?: string; city?: string }) {
    return this.request<{ success: true; stores: M.ShopCard[] }>('GET', '/marketplace/stores', { query: q });
  }

  marketStore(id: string, point?: M.LatLng) {
    return this.request<{ success: true; store: M.ShopPage }>('GET', `/marketplace/stores/${id}`, { query: point ? { lat: point.lat, lng: point.lng } : undefined });
  }

  marketSlots(id: string, q: { serviceId: string; mode: M.CareMode; from?: string; days?: number }) {
    return this.request<{ success: true; paused: boolean; durationMinutes?: number; days: M.SlotDay[] }>('GET', `/marketplace/stores/${id}/slots`, { query: q });
  }

  /** Clinics and labs near a point (public locations) plus sponsored map pins. */
  marketMap(q: { lat: number; lng: number; radiusKm?: number; kind?: M.ShopKind; city?: string }) {
    return this.request<{ success: true; shops: M.MapShop[]; sponsored: (M.MapShop & { sponsored: true; label: string; token: string; store: string; creative?: { title?: string } })[] }>('GET', '/marketplace/map', { query: q });
  }

  adClick(token: string, city?: string) {
    return this.request<{ success: true; valid: boolean }>('POST', '/marketplace/ads/click', { body: { token, city } });
  }

  careQuote(input: M.QuoteInput) {
    return this.request<{ success: true; quote: M.CareQuote }>('POST', '/marketplace/quotes', { body: input });
  }

  bookCarePlan(quoteId: string) {
    return this.request<{ success: true; plan: M.CarePlanView }>('POST', '/marketplace/plans', { body: { quoteId } });
  }

  myCarePlans() {
    return this.request<{ success: true; plans: M.CarePlanView[] }>('GET', '/marketplace/plans');
  }

  carePlan(id: string) {
    return this.request<{ success: true; plan: M.CarePlanView }>('GET', `/marketplace/plans/${id}`);
  }

  cancelCarePlan(id: string, reason?: string) {
    return this.request<{ success: true; cancelled: number; plan: M.CarePlanView }>('POST', `/marketplace/plans/${id}/cancel`, { body: { reason } });
  }

  carePlanPaymentOrder(id: string) {
    return this.request<{ success: true; order: { orderId: string; amount: number; currency: string; keyId: string } }>('POST', `/marketplace/plans/${id}/payment/order`);
  }

  verifyCarePlanPayment(id: string, body: { orderId: string; paymentId: string; signature: string }) {
    return this.request<{ success: true; plan: M.CarePlanView }>('POST', `/marketplace/plans/${id}/payment/verify`, { body });
  }

  moveSession(bookingId: string, date: string, time: string) {
    return this.request<{ success: true; session: M.PlanSession }>('PUT', `/marketplace/sessions/${bookingId}/schedule`, { body: { date, time } });
  }

  changeSessionAddress(bookingId: string, body: { addressId?: string; address?: M.QuoteInput['address']; allUpcoming?: boolean }) {
    return this.request<{ success: true; sessions: number; travelFee: number; roadKm: number; extraDue: number; credit: number }>('PUT', `/marketplace/sessions/${bookingId}/address`, { body });
  }

  reportSession(bookingId: string, kind: 'EXTRA_CASH' | 'NO_SHOW' | 'OTHER', note?: string) {
    return this.request<{ success: true; reported: boolean }>('POST', `/marketplace/sessions/${bookingId}/report`, { body: { kind, note } });
  }

  myWallet() {
    return this.request<{ success: true } & M.WalletView>('GET', '/marketplace/wallet');
  }

  myProposals() {
    return this.request<{ success: true; proposals: M.PlanProposalView[] }>('GET', '/marketplace/proposals');
  }

  declineProposal(id: string) {
    return this.request<{ success: true }>('POST', `/marketplace/proposals/${id}/decline`);
  }

  // Labs
  compareLabs(serviceIds: string[], q: { mode?: M.CareMode; lat?: number; lng?: number } = {}) {
    return this.request<{ success: true; labs: M.LabCompareRow[] }>('GET', '/marketplace/labs/compare', { query: { serviceIds: serviceIds.join(','), ...q } });
  }

  labMenu(storeId: string) {
    return this.request<{ success: true; tests: M.LabMenuItem[] }>('GET', `/marketplace/labs/${storeId}/menu`);
  }

  labQuote(input: M.LabOrderInput) {
    return this.request<{ success: true; quote: M.LabQuote }>('POST', '/marketplace/labs/quote', { body: input });
  }

  bookLabOrder(input: M.LabOrderInput) {
    return this.request<{ success: true; order: M.LabOrderView }>('POST', '/marketplace/labs/orders', { body: input });
  }

  myLabOrders() {
    return this.request<{ success: true; orders: M.LabOrderView[] }>('GET', '/marketplace/labs/orders');
  }

  labOrder(id: string) {
    return this.request<{ success: true; order: M.LabOrderView }>('GET', `/marketplace/labs/orders/${id}`);
  }

  cancelLabOrder(id: string, reason?: string) {
    return this.request<{ success: true; order: M.LabOrderView }>('POST', `/marketplace/labs/orders/${id}/cancel`, { body: { reason } });
  }

  moveLabOrder(id: string, date: string, time: string) {
    return this.request<{ success: true; order: M.LabOrderView }>('PUT', `/marketplace/labs/orders/${id}/schedule`, { body: { date, time } });
  }

  bookRecollection(id: string, date: string, time: string) {
    return this.request<{ success: true; order: M.LabOrderView }>('POST', `/marketplace/labs/orders/${id}/recollect`, { body: { date, time } });
  }

  labPaymentOrder(id: string) {
    return this.request<{ success: true; order: { orderId: string; amount: number; currency: string; keyId: string } }>('POST', `/marketplace/labs/orders/${id}/payment/order`);
  }

  verifyLabPayment(id: string, body: { orderId: string; paymentId: string; signature: string }) {
    return this.request<{ success: true; order: M.LabOrderView }>('POST', `/marketplace/labs/orders/${id}/payment/verify`, { body });
  }

  labReportLink(id: string) {
    return this.request<{ success: true; url: string; mimeType: string; expiresInSeconds: number }>('GET', `/marketplace/labs/orders/${id}/report`);
  }

  // Partner: shop, rate card, team, offers, proposals, ads
  myShop(kind?: M.ShopKind) {
    return this.request<{ success: true; kinds: M.ShopKind[]; store: M.MyShop | null; rateCard: M.MyRateCardItem[]; upcomingSessions?: number }>('GET', '/marketplace/partner/store', { query: { kind } });
  }

  saveMyShop(body: Record<string, unknown>) {
    return this.request<{ success: true; store: M.MyShop; warnings: string[] }>('PUT', '/marketplace/partner/store', { body });
  }

  saveRateCardItem(serviceId: string, body: Record<string, unknown>) {
    return this.request<{ success: true; item: M.MyRateCardItem; warnings: string[] }>('PUT', `/marketplace/partner/store/rate-card/${serviceId}`, { body });
  }

  removeRateCardItem(serviceId: string, kind?: M.ShopKind) {
    return this.request<{ success: true; warnings: string[] }>('DELETE', `/marketplace/partner/store/rate-card/${serviceId}`, { query: { kind } });
  }

  setShopOffer(serviceId: string, body: { percent: number; maxDiscount: number; kind?: M.ShopKind }) {
    return this.request<{ success: true; item: M.MyRateCardItem }>('PUT', `/marketplace/partner/store/rate-card/${serviceId}/offer`, { body });
  }

  removeShopOffer(serviceId: string, kind?: M.ShopKind) {
    return this.request<{ success: true }>('DELETE', `/marketplace/partner/store/rate-card/${serviceId}/offer`, { query: { kind } });
  }

  pauseShop(paused: boolean, kind?: M.ShopKind) {
    return this.request<{ success: true; isPaused: boolean }>('PUT', '/marketplace/partner/store/pause', { body: { paused, kind } });
  }

  addShopLeave(body: { from: string; to?: string; reason?: string; kind?: M.ShopKind }) {
    return this.request<{ success: true; leave: M.MyShop['leave']; released: number }>('POST', '/marketplace/partner/store/leave', { body });
  }

  removeShopLeave(id: string, kind?: M.ShopKind) {
    return this.request<{ success: true }>('DELETE', `/marketplace/partner/store/leave/${id}`, { query: { kind } });
  }

  myTeam(kind?: M.ShopKind) {
    return this.request<{ success: true; members: M.TeamMember[] }>('GET', '/marketplace/partner/team', { query: { kind } });
  }

  addTeamMember(body: { phone?: string; email?: string; kind?: M.ShopKind }) {
    return this.request<{ success: true; members: M.TeamMember[] }>('POST', '/marketplace/partner/team', { body });
  }

  removeTeamMember(userId: string, kind?: M.ShopKind) {
    return this.request<{ success: true; members: M.TeamMember[]; released: number }>('DELETE', `/marketplace/partner/team/${userId}`, { query: { kind } });
  }

  myShopPlans() {
    return this.request<{ success: true; plans: { _id: string; serviceName: string; mode: M.CareMode; sessionsTotal: number; sessionsCompleted: number; status: string; paymentMode: string; patientDetails?: { name?: string }; city?: string; createdAt: string }[] }>('GET', '/marketplace/partner/plans');
  }

  proposePlan(bookingId: string, body: { serviceId: string; mode: M.CareMode; sessions: number; sessionsPerWeek?: number; note?: string }) {
    return this.request<{ success: true }>('POST', `/marketplace/partner/visits/${bookingId}/proposal`, { body });
  }

  myAds() {
    return this.request<{ success: true; campaigns: M.AdCampaignView[]; wallet: M.AdWalletView }>('GET', '/marketplace/partner/ads');
  }

  createAd(body: Record<string, unknown>) {
    return this.request<{ success: true; campaign: M.AdCampaignView }>('POST', '/marketplace/partner/ads', { body });
  }

  setAdStatus(id: string, status: 'ACTIVE' | 'PAUSED' | 'ENDED') {
    return this.request<{ success: true; campaign: M.AdCampaignView }>('PUT', `/marketplace/partner/ads/${id}/status`, { body: { status } });
  }

  adTopupOrder(amount: number) {
    return this.request<{ success: true; order: { orderId: string; amount: number; currency: string; keyId: string } }>('POST', '/marketplace/partner/ads/wallet/order', { body: { amount } });
  }

  verifyAdTopup(body: { orderId: string; paymentId: string; signature: string }) {
    return this.request<{ success: true; wallet: M.AdWalletView }>('POST', '/marketplace/partner/ads/wallet/verify', { body });
  }

  // Lab partner
  labPartnerOrders(q: { date?: string; status?: string } = {}) {
    return this.request<{ success: true; orders: M.LabOrderForLab[] }>('GET', '/marketplace/partner/lab/orders', { query: q });
  }

  labCollect(id: string, body: { code?: string; paidAmount?: number; method?: 'CASH' | 'UPI' }) {
    return this.request<{ success: true; order: M.LabOrderForLab }>('POST', `/marketplace/partner/lab/orders/${id}/collect`, { body });
  }

  labAdvance(id: string, status: 'AT_LAB' | 'PROCESSING') {
    return this.request<{ success: true; order: M.LabOrderForLab }>('POST', `/marketplace/partner/lab/orders/${id}/status`, { body: { status } });
  }

  labReject(id: string, reason: string) {
    return this.request<{ success: true; order: M.LabOrderForLab }>('POST', `/marketplace/partner/lab/orders/${id}/reject`, { body: { reason } });
  }

  async uploadLabReport(id: string, file: unknown, filename = 'report.pdf'): Promise<{ success: true; order: M.LabOrderForLab }> {
    const form = new FormData();
    form.append('report', file as any, filename);
    const res = await this.send(`/marketplace/partner/lab/orders/${id}/report`, { method: 'POST', headers: { Accept: 'application/json' }, body: form });
    const text = await res.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; }
    if (!res.ok || (payload && payload.success === false)) {
      throw new ApiError(res.status, (payload && payload.message) || `Upload failed (${res.status})`, payload?.details, payload?.code);
    }
    return payload;
  }

  // Admin
  adminMarketOverview() {
    return this.request<{ success: true; overview: M.MarketplaceOverview }>('GET', '/marketplace/admin/overview');
  }

  adminMarketStores(q: { status?: string; kind?: M.ShopKind } = {}) {
    return this.request<{ success: true; stores: (M.MyShop & { owner?: { name?: string; email?: string } })[] }>('GET', '/marketplace/admin/stores', { query: q });
  }

  adminSetShopStatus(id: string, status: 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED', reason?: string) {
    return this.request<{ success: true; released: number }>('PUT', `/marketplace/admin/stores/${id}/status`, { body: { status, reason } });
  }

  adminShopStrike(id: string, reason: string) {
    return this.request<{ success: true; strikes: number }>('POST', `/marketplace/admin/stores/${id}/strikes`, { body: { reason } });
  }

  adminRefunds() {
    return this.request<{ success: true; refunds: { type: 'PLAN' | 'LAB'; id: string; customer: string; shop: string; amount: number; reason?: string; paymentId?: string; since: string }[] }>('GET', '/marketplace/admin/refunds');
  }

  adminProcessRefund(body: { type: 'PLAN' | 'LAB'; id: string; reference?: string }) {
    return this.request<{ success: true; amount: number; refundId: string }>('POST', '/marketplace/admin/refunds', { body });
  }

  adminReports() {
    return this.request<{ success: true; reports: { bookingId: string; reason: string; status: string; date: string; time: string; customer: string; professional: string; shop?: string; amount?: number }[] }>('GET', '/marketplace/admin/reports');
  }

  adminResolveReport(bookingId: string, outcome: 'NO_SHOW' | 'EXTRA_CASH' | 'DISMISS', note?: string) {
    return this.request<{ success: true; credit: number; strike: boolean }>('POST', `/marketplace/admin/reports/${bookingId}/resolve`, { body: { outcome, note } });
  }

  adminNeedsAction() {
    return this.request<{ success: true; sessions: { bookingId: string; plan: string; date: string; time: string; customer: string; shop?: string; reason: string }[] }>('GET', '/marketplace/admin/needs-action');
  }

  adminSessionsBoard(date?: string) {
    return this.request<{ success: true; sessions: { bookingId: string; time: string; status: string; mode: M.CareMode; service?: string; customer: string; professional: string; city?: string; flagged: boolean }[] }>('GET', '/marketplace/admin/sessions', { query: { date } });
  }

  adminLabBoard(q: { status?: string; late?: boolean } = {}) {
    return this.request<{ success: true; orders: { id: string; lab?: string; customer: string; tests: string[]; mode: M.CareMode; slot: { date: string; time: string }; status: string; reportDueAt?: string; late: boolean; total?: number; payment?: string }[] }>('GET', '/marketplace/admin/lab-orders', { query: { status: q.status, late: q.late ? 'true' : undefined } });
  }

  adminCatalog(kind?: M.ShopKind) {
    return this.request<{ success: true; services: (M.MarketService & { marketplace: { kind: M.ShopKind; priceFloor: number; priceCeiling: number; defaultDurationMinutes?: number; homeAllowed?: boolean; clinicAllowed?: boolean }; availability: { isActive: boolean }; shops: number })[] }>('GET', '/marketplace/admin/catalog', { query: { kind } });
  }

  adminCreateCatalogService(body: Record<string, unknown>) {
    return this.request<{ success: true }>('POST', '/marketplace/admin/catalog', { body });
  }

  adminUpdateCatalogService(id: string, body: Record<string, unknown>) {
    return this.request<{ success: true }>('PUT', `/marketplace/admin/catalog/${id}`, { body });
  }

  adminOffers(status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'PENDING') {
    return this.request<{ success: true; offers: { _id: string; service: { displayName?: string; name: string }; store: { name: string }; clinic: { price?: number }; home: { price?: number }; offer: { percent: number; maxDiscount: number; status: string } }[] }>('GET', '/marketplace/admin/offers', { query: { status } });
  }

  adminReviewOffer(itemId: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
    return this.request<{ success: true }>('PUT', `/marketplace/admin/offers/${itemId}`, { body: { decision, reason } });
  }

  adminGiveCredit(patientId: string, amount: number, reason: string) {
    return this.request<{ success: true; balance: number }>('POST', `/marketplace/admin/customers/${patientId}/credit`, { body: { amount, reason } });
  }

  adminAds(status?: string) {
    return this.request<{ success: true; campaigns: M.AdCampaignView[]; report: { date: string; placement: string; impressions: number; clicks: number; spend: number; bookings: number; invalidClicks: number }[] }>('GET', '/marketplace/admin/ads', { query: { status } });
  }

  adminReviewAd(id: string, decision: 'APPROVE' | 'REJECT' | 'PAUSE' | 'RESUME', reason?: string) {
    return this.request<{ success: true }>('PUT', `/marketplace/admin/ads/${id}`, { body: { decision, reason } });
  }

  adminCreateHouseAd(body: { name: string; product?: 'SPOTLIGHT' | 'CATEGORY_BANNER'; creative: { title: string; subtitle?: string; ctaPath?: string }; services?: string[]; cities?: string[] }) {
    return this.request<{ success: true }>('POST', '/marketplace/admin/ads/house', { body });
  }

  adminSettings() {
    return this.request<{ success: true; fields: M.SettingField[]; blockedCities: string[]; pending: { _id: string; key: string; changes: { path: string; value: unknown; previous: unknown }[]; reason: string; proposedBy?: { name?: string }; createdAt: string }[]; history: { _id: string; key: string; status: string; changes: { path: string; value: unknown; previous: unknown }[]; reason: string; createdAt: string; selfApproved?: boolean }[] }>('GET', '/marketplace/admin/settings');
  }

  adminProposeSetting(body: { key: 'revenue' | 'ads'; changes?: Record<string, number | boolean>; blockedCities?: string[]; reason: string }) {
    return this.request<{ success: true }>('POST', '/marketplace/admin/settings', { body });
  }

  adminReviewSetting(id: string, decision: 'APPROVE' | 'REJECT', note?: string) {
    return this.request<{ success: true }>('PUT', `/marketplace/admin/settings/${id}`, { body: { decision, note } });
  }

}

export function createApiClient(opts: ApiClientOptions): MedRushApi {
  return new MedRushApi(opts);
}

export type CallbackTopic = 'BOOKING' | 'VISIT' | 'MEDICINES' | 'LAB' | 'PAYMENT' | 'OTHER';
export interface CallbackView { _id: string; topic: CallbackTopic; note?: string; status: 'OPEN' | 'CALLED' | 'CLOSED'; outcome?: string; createdAt: string; handledAt?: string }

export interface FamilyLinkView { _id: string; role: 'HELPER' | 'MEMBER'; status: 'PENDING' | 'ACTIVE'; relation?: string; person: { _id: string; name: string } | null; createdAt: string }
export interface FamilyMemberCare {
  member: { _id: string; name: string };
  visits: { _id: string; serviceType: string; status: string; scheduledDate: string; scheduledTime: string; professional?: string; planId?: string }[];
  plans: { _id: string; serviceName: string; store?: string; status: string; sessionsTotal: number; sessionsCompleted: number }[];
  labOrders: { _id: string; lab?: string; tests: string[]; status: string; slot: { date: string; time: string } }[];
}
export type CareLogKind = 'MEAL' | 'MEDICINE' | 'VITALS' | 'ACTIVITY' | 'NOTE';
export interface CareVitals { bpSys?: number; bpDia?: number; sugar?: number; pulse?: number; spo2?: number; temp?: number }
export interface CareLogView {
  bookingId: string; serviceType: string; status: string; scheduledDate: string; scheduledTime: string; professional?: string;
  startedAt?: string; completedAt?: string;
  entries: { _id: string; kind: CareLogKind; text?: string; vitals?: CareVitals; at: string }[];
}

export interface RiderEarning { earned: number; drops: number; cashCollected: number }
export interface RiderDrop {
  orderId: string; orderNumber: string; deliveryStatus: string; coldChain: boolean; items: number; collectCash: number;
  address: { line1?: string; line2?: string; city?: string }; contactName?: string | null; contactPhone?: string | null; lat?: number; lng?: number; pay: number;
}
export interface RiderBatch { store: { _id: string; name: string; address?: { line1?: string; city?: string }; phone?: string; lat?: number; lng?: number }; drops: RiderDrop[] }

export interface RefillView {
  _id: string; vendor: { _id: string; name?: string }; items: { medicine: string; name?: string; quantity: number }[];
  everyDays: 15 | 30 | 60 | 90; nextDue: string; status: 'ACTIVE' | 'PAUSED' | 'CANCELLED'; fromOrder: string; lastOrder?: string; dueSoon: boolean;
}
