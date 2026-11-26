import { razorpayCheckoutConfig, type OnlinePayMethod, type PharmacyOrder, type RazorpayHandlerResponse } from '@medrush/shared';
import { api } from '@/lib/api';

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/** Thrown when the patient closes the Razorpay modal without paying. */
export class PaymentDismissedError extends Error {
  constructor() {
    super('Payment was not completed');
    this.name = 'PaymentDismissedError';
  }
}

type RazorpayCtor = new (options: Record<string, unknown>) => {
  open(): void;
  on(event: 'payment.failed', cb: (resp: { error?: { description?: string } }) => void): void;
};

let scriptPromise: Promise<RazorpayCtor> | null = null;

function loadCheckout(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = CHECKOUT_SRC;
      el.async = true;
      el.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error('Razorpay failed to load')));
      el.onerror = () => {
        scriptPromise = null; // allow a retry
        reject(new Error('Could not load the payment window. Check your connection and try again.'));
      };
      document.body.appendChild(el);
    });
  }
  return scriptPromise;
}

/**
 * Run the full prepaid flow for an existing PREPAID order:
 * create/reuse gateway order → Razorpay modal → server-side verification.
 * Resolves with the PAID order; rejects with PaymentDismissedError if the
 * modal is closed (the order stays payable until it expires).
 */
async function payForOrderOnce(
  orderId: string,
  prefill: { name?: string; email?: string; contact?: string } = {},
  method?: OnlinePayMethod
): Promise<PharmacyOrder> {
  // Phones' browsers can hand off to a UPI app; desktops get a UPI QR / UPI ID.
  const intent = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const [Razorpay, checkout] = await Promise.all([loadCheckout(), api.startPayment(orderId)]);

  const response = await new Promise<RazorpayHandlerResponse>((resolve, reject) => {
    let lastFailure: string | undefined;
    const rzp = new Razorpay({
      key: checkout.razorpayKeyId,
      order_id: checkout.gatewayOrder.id,
      amount: checkout.gatewayOrder.amount,
      currency: checkout.gatewayOrder.currency,
      name: 'Nabz',
      description: `Order #${checkout.order.orderNumber}`,
      prefill,
      ...(method ? { config: razorpayCheckoutConfig(method, { intent }) } : {}),
      theme: { color: '#b83a50' },
      handler: (resp: RazorpayHandlerResponse) => resolve(resp),
      modal: {
        // Razorpay lets the patient retry inside the modal, so failures are
        // only final once they close it.
        ondismiss: () => {
          if (lastFailure) {
            api.reportPaymentFailure(orderId, lastFailure).catch(() => {});
          }
          reject(new PaymentDismissedError());
        }
      }
    });
    rzp.on('payment.failed', (resp) => {
      lastFailure = resp.error?.description || 'Payment failed';
    });
    rzp.open();
  });

  const verified = await api.verifyPayment(orderId, response);
  return verified.order;
}

/** Nabz Plus: Razorpay modal for the plan price → server-side verification. */
async function payForMembershipOnce(plan: string | undefined, prefill: { name?: string; email?: string; contact?: string } = {}, couponCode?: string): Promise<void> {
  const [Razorpay, checkout] = await Promise.all([loadCheckout(), api.membershipCheckout(plan, couponCode)]);
  const response = await new Promise<RazorpayHandlerResponse>((resolve, reject) => {
    const rzp = new Razorpay({
      key: checkout.keyId,
      order_id: checkout.razorpayOrderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: 'Nabz Plus',
      description: 'Membership · free delivery, no visit platform fee',
      prefill,
      theme: { color: '#b83a50' },
      handler: (resp: RazorpayHandlerResponse) => resolve(resp),
      modal: { ondismiss: () => reject(new PaymentDismissedError()) }
    });
    rzp.open();
  });
  await api.verifyMembership(response);
}

