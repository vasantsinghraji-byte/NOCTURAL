import type { CareBooking, ChatThreadView, PharmacyOrder } from '@medrush/shared';
import { istNow, istYmd } from './visitSlots';

/**
 * The customer's current visit or medicine order for the live strip above the
 * tabs (lib/activeOrder.tsx). Pure, so it is unit-tested (activeItems.test.ts).
 */
const fmtTime = (hhmm = '') => {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return hhmm;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

export interface ActiveItem {
  key: string;
  kind: 'VISIT' | 'ORDER';
  id: string;
  title: string;
  subtitle: string;
  /** Something is happening right now (pulse). */
  live: boolean;
  unread: number;
  /** Other active visits/orders besides this one. */
  more: number;
}

const VISIT_LIVE = ['ASSIGNED', 'CONFIRMED', 'EN_ROUTE', 'IN_PROGRESS'];
const ORDER_LIVE = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];

const first = (name?: string) => (name || '').trim().split(/\s+/)[0] || 'Your professional';
const providerName = (b: CareBooking) => (b.serviceProvider && typeof b.serviceProvider === 'object' ? b.serviceProvider.name : undefined);
const serviceLabel = (t: string) => t.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Which visits and orders belong on the strip, most urgent first (exported for tests). */
export function pickActive(visits: CareBooking[], orders: PharmacyOrder[], threads: ChatThreadView[], todayKey = istYmd(istNow())): ActiveItem[] {
  const threadFor = (id: string) => threads.find((t) => String(t.ref) === String(id));
  const out: Array<ActiveItem & { rank: number }> = [];
  for (const b of visits) {
    const day = String(b.scheduledDate || '').slice(0, 10);
    const asap = b.dispatch?.mode === 'ASAP';
    const onTheMove = b.status === 'EN_ROUTE' || b.status === 'IN_PROGRESS';
    const searching = b.status === 'REQUESTED' && asap;
    const today = VISIT_LIVE.includes(b.status) && (day === todayKey || asap);
    if (!onTheMove && !searching && !today) continue;
    const who = first(providerName(b));
    const thread = threadFor(b._id);
    const fromThem = thread?.lastMessage && thread.lastMessage.by !== thread.me ? thread.lastMessage.text : null;
    const title = b.status === 'IN_PROGRESS' ? 'Visit in progress'
      : b.status === 'EN_ROUTE' ? `${who} is on the way`
        : b.status === 'REQUESTED' ? (b.dispatch?.status === 'NO_STAFF' ? 'No professional free right now' : 'Finding your professional…')
          : asap ? `${who} accepted your visit` : `${who} is coming at ${fmtTime(b.scheduledTime)}`;
    out.push({
      key: `v${b._id}`, kind: 'VISIT', id: b._id, title, live: onTheMove || searching,
      subtitle: thread?.unread && fromThem ? `${who}: ${fromThem}` : `${serviceLabel(b.serviceType)} · Tap to track`,
      unread: thread?.unread || 0, more: 0,
      rank: b.status === 'IN_PROGRESS' ? 0 : b.status === 'EN_ROUTE' ? 1 : searching ? 2 : 3
    });
  }
  for (const o of orders) {
    if (!ORDER_LIVE.includes(o.status)) continue;
    const store = typeof o.vendor === 'object' && o.vendor ? o.vendor.name : 'the pharmacy';
    const thread = threadFor(o._id);
    const title = o.status === 'PLACED' ? `Waiting for ${store} to accept`
      : o.status === 'OUT_FOR_DELIVERY' ? 'Medicines on the way'
        : o.status === 'READY_FOR_PICKUP' ? 'Packed, waiting for the rider' : 'Packing your medicines';
    out.push({
      key: `o${o._id}`, kind: 'ORDER', id: o._id, title, live: o.status === 'OUT_FOR_DELIVERY',
      subtitle: `Order ${o.orderNumber} · ${o.items.length} item${o.items.length === 1 ? '' : 's'}`,
      unread: thread?.unread || 0, more: 0,
      rank: o.status === 'OUT_FOR_DELIVERY' ? 1.5 : o.status === 'READY_FOR_PICKUP' ? 2.5 : o.status === 'PLACED' ? 4 : 3.5
    });
  }
  out.sort((a, b) => a.rank - b.rank);
  return out.map(({ rank: _rank, ...item }, i, all) => ({ ...item, more: i === 0 ? all.length - 1 : 0 }));
}
