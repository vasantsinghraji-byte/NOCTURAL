'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// What rises into view: page sections, and the cards inside grids (staggered).
const SECTION_SELECTOR = 'main .band, main .section-title, main .card:not(.grid .card), main .notice';
const GROUP_SELECTOR = 'main .service-grid, main .grid.cards, main .grid.cats, main .how-grid, main .safety-grid';

/**
 * Scroll reveal: elements fade and rise in once as they enter the viewport.
 * Only runs with JavaScript and without "reduce motion", so content is never
 * hidden for anyone who can't or doesn't want to see the animation.
 * New content (lists loaded after the page) is picked up by a MutationObserver.
 */
export default function RevealOnScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;
    root.classList.add('js-reveal');

    // After the reveal, hand the element back to its own styles (hover lifts etc.).
    const settle = (el: Element) => {
      const i = Number((el as HTMLElement).style.getPropertyValue('--i')) || 0;
      window.setTimeout(() => el.classList.remove('reveal', 'in'), 800 + i * 55);
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
          settle(e.target);
        }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    const mark = (el: Element, index = 0) => {
      const node = el as HTMLElement;
      if (node.dataset.revealed) return;
      node.dataset.revealed = '1';
      // Already on screen at first paint: show immediately (no flash of hidden content).
      const r = el.getBoundingClientRect();
      (el as HTMLElement).style.setProperty('--i', String(Math.min(index, 8)));
      if (r.top < window.innerHeight * 0.92 && r.bottom > 0 && index === 0) return;
      el.classList.add('reveal');
      io.observe(el);
    };

    const scan = () => {
      document.querySelectorAll(SECTION_SELECTOR).forEach((el) => mark(el));
      document.querySelectorAll(GROUP_SELECTOR).forEach((group) => {
        Array.from(group.children).forEach((child, i) => mark(child, i + 1));
      });
    };

    scan();
    const main = document.querySelector('main');
    const mo = main ? new MutationObserver(() => scan()) : null;
    if (main && mo) mo.observe(main, { childList: true, subtree: true });

    // Safety net: a fast fling can carry an element from below the viewport to
    // above it without ever "intersecting", so it would stay hidden. Twice a
    // second, reveal anything the reader has already reached.
    const sweep = window.setInterval(() => {
      document.querySelectorAll('.reveal:not(.in)').forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add('in');
          io.unobserve(el);
          settle(el);
        }
      });
    }, 500);

    return () => {
      io.disconnect();
      mo?.disconnect();
      window.clearInterval(sweep);
    };
  }, [pathname]);

  return null;
}
