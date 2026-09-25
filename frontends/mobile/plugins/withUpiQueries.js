/**
 * Android 11+ hides other apps unless the manifest declares what we look for.
 * Razorpay's UPI intent checkout needs to see installed UPI apps (GPay,
 * PhonePe, Paytm, ...), so declare the upi:// scheme under <queries>.
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withUpiQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries || [{}];
    const q = manifest.queries[0];
    q.intent = q.intent || [];
    const already = q.intent.some((i) => (i.data || []).some((d) => d.$ && d.$['android:scheme'] === 'upi'));
    if (!already) {
      q.intent.push({ action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }], data: [{ $: { 'android:scheme': 'upi' } }] });
    }
    return cfg;
  });
};
