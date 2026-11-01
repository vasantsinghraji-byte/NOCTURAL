/**
 * Partner app bottom tabs: who sees what, and that hidden tabs really hide.
 * Run: node --test lib/partnerTabs.test.ts  (Node 22.6+ strips the types)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialPartnerTab, isHiddenTab, isPartnerRole, partnerTabsFor } from './partnerTabs.ts';

test('nurses and physios see Visits, My Shop, Ads and Account only (no pharmacy tabs)', () => {
  for (const role of ['nurse', 'physiotherapist', 'medical_staff']) {
    assert.deepEqual(partnerTabsFor(role), ['staff', 'shop', 'partner-ads', 'me'], role);
  }
});

test('pharmacies see Today, Orders, Stock, Money and Account', () => {
  assert.deepEqual(partnerTabsFor('pharmacy_vendor'), ['store', 'vendor', 'stock', 'earnings', 'me']);
});

test('riders see Deliveries and Account', () => {
  assert.deepEqual(partnerTabsFor('delivery_partner'), ['rider', 'me']);
});

test('labs get the Lab desk and their shop; phlebotomists work inside a lab, so no shop', () => {
  assert.deepEqual(partnerTabsFor('lab_partner'), ['lab', 'shop', 'partner-ads', 'me']);
  assert.deepEqual(partnerTabsFor('phlebotomist'), ['lab', 'me']);
});

test('no role ever gets more than five tabs (the bar stays readable)', () => {
  for (const role of ['nurse', 'physiotherapist', 'medical_staff', 'pharmacy_vendor', 'delivery_partner', 'lab_partner', 'phlebotomist']) {
    assert.ok(partnerTabsFor(role).length <= 5, `${role}: ${partnerTabsFor(role).join(', ')}`);
  }
});

test('customers, admins and the onboarding team are not partner roles', () => {
  for (const role of ['patient', 'platform_admin', 'admin', 'onboarding_reviewer', '']) {
    assert.equal(isPartnerRole(role), false, role);
    assert.deepEqual(partnerTabsFor(role), [], role);
  }
});

test('each role lands on its main tab', () => {
  assert.equal(initialPartnerTab('pharmacy_vendor'), 'store');
  assert.equal(initialPartnerTab('delivery_partner'), 'rider');
  assert.equal(initialPartnerTab('lab_partner'), 'lab');
  assert.equal(initialPartnerTab('nurse'), 'staff');
});

test('a tab hidden with href: null is hidden in the shape expo-router really passes', () => {
  // expo-router (layouts/TabsClient) removes `href` and sets these instead.
  const hidden = { title: 'Money', tabBarItemStyle: { display: 'none' }, tabBarButton: () => null };
  const shown = { title: 'Visits', tabBarItemStyle: undefined };
  assert.equal(isHiddenTab(hidden), true);
  assert.equal(isHiddenTab(shown), false);
  // The old check (href === null) let both through: this is the bug from the screenshot.
  assert.equal((hidden as { href?: unknown }).href === null, false);
});

test('hidden-tab check copes with style arrays and the raw href form', () => {
  assert.equal(isHiddenTab({ tabBarItemStyle: [{ padding: 4 }, [{ display: 'none' }]] }), true);
  assert.equal(isHiddenTab({ tabBarItemStyle: [null, false, { display: 'flex' }] }), false);
  assert.equal(isHiddenTab({ href: null }), true);
  assert.equal(isHiddenTab({}), false);
});
