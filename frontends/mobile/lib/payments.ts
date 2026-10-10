import RazorpayCheckout from 'react-native-razorpay';
import { razorpayCheckoutConfig, type OnlinePayMethod, type PharmacyOrder } from '@medrush/shared';
import { api } from './api';
import { C } from './theme';

/** The customer closed the payment screen without paying (the order stays payable until it expires). */
export class PaymentDismissedError extends Error {
  constructor() {
    super('Payment was not completed');
    this.name = 'PaymentDismissedError';
  }
}

type RazorpayError = { code?: number | string; description?: string; error?: { description?: string; reason?: string } };

function isCancel(e: RazorpayError) {
  const text = `${e.description || ''} ${e.error?.description || ''} ${e.error?.reason || ''}`.toLowerCase();
  return /cancel|dismiss|back pressed|payment_cancelled/.test(text);
}

/**
 * Pay for a PREPAID pharmacy order with the method picked in our sheet.
 * Razorpay processes it; for GPay / PhonePe / Paytm it opens that UPI app directly.
 * The server verifies the payment signature before the order goes to the store.
 */
export async function payOrderOnline(
  orderId: string,
  method: OnlinePayMethod,
  prefill: { name?: string; email?: string } = {}
): Promise<PharmacyOrder> {
  const checkout = await api.startPayment(orderId);
  let result: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
  try {
    result = await RazorpayCheckout.open({
      key: checkout.razorpayKeyId,
      order_id: checkout.gatewayOrder.id,
      amount: checkout.gatewayOrder.amount,
      currency: checkout.gatewayOrder.currency,
      name: 'Nabz',
      description: `Order #${checkout.order.orderNumber}`,
      prefill: { name: prefill.name, email: prefill.email },
      theme: { color: C.brand },
      config: razorpayCheckoutConfig(method, { intent: true })
    });
  } catch (e) {
    const err = (e || {}) as RazorpayError;
    if (isCancel(err)) throw new PaymentDismissedError();
    const reason = err.error?.description || err.description || 'Payment failed';
    api.reportPaymentFailure(orderId, reason).catch(() => undefined);
    throw new Error(reason);
  }
  const verified = await api.verifyPayment(orderId, {
    razorpay_order_id: result.razorpay_order_id,
    razorpay_payment_id: result.razorpay_payment_id,
    razorpay_signature: result.razorpay_signature
  });
  return verified.order;
}

/** PREPAID order still waiting for payment (can be paid from Bookings). */
export const awaitingPayment = (o: PharmacyOrder) =>
  o.paymentMode === 'PREPAID' && ['PENDING', 'FAILED'].includes(o.paymentStatus) && o.status === 'PLACED';

type GatewayOrder = { orderId: string; amount: number; currency: string; keyId: string };
type Prefill = { name?: string; email?: string; contact?: string };

/** Razorpay checkout for a server-created order; returns the signed result (or throws PaymentDismissedError). */
async function openCheckout(order: GatewayOrder, description: string, prefill: Prefill = {}) {
  try {
    const r = await RazorpayCheckout.open({
      key: order.keyId,
      order_id: order.orderId,
      amount: Math.round(order.amount * 100),
      currency: order.currency,
      name: 'Nabz',
      description,
      prefill,
      theme: { color: C.brand }
    });
    return { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature };
  } catch (e) {
    const err = (e || {}) as RazorpayError;
    if (isCancel(err)) throw new PaymentDismissedError();
    throw new Error(err.error?.description || err.description || 'Payment failed');
  }
}

/** Care plan paid upfront. The server checks the signature before the plan becomes active. */
export async function payCarePlan(planId: string, prefill?: Prefill) {
  const { order } = await api.carePlanPaymentOrder(planId);
  const signed = await openCheckout(order, 'Care plan', prefill);
  return (await api.verifyCarePlanPayment(planId, signed)).plan;
}

/** Lab tests paid online. */
export async function payLabOrder(orderId: string, prefill?: Prefill) {
  const { order } = await api.labPaymentOrder(orderId);
  const signed = await openCheckout(order, 'Lab tests', prefill);
  return (await api.verifyLabPayment(orderId, signed)).order;
}

/** Partner ad wallet top-up. */
export async function payAdTopup(amount: number, prefill?: Prefill) {
  const { order } = await api.adTopupOrder(amount);
  const signed = await openCheckout(order, 'Nabz Ads wallet', prefill);
  return (await api.verifyAdTopup(signed)).wallet;
}
