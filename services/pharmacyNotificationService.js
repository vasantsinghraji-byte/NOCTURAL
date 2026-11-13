/**
 * Pharmacy order notifications — "a new order is waiting" for the store.
 *
 * Fired when an order becomes actionable for the vendor: COD orders at
 * placement, PREPAID orders once payment is captured (unpaid orders are hidden
 * from vendors). Every staff account of the store gets:
 *   - an in-app Notification row (the vendor app/web can list these), and
 *   - an FCM push to each registered device (when FIREBASE_PUSH_ENABLED=true).
 *
 * Never throws: a notification failure must not fail checkout or payment.
 */

const Notification = require('../models/notification');
const PharmacyVendor = require('../models/pharmacyVendor');
const User = require('../models/user');
const pushNotificationService = require('./pushNotificationService');
const logger = require('../utils/logger');

const NEW_ORDER_TYPE = 'PHARMACY_ORDER_NEW';

/** Staff accounts linked to a store, plus its owner. */
async function getVendorRecipientIds(vendorId) {
  const [vendor, staff] = await Promise.all([
    PharmacyVendor.findById(vendorId).select('owner name').lean(),
    User.find({ pharmacyVendor: vendorId, role: 'pharmacy_vendor', isActive: { $ne: false } })
      .select('_id')
      .lean()
  ]);
  const ids = new Set(staff.map((u) => String(u._id)));
  if (vendor && vendor.owner) ids.add(String(vendor.owner));
  return { vendorName: vendor ? vendor.name : undefined, userIds: [...ids] };
}

function describeOrder(order) {
  const count = (order.items || []).reduce((sum, item) => sum + (item.quantity || 0), 0);
  const total = order.amounts && order.amounts.total !== undefined ? `₹${order.amounts.total}` : '';
  const payment = order.paymentMode === 'COD' ? 'Cash on delivery' : 'Paid online';
  const rx = order.requiresPrescription ? ' · Rx check needed' : '';
  if (order.fulfilment === 'STAFF_PICKUP' && order.careVisit) {
    const when = [order.careVisit.scheduledDate && new Date(order.careVisit.scheduledDate).toISOString().slice(0, 10),
      order.careVisit.scheduledTime].filter(Boolean).join(' ');
    return `🩺 Nurse pickup for home visit ${when} · ${count} item(s) · ${total}${rx}`;
  }
  return `${count} item(s) · ${total} · ${payment}${rx}`;
}

async function notifyVendorNewOrder(order) {
  return notifyStore(order, { type: NEW_ORDER_TYPE, title: `New order ${order.orderNumber || ''}`.trim(), message: describeOrder(order) });
}

/** The customer added items inside the change window: the store must pack them too. */
async function notifyVendorItemsAdded(order, addedLines) {
  return notifyStore(order, {
    type: 'PHARMACY_ORDER_UPDATE',
    title: `Items added to ${order.orderNumber || 'an order'}`.trim(),
    message: `Customer added ${addedLines} item(s). Now ${describeOrder(order)}`
  });
}

async function notifyStore(order, { type, title, message }) {
  try {
    const { userIds } = await getVendorRecipientIds(order.vendor);
    if (userIds.length === 0) {
      logger.warn('Pharmacy order has no vendor staff to notify', {
        orderId: String(order._id), vendorId: String(order.vendor), type
      });
      return { notified: 0 };
    }

    const data = { type, orderId: String(order._id), orderNumber: order.orderNumber };

    await Promise.all(userIds.map(async (userId) => {
      const notification = await Notification.create({
        user: userId,
        recipientModel: 'User',
        type,
        title,
        message,
        priority: 'URGENT',
        actionUrl: '/vendor',
        actionLabel: 'View order',
        channels: { inApp: true, push: true },
        metadata: data,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });

      let push;
      try {
        push = await pushNotificationService.sendToOwner({
          owner: userId, userType: 'provider', title, body: message, data
        });
      } catch (err) {
        push = { sentCount: 0, error: err.message };
      }
      await Notification.updateOne({ _id: notification._id }, {
        $set: {
          'deliveryStatus.push.sent': push.sentCount > 0,
          ...(push.sentCount > 0 ? { 'deliveryStatus.push.sentAt': new Date() } : {}),
          ...(push.error ? { 'deliveryStatus.push.error': String(push.error).slice(0, 200) } : {})
        }
      });
    }));

    logger.info('Vendor notified about pharmacy order', {
      orderId: String(order._id), recipients: userIds.length, type
    });
    return { notified: userIds.length };
  } catch (err) {
    logger.error('Failed to notify vendor about pharmacy order', {
      orderId: order && String(order._id), error: err.message, type
    });
    return { notified: 0, error: err.message };
  }
}

module.exports = {
  NEW_ORDER_TYPE,
  notifyVendorNewOrder,
  notifyVendorItemsAdded
};
