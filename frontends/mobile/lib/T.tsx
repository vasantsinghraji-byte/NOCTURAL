import { forwardRef, type ReactNode } from 'react';
import { Text as RNText, type TextProps } from 'react-native';
import { useLang } from './i18n';
import { translatePhrase } from './phrases';

/**
 * Text that follows the app language. String children are looked up in
 * lib/hiPhrases.ts by their English text (surrounding spaces are kept), so
 * labels, titles and server-sent service names translate wherever this Text is
 * used. Numbers, names and anything not in the dictionary show as they are.
 *
 * Screens import `Text` from '@/lib/T' instead of 'react-native'.
 */
const translateChildren = (c: ReactNode): ReactNode =>
  typeof c === 'string' ? translatePhrase(c) : Array.isArray(c) ? c.map(translateChildren) : c;

export const Text = forwardRef<RNText, TextProps>(function Text(props, ref) {
  const lang = useLang();
  return <RNText ref={ref} {...props}>{lang === 'hi' ? translateChildren(props.children) : props.children}</RNText>;
});

/** For plain strings outside Text (placeholders, alerts): `const tr = useTr(); tr('Search tests')`. */
export function useTr() {
  const lang = useLang();
  return (s: string) => (lang === 'hi' ? translatePhrase(s) : s);
}
