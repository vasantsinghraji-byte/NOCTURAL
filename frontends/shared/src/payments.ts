/**
 * Payment methods shown in Nabz's own checkout sheet (quick-commerce style:
 * pick GPay / PhonePe / Paytm / card / cash first, then pay).
 *
 * Razorpay stays the processor. `razorpayCheckoutConfig` narrows Razorpay's
 * checkout to the method the customer already picked, so tapping "GPay" goes
 * straight to the GPay app (UPI intent) instead of showing Razorpay's full list.
 */

export type OnlinePayMethod = 'gpay' | 'phonepe' | 'paytm' | 'upi' | 'card' | 'netbanking';
export type PayMethod = OnlinePayMethod | 'cod';

/** Razorpay's UPI app codes for intent payments. */
const UPI_APPS: Partial<Record<OnlinePayMethod, string>> = {
  gpay: 'google_pay',
  phonepe: 'phonepe',
  paytm: 'paytm'
};

export const PAY_METHOD_LABELS: Record<PayMethod, string> = {
  gpay: 'Google Pay',
  phonepe: 'PhonePe',
  paytm: 'Paytm',
  upi: 'Any UPI app',
  card: 'Credit / debit card',
  netbanking: 'Netbanking',
  cod: 'Cash on delivery'
};

/**
 * Razorpay checkout `config` for one method.
 * `intent`: the device can open UPI apps (Android app). Browsers get UPI QR / UPI ID instead.
 */
export function razorpayCheckoutConfig(method: OnlinePayMethod, { intent }: { intent: boolean }) {
  let instrument: Record<string, unknown>;
  const app = UPI_APPS[method];
  if (app) {
    instrument = intent ? { method: 'upi', flows: ['intent'], apps: [app] } : { method: 'upi' };
  } else if (method === 'upi') {
    instrument = intent ? { method: 'upi', flows: ['intent', 'collect'] } : { method: 'upi' };
  } else {
    instrument = { method };
  }
  return {
    display: {
      blocks: { nabz: { name: `Pay with ${PAY_METHOD_LABELS[method]}`, instruments: [instrument] } },
      sequence: ['block.nabz'],
      preferences: { show_default_blocks: false }
    }
  };
}
