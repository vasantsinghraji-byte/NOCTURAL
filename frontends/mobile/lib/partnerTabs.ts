/**
 * Which bottom tabs each partner role sees in the Nabz Partner app.
 * Pure data and functions (no React Native) so it can be unit-tested with
 * `node --test` (see partnerTabs.test.ts).
 */

export const STAFF_ROLES = ['nurse', 'physiotherapist', 'medical_staff'];
export const LAB_ROLES = ['lab_partner', 'phlebotomist'];

/** Every partner tab route, in bottom-bar order. */
export const PARTNER_TAB_ORDER = ['store', 'vendor', 'stock', 'earnings', 'staff', 'lab', 'rider', 'shop', 'partner-ads', 'me'] as const;
export type PartnerTab = (typeof PARTNER_TAB_ORDER)[number];

/** Does this role open the partner tabs at all? */
export function isPartnerRole(role: string): boolean {
  return STAFF_ROLES.includes(role) || LAB_ROLES.includes(role) || role === 'delivery_partner' || role === 'pharmacy_vendor';
}

/**
 * The tabs a role sees. Pharmacies: Today, Orders, Stock, Money. Nurses and
 * physios: Visits. Labs: Lab desk. Riders: Deliveries. Shop owners (staff and
 * lab owners, not riders, pharmacies or phlebotomists): My Shop and Ads.
 * Everyone: Account.
 */
export function partnerTabsFor(role: string): PartnerTab[] {
  const lab = LAB_ROLES.includes(role);
  const staff = STAFF_ROLES.includes(role);
  const rider = role === 'delivery_partner';
  const pharmacy = role === 'pharmacy_vendor';
  const owner = (staff || lab) && role !== 'phlebotomist';
  const on: Record<PartnerTab, boolean> = {
    store: pharmacy, vendor: pharmacy, stock: pharmacy, earnings: pharmacy,
    staff, lab, rider,
    shop: owner, 'partner-ads': owner,
    me: isPartnerRole(role)
  };
  return PARTNER_TAB_ORDER.filter((t) => on[t]);
}

/** The tab a role lands on after signing in. */
export function initialPartnerTab(role: string): PartnerTab {
  if (role === 'pharmacy_vendor') return 'store';
  if (role === 'delivery_partner') return 'rider';
  if (LAB_ROLES.includes(role)) return 'lab';
  return 'staff';
}

/**
 * A tab expo-router hides because its screen has `href: null`. expo-router
 * removes `href` from the options and marks the tab with display: 'none'
 * instead, so checking `href` alone lets every tab through.
 */
export function isHiddenTab(options: object): boolean {
  const o = options as { href?: unknown; tabBarItemStyle?: unknown };
  if (o.href === null) return true;
  const flat = ([] as unknown[]).concat(o.tabBarItemStyle ?? []).flat(Infinity) as Array<{ display?: string } | null | false>;
  return flat.some((s) => !!s && typeof s === 'object' && s.display === 'none');
}
