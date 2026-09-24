/* Brand review page (internal): proposed name + logo for sign-off. */

const NAMES = [
  { name: 'Nabz', why: 'नब्ज़ = pulse. “Nabz pe haath” means having your finger on the pulse. Four letters, desi, easy to say.', pick: true },
  { name: 'Pulzo', why: 'Pulse + zoom. Fast and global-sounding, in the family of Zepto and Blinkit.' },
  { name: 'Theek', why: '“Theek ho jaoge”: you’ll be fine. Warm, reassuring, very Indian.' },
  { name: 'Sevvy', why: 'Seva (service) + a friendly suffix, like Swiggy. Playful for a consumer app.' },
  { name: 'Dawago', why: 'Dawa (medicine) + go. Instantly says “medicines, fast”, but it’s narrower if you grow beyond pharmacy.' }
];

export default function BrandPage() {
  return (
    <>
      <section className="hero" style={{ padding: '30px 28px' }}>
        <span className="eyebrow">Brand proposal · for review</span>
        <h1 style={{ fontSize: 40 }}>Nabz: care at your doorstep</h1>
        <p>A map pin carrying a heartbeat: care that comes to where you are, fast. Deep rose for warmth, sage green for health, a coral dot for urgency.</p>
      </section>

      <div className="section-title">Logo</div>
      <div className="grid two">
        <div className="card" style={{ display: 'grid', placeItems: 'center', padding: 28 }}>
          <img src="/brand/nabz-logo.svg" alt="Nabz logo" style={{ width: '100%', maxWidth: 460 }} />
        </div>
        <div className="card" style={{ display: 'grid', placeItems: 'center', padding: 0, overflow: 'hidden', background: '#2a2523' }}>
          <img src="/brand/nabz-logo-dark.svg" alt="Nabz logo on dark" style={{ width: '100%', maxWidth: 520 }} />
        </div>
      </div>

      <div className="section-title">App icon</div>
      <div className="row" style={{ justifyContent: 'flex-start', gap: 28, flexWrap: 'wrap' }}>
        {[160, 96, 60, 40].map((s) => (
          <div key={s} style={{ textAlign: 'center' }}>
            <img src="/brand/nabz-icon.svg" alt="" width={s} height={s} style={{ borderRadius: s * 0.22, boxShadow: 'var(--shadow)' }} />
            <div className="muted">{s}px</div>
          </div>
        ))}
      </div>

      <div className="section-title">Name options</div>
      <div className="grid cards">
        {NAMES.map((n) => (
          <div key={n.name} className="card" style={n.pick ? { borderColor: 'var(--brand)', boxShadow: '0 0 0 4px var(--brand-soft)' } : undefined}>
            <div className="row">
              <h3 style={{ fontSize: 24, margin: 0, letterSpacing: '-0.04em' }}>{n.name.toLowerCase()}<span style={{ color: '#ff5a3c' }}>.</span></h3>
              {n.pick && <span className="pill">Recommended</span>}
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>{n.why}</p>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 18 }}>
        Before committing: check trademark (IP India, classes 5, 35, 44), the .com / .in domains and Play Store name availability.
      </p>
    </>
  );
}
