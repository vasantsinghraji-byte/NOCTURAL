'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** Password input with a show/hide toggle and an optional strength meter. */
export default function PasswordField({ id, value, onChange, autoComplete, placeholder, meter = false }: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  placeholder?: string;
  meter?: boolean;
}) {
  const [show, setShow] = useState(false);
  const score = [/.{8,}/, /[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(value)).length;
  return (
    <>
      <div className="pw-field">
        <input
          id={id} className="input" type={show ? 'text' : 'password'} autoComplete={autoComplete} placeholder={placeholder}
          value={value} onChange={(e) => onChange(e.target.value)} required style={{ paddingRight: 44 }}
        />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {meter && value ? (
        <div className="strength" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => <span key={i} className={i < score ? 'on' : ''} />)}
        </div>
      ) : null}
    </>
  );
}
