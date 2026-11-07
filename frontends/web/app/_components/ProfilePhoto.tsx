'use client';

import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmDialog } from './Dialog';

/** Round avatar: the photo if there is one, otherwise the first letter of the name. */
export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const letter = (name || '?').trim().charAt(0).toUpperCase();
  if (url && !broken) {
    // Private photo behind the API (same origin): plain <img>, not next/image.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={api.absoluteUrl(url)} alt="" width={size} height={size} className="avatar-img" style={{ width: size, height: size }} onError={() => setBroken(true)} />;
  }
  return <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }} aria-hidden="true">{letter}</span>;
}

/** Avatar with change / remove, for the account pages (customers and partners). */
export default function ProfilePhotoEditor({ name, url, onChange, tone = 'light' }: { name: string; url?: string | null; onChange: (url: string | null) => void; tone?: 'light' | 'dark' }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) { setError('Choose a JPG or PNG photo.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('That photo is over 10 MB. Choose a smaller one.'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await api.uploadProfilePhoto(file, file.name);
      onChange(r.profilePhoto.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!(await confirmDialog({ title: 'Remove your photo?', confirmLabel: 'Remove photo', danger: true }))) return;
    try { await api.removeProfilePhoto(); onChange(null); } catch (err) { setError(err instanceof Error ? err.message : 'Could not remove'); }
  }

  return (
    <div className={`photo-editor ${tone}`}>
      <button type="button" className="photo-button" onClick={() => input.current?.click()} disabled={busy} aria-label={url ? 'Change profile photo' : 'Add profile photo'}>
        <Avatar name={name} url={url} size={72} />
        <span className="photo-badge" aria-hidden="true"><Camera size={14} /></span>
      </button>
      <div className="photo-actions">
        <button type="button" className="linkish" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Uploading…' : url ? 'Change photo' : 'Add photo'}</button>
        {url && !busy && <button type="button" className="linkish muted-action" onClick={remove}>Remove</button>}
        {error && <span className="field-error" role="alert">{error}</span>}
      </div>
      <input ref={input} type="file" name="profilePhoto" accept="image/jpeg,image/png" hidden onChange={pick} />
    </div>
  );
}
