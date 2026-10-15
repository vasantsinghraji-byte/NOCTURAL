import { api, describeNetworkError } from './api';
import { inr } from './care';
import { appAlert } from './dialog';

/**
 * Cancel a home visit, showing the server's cancellation quote first:
 * free until the nurse is on the way, a fee after that, not possible once started.
 */
export async function confirmCancelVisit(id: string, reason: string, onDone: () => void, onError: (msg: string) => void) {
  let fee = 0;
  try {
    const { quote } = await api.getCareCancelQuote(id);
    if (!quote.allowed) {
      appAlert('Can’t cancel now', quote.reason || 'This visit has already started. Talk to your nurse or contact Nabz support.');
      return;
    }
    fee = quote.fee || 0;
  } catch (e) {
    onError(describeNetworkError(e));
    return;
  }
  const message = fee > 0
    ? `Your nurse is already on the way, so a cancellation fee of ${inr(fee)} applies. It will be added to your next booking.`
    : 'Free to cancel right now. Supplies ordered for this visit will be cancelled too.';
  appAlert(fee > 0 ? `Cancel for ${inr(fee)}?` : 'Cancel this visit?', message, [
    { text: 'Keep visit', style: 'cancel' },
    {
      text: fee > 0 ? `Cancel · ${inr(fee)}` : 'Cancel visit',
      style: 'destructive',
      onPress: () => { api.cancelCareBooking(id, reason).then(onDone).catch((e) => onError(describeNetworkError(e))); }
    }
  ]);
}

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Offer a few new slots for a visit no nurse took ("no nurse available"). */
export function chooseReschedule(id: string, onDone: () => void, onError: (msg: string) => void) {
  const now = new Date();
  const inAnHour = new Date(now.getTime() + 60 * 60000);
  inAnHour.setMinutes(Math.ceil(inAnHour.getMinutes() / 15) * 15, 0, 0);
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const slots: Array<{ label: string; when: Date }> = [{ label: `In about an hour (${localTime(inAnHour)})`, when: inAnHour }];
  const evening = at(0, 18);
  if (evening.getTime() - now.getTime() > 2 * 3600000) slots.push({ label: 'This evening, 6:00 PM', when: evening });
  slots.push({ label: 'Tomorrow, 9:00 AM', when: at(1, 9) }, { label: 'Tomorrow, 6:00 PM', when: at(1, 18) });

  appAlert('Pick another time', 'Everyone nearby was busy. We’ll look for a professional again for the time you pick.', [
    ...slots.map((s) => ({
      text: s.label,
      onPress: () => {
        api.rescheduleCareBooking(id, localDate(s.when), localTime(s.when))
          .then(() => { appAlert('Visit moved', `We’ll find you a professional for ${s.label.replace(/^In about an hour \((.*)\)$/, 'today at $1')}.`); onDone(); })
          .catch((e) => onError(describeNetworkError(e)));
      }
    })),
    { text: 'Not now', style: 'cancel' as const }
  ]);
}
