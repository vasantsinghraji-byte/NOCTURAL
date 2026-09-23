import type { PharmacyOrder, RazorpayHandlerResponse } from '@medrush/shared';
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
export async function payForOrder(
  orderId: string,
  prefill: { name?: string; email?: string; contact?: string } = {}
): Promise<PharmacyOrder> {
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
      theme: { color: '#1f45e0' },
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
export async function payForMembership(prefill: { name?: string; email?: string; contact?: string } = {}): Promise<void> {
  const [Razorpay, checkout] = await Promise.all([loadCheckout(), api.membershipCheckout()]);
  const response = await new Promise<RazorpayHandlerResponse>((resolve, reject) => {
    const rzp = new Razorpay({
      key: checkout.keyId,
      order_id: checkout.razorpayOrderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: 'Nabz Plus',
      description: 'Membership · free delivery, no visit platform fee',
      prefill,
      theme: { color: '#1f45e0' },
      handler: (resp: RazorpayHandlerResponse) => resolve(resp),
      modal: { ondismiss: () => reject(new PaymentDismissedError()) }
    });
    rzp.open();
  });
  await api.verifyMembership(response);
}
