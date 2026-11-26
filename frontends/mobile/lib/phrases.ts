import { HI_PHRASES } from './hiPhrases';

/**
 * The Hindi for an on-screen English string, keeping the spaces around it
 * (JSX splits "For {name}" into "For " + name). Unknown text is returned as is.
 */
export function translatePhrase(s: string, phrases: Record<string, string> = HI_PHRASES): string {
  const key = s.replace(/\s+/g, ' ').trim();
  const hit = key && phrases[key];
  if (!hit) return s;
  const lead = /^\s*/.exec(s)?.[0] ?? '';
  const trail = /\s*$/.exec(s)?.[0] ?? '';
  return lead + hit + trail;
}
