/** Nabz mark: location pin carrying a pulse line, coral live dot (same as the app). */
export function NabzMark({ size = 30, pin = '#0a0f24', pulse = '#ffffff' }: { size?: number; pin?: string; pulse?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 4C19 4 9 13.6 9 26.2 9 41 25.4 53.3 32 60c6.6-6.7 23-19 23-33.8C55 13.6 45 4 32 4z" fill={pin} />
      <path d="M17 28h7.5l3.5-7.5 5.5 17 3.6-9.8 2.2 3.3h5" stroke={pulse} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx={46.5} cy={31} r={3.4} fill="#ff5a3c" />
    </svg>
  );
}

export function Wordmark({ suffix, onDark = false, size = 22 }: { suffix?: string; onDark?: boolean; size?: number }) {
  return (
    <span className="brandmark" style={{ fontSize: size, color: onDark ? '#f6f7fb' : undefined }}>
      <NabzMark size={size + 8} pin={onDark ? '#f6f7fb' : '#0a0f24'} pulse={onDark ? '#1f45e0' : '#ffffff'} />
      nabz
      {suffix ? <span className="suffix">{suffix}</span> : null}
    </span>
  );
}
