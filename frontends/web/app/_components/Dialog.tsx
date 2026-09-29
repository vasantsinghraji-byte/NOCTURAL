'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

// Open modals, oldest first: only the top one reacts to Escape and Tab.
const stack: symbol[] = [];

/**
 * Accessible modal: focus moves into it on open, Tab stays inside, Escape and
 * the backdrop close it, and focus returns to what opened it. Page scroll is
 * locked while it's open.
 */
export function Modal({ onClose, labelledBy, children, wide, as = 'div', onSubmit }: {
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  wide?: boolean;
  as?: 'div' | 'form';
  onSubmit?: (e: React.FormEvent) => void;
}) {
  const panel = useRef<HTMLDivElement & HTMLFormElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const me = Symbol('modal');
    stack.push(me);
    const opener = document.activeElement as HTMLElement | null;
    const root = panel.current;
    const focusables = () => Array.from(root?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);
    // First field if there is one, otherwise the panel itself.
    (root?.querySelector<HTMLElement>('[data-autofocus]') || focusables().find((el) => el.matches('input, select, textarea')) || root)?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); return; }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, []);

  const Panel = as;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Panel
        ref={panel}
        className="card dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={wide ? { maxWidth: 560 } : undefined}
        onSubmit={onSubmit}
      >
        {children}
      </Panel>
    </div>
  );
}

// ── confirm / prompt / alert without the browser's native popups ──────────

type Request =
  | { kind: 'confirm'; title: string; message?: string; confirmLabel?: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: 'alert'; title: string; message?: string; resolve: (v: boolean) => void }
  | {
    kind: 'prompt'; title: string; message?: string; label: string; placeholder?: string; confirmLabel?: string;
    inputMode?: 'numeric' | 'text'; maxLength?: number; minLength?: number; pattern?: RegExp; patternHint?: string;
    resolve: (v: string | null) => void;
  };

let push: ((r: Request) => void) | null = null;

/** In-page confirmation. Resolves true when confirmed. */
export function confirmDialog(opts: { title: string; message?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => (push ? push({ kind: 'confirm', ...opts, resolve }) : resolve(window.confirm([opts.title, opts.message].filter(Boolean).join('\n\n')))));
}

/** In-page message with an OK button. */
export function alertDialog(opts: { title: string; message?: string }): Promise<void> {
  return new Promise((resolve) => (push ? push({ kind: 'alert', ...opts, resolve: () => resolve() }) : (window.alert(opts.title), resolve())));
}

/** In-page text question. Resolves the trimmed answer, or null when cancelled. */
export function promptDialog(opts: {
  title: string; message?: string; label: string; placeholder?: string; confirmLabel?: string;
  inputMode?: 'numeric' | 'text'; maxLength?: number; minLength?: number; pattern?: RegExp; patternHint?: string;
}): Promise<string | null> {
  return new Promise((resolve) => (push ? push({ kind: 'prompt', ...opts, resolve }) : resolve(window.prompt(opts.title))));
}

/** Mounted once in the root layout. */
export function DialogHost() {
  const [queue, setQueue] = useState<Request[]>([]);
  useEffect(() => {
    push = (r) => setQueue((q) => [...q, r]);
    return () => { push = null; };
  }, []);
  const current = queue[0];
  if (!current) return null;
  const done = (value: boolean | string | null) => {
    setQueue((q) => q.slice(1));
    (current.resolve as (v: typeof value) => void)(value);
  };
  return <DialogView key={queue.length + current.title} req={current} done={done} />;
}

function DialogView({ req, done }: { req: Request; done: (v: boolean | string | null) => void }) {
  const id = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cancel = () => done(req.kind === 'prompt' ? null : false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (req.kind !== 'prompt') { done(true); return; }
    const v = value.trim();
    if (req.minLength && v.length < req.minLength) { setError(`Enter at least ${req.minLength} characters.`); return; }
    if (req.pattern && !req.pattern.test(v)) { setError(req.patternHint || 'Check what you entered.'); return; }
    done(v);
  }

  return (
    <Modal onClose={cancel} labelledBy={`${id}-t`} as="form" onSubmit={submit}>
      <h2 id={`${id}-t`} style={{ margin: 0 }}>{req.title}</h2>
      {req.message && <p className="muted" style={{ margin: 0 }}>{req.message}</p>}
      {req.kind === 'prompt' && (
        <>
          <label htmlFor={`${id}-i`}>{req.label}</label>
          <input
            id={`${id}-i`}
            name="answer"
            className="input"
            autoComplete="off"
            spellCheck={false}
            inputMode={req.inputMode}
            maxLength={req.maxLength}
            placeholder={req.placeholder}
            value={value}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-e` : undefined}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
          />
          {error && <div id={`${id}-e`} className="field-error" role="alert">{error}</div>}
        </>
      )}
      <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        {req.kind !== 'alert' && <button type="button" className="btn secondary" onClick={cancel}>Cancel</button>}
        <button type="submit" className={req.kind === 'confirm' && req.danger ? 'btn danger-solid' : 'btn'} data-autofocus={req.kind !== 'prompt' ? '' : undefined}>
          {req.kind === 'alert' ? 'OK' : req.confirmLabel || 'Confirm'}
        </button>
      </div>
    </Modal>
  );
}