/** Care plan paid upfront: Razorpay modal for the plan total → server-side verification. */
async function payForCarePlanOnce(planId: string, prefill: { name?: string; email?: string; contact?: string } = {}): Promise<void> {
  const [Razorpay, created] = await Promise.all([loadCheckout(), api.carePlanPaymentOrder(planId)]);
  const order = created.order;
  const response = await new Promise<RazorpayHandlerResponse>((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: Math.round(order.amount * 100),
      currency: order.currency,
      name: 'Nabz',
      description: 'Care plan',
      prefill,
      theme: { color: '#b83a50' },
      handler: (resp: RazorpayHandlerResponse) => resolve(resp),
      modal: { ondismiss: () => reject(new PaymentDismissedError()) }
    });
    rzp.open();
  });
  await api.verifyCarePlanPayment(planId, { orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature });
}

/** Lab tests paid online: Razorpay modal for the booking total → server-side verification. */
async function payForLabOrderOnce(orderId: string, prefill: { name?: string; email?: string; contact?: string } = {}): Promise<void> {
  const [Razorpay, created] = await Promise.all([loadCheckout(), api.labPaymentOrder(orderId)]);
  const order = created.order;
  const response = await new Promise<RazorpayHandlerResponse>((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.keyId, order_id: order.orderId, amount: Math.round(order.amount * 100), currency: order.currency,
      name: 'Nabz', description: 'Lab tests', prefill, theme: { color: '#b83a50' },
      handler: (resp: RazorpayHandlerResponse) => resolve(resp),
      modal: { ondismiss: () => reject(new PaymentDismissedError()) }
    });
    rzp.open();
  });
  await api.verifyLabPayment(orderId, { orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature });
}

/** Partner ad wallet top-up: Razorpay modal → server-side verification. */
async function payForAdTopupOnce(amount: number): Promise<void> {
  const [Razorpay, created] = await Promise.all([loadCheckout(), api.adTopupOrder(amount)]);
  const order = created.order;
  const response = await new Promise<RazorpayHandlerResponse>((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.keyId, order_id: order.orderId, amount: Math.round(order.amount * 100), currency: order.currency,
      name: 'Nabz Ads', description: 'Ad wallet top-up', theme: { color: '#b83a50' },
      handler: (resp: RazorpayHandlerResponse) => resolve(resp),
      modal: { ondismiss: () => reject(new PaymentDismissedError()) }
    });
    rzp.open();
  });
  await api.verifyAdTopup({ orderId: response.razorpay_order_id, paymentId: response.razorpay_payment_id, signature: response.razorpay_signature });
}

/**
 * One payment window at a time. A second click on a Pay button while that
 * payment is open gets the same result instead of opening another window
 * (the server also refunds a second captured payment).
 */
let openPayment: { key: string; promise: Promise<unknown> } | null = null;
function onePayment<T>(key: string, run: () => Promise<T>): Promise<T> {
  if (openPayment) {
    if (openPayment.key === key) return openPayment.promise as Promise<T>;
    return Promise.reject(new Error('Another payment is already open. Finish or close it first.'));
  }
  const promise = run().finally(() => { openPayment = null; });
  openPayment = { key, promise };
  return promise;
}

export function payForOrder(orderId: string,
  prefill: { name?: string; email?: string; contact?: string } = {},
  method?: OnlinePayMethod): Promise<PharmacyOrder> {
  return onePayment(`pharmacy:${orderId}`, () => payForOrderOnce(orderId, prefill, method));
}

export function payForMembership(prefill: { name?: string; email?: string; contact?: string } = {}, plan?: string, couponCode?: string): Promise<void> {
  return onePayment(`membership`, () => payForMembershipOnce(plan, prefill, couponCode));
}

export function payForCarePlan(planId: string, prefill: { name?: string; email?: string; contact?: string } = {}): Promise<void> {
  return onePayment(`plan:${planId}`, () => payForCarePlanOnce(planId, prefill));
}

export function payForLabOrder(orderId: string, prefill: { name?: string; email?: string; contact?: string } = {}): Promise<void> {
  return onePayment(`lab:${orderId}`, () => payForLabOrderOnce(orderId, prefill));
}

export function payForAdTopup(amount: number): Promise<void> {
  return onePayment(`ads:${amount}`, () => payForAdTopupOnce(amount));
}
