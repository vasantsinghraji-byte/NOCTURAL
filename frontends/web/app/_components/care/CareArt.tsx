'use client';

import { useId } from 'react';

/**
 * Animated SVG illustrations for the care marketplace. CSS-only motion
 * (market.css .mk-art): a beating heart with a heartbeat line, a knee in
 * motion for physio, a home with a beating heart and a clock for home care,
 * a test tube with rising bubbles for labs. Everything stops under
 * prefers-reduced-motion. Decorative: hidden from screen readers.
 */
export type ArtKind = 'heart' | 'physio' | 'homecare' | 'lab' | 'empty';

export default function CareArt({ kind = 'heart', className = '' }: { kind?: ArtKind; className?: string }) {
  const id = useId().replace(/:/g, '');
  const g = (n: string) => `${n}-${id}`;
  return (
    <div className={`mk-art ${className}`} aria-hidden="true">
      <svg viewBox="0 0 400 400" role="presentation" focusable="false">
        <defs>
          <radialGradient id={g('glow')} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff4d6a" stopOpacity=".75" />
            <stop offset="60%" stopColor="#c21f3d" stopOpacity=".25" />
            <stop offset="100%" stopColor="#c21f3d" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={g('red')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff6680" />
            <stop offset="55%" stopColor="#d4203f" />
            <stop offset="100%" stopColor="#7d0e24" />
          </linearGradient>
          <linearGradient id={g('glass')} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".95" />
            <stop offset="100%" stopColor="#ffd9df" stopOpacity=".8" />
          </linearGradient>
        </defs>

        {/* Shared backdrop: glow, pulse rings, an orbit of small dots */}
        <circle className="glow" cx="200" cy="200" r="170" fill={`url(#${g('glow')})`} />
        <circle className="pulse-ring" cx="200" cy="200" r="120" fill="none" stroke="#ff8da0" strokeOpacity=".5" strokeWidth="2" />
        <circle className="pulse-ring d2" cx="200" cy="200" r="120" fill="none" stroke="#ff8da0" strokeOpacity=".5" strokeWidth="2" />
        <g className="orbit">
          <circle cx="200" cy="200" r="168" fill="none" stroke="#ffffff" strokeOpacity=".14" strokeDasharray="2 10" />
          <circle cx="368" cy="200" r="5" fill="#ffb3c0" />
          <circle cx="32" cy="200" r="3.5" fill="#ffffff" fillOpacity=".7" />
        </g>
        <g className="orbit rev">
          <circle cx="200" cy="44" r="4" fill="#ffffff" fillOpacity=".8" />
          <circle cx="200" cy="356" r="3" fill="#ff8da0" />
        </g>

        {kind === 'heart' && <Heart g={g} />}
        {kind === 'physio' && <Physio g={g} />}
        {kind === 'homecare' && <HomeCare g={g} />}
        {kind === 'lab' && <Lab g={g} />}
        {kind === 'empty' && <Empty />}

        {/* Floating plus signs */}
        <g className="float" fill="#ffffff" fillOpacity=".85">
          <rect x="58" y="96" width="18" height="5" rx="2.5" />
          <rect x="64.5" y="89.5" width="5" height="18" rx="2.5" />
        </g>
        <g className="float d2" fill="#ffb3c0">
          <rect x="318" y="290" width="14" height="4" rx="2" />
          <rect x="323" y="285" width="4" height="14" rx="2" />
        </g>
        <g className="float d3" fill="#ffffff" fillOpacity=".6">
          <rect x="320" y="84" width="12" height="3.5" rx="1.75" />
          <rect x="324.25" y="79.75" width="3.5" height="12" rx="1.75" />
        </g>
      </svg>
    </div>
  );
}

type G = { g: (n: string) => string };

const HEART = 'M200 318 C 128 266 84 222 84 166 C 84 124 116 96 152 96 C 176 96 192 109 200 126 C 208 109 224 96 248 96 C 284 96 316 124 316 166 C 316 222 272 266 200 318 Z';

function Ecg({ y = 200, color = '#ffffff' }: { y?: number; color?: string }) {
  const d = `M20 ${y} H120 L138 ${y - 10} L150 ${y + 12} L166 ${y - 70} L184 ${y + 56} L198 ${y - 22} L210 ${y} H262 L276 ${y - 18} L290 ${y} H380`;
  return <path className="ecg" d={d} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />;
}

function Heart({ g }: G) {
  return (
    <>
      <g className="beat">
        <path d={HEART} fill={`url(#${g('red')})`} />
        <path d="M150 122 C 130 124 116 140 114 160" fill="none" stroke="#ffffff" strokeOpacity=".55" strokeWidth="8" strokeLinecap="round" />
        <path d={HEART} fill="none" stroke="#ffb3c0" strokeOpacity=".5" strokeWidth="2" />
      </g>
      <Ecg y={204} />
    </>
  );
}

function Physio({ g }: G) {
  return (
    <>
      {/* Thigh, knee joint and a shin that swings (range of motion) */}
      <rect x="150" y="96" width="70" height="128" rx="34" fill={`url(#${g('glass')})`} transform="rotate(-18 185 160)" />
      <g className="swing" style={{ transformBox: 'view-box', transformOrigin: '201px 226px' }}>
        <rect x="172" y="222" width="58" height="122" rx="29" fill={`url(#${g('glass')})`} />
        <rect x="166" y="330" width="78" height="26" rx="13" fill="#ffd0d8" />
      </g>
      <g className="beat">
        <circle cx="201" cy="226" r="30" fill={`url(#${g('red')})`} />
        <circle cx="201" cy="226" r="12" fill="#ffffff" fillOpacity=".85" />
      </g>
      {/* Motion arcs */}
      <path className="ecg" d="M262 180 A 92 92 0 0 1 262 290" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeDasharray="10 14" />
      <path d="M254 284 l10 10 l4 -15" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

function HomeCare({ g }: G) {
  return (
    <>
      <path d="M96 196 L200 104 L304 196" fill="none" stroke="#ffffff" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M120 186 V316 a10 10 0 0 0 10 10 H270 a10 10 0 0 0 10 -10 V186" fill={`url(#${g('glass')})`} />
      <g className="beat">
        <path d="M200 286 C 168 262 148 244 148 220 C 148 202 162 190 178 190 C 188 190 196 196 200 204 C 204 196 212 190 222 190 C 238 190 252 202 252 220 C 252 244 232 262 200 286 Z" fill={`url(#${g('red')})`} />
      </g>
      {/* Clock: the same caregiver, by day and time */}
      <g transform="translate(300 106)">
        <circle r="34" fill="#ffffff" />
        <circle r="34" fill="none" stroke="#d4203f" strokeWidth="4" />
        <g className="orbit" style={{ transformBox: 'view-box', transformOrigin: '300px 106px' }}>
          <line x1="0" y1="0" x2="0" y2="-22" stroke="#7d0e24" strokeWidth="5" strokeLinecap="round" />
        </g>
        <line x1="0" y1="0" x2="14" y2="6" stroke="#d4203f" strokeWidth="5" strokeLinecap="round" />
        <circle r="4" fill="#7d0e24" />
      </g>
    </>
  );
}

function Lab({ g }: G) {
  return (
    <>
      <g transform="rotate(-14 200 210)">
        <rect x="160" y="70" width="80" height="16" rx="8" fill="#ffd0d8" />
        <path d="M168 86 V292 a32 32 0 0 0 64 0 V86 Z" fill={`url(#${g('glass')})`} />
        <path d="M168 196 H232 V292 a32 32 0 0 1 -64 0 Z" fill={`url(#${g('red')})`} />
        <rect x="178" y="104" width="7" height="70" rx="3.5" fill="#ffffff" fillOpacity=".9" />
        <circle className="bubble" cx="190" cy="282" r="7" fill="#ffffff" fillOpacity=".85" />
        <circle className="bubble d2" cx="212" cy="290" r="5" fill="#ffffff" fillOpacity=".8" />
        <circle className="bubble d3" cx="200" cy="300" r="4" fill="#ffffff" fillOpacity=".75" />
      </g>
      <g className="float">
        <path d="M300 230 C 300 230 278 258 278 272 a22 22 0 0 0 44 0 C 322 258 300 230 300 230 Z" fill={`url(#${g('red')})`} />
      </g>
      <Ecg y={340} color="#ffb3c0" />
    </>
  );
}

function Empty() {
  return (
    <>
      <path d={HEART} fill="none" stroke="#e8a0ac" strokeWidth="6" strokeDasharray="14 12" />
      <Ecg y={208} color="#c21f3d" />
    </>
  );
}
