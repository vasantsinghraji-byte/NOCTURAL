'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PartnerPost } from '@medrush/shared';
import { api } from '@/lib/api';
import { MediaGrid } from '../_components/PartnerPosts';
import { Modal, promptDialog } from '../_components/Dialog';

/** Admin: review partners' photos and videos; hide anything that shouldn't be public. */
export default function PostsPanel() {
  const [status, setStatus] = useState<'VISIBLE' | 'HIDDEN' | ''>('');
  const [posts, setPosts] = useState<PartnerPost[] | null>(null);
  const [open, setOpen] = useState<PartnerPost | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setPosts(null);
    api.adminPartnerPosts(status || undefined).then((r) => setPosts(r.posts)).catch((e) => setError(e instanceof Error ? e.message : 'Could not load posts'));
  }, [status]);
  useEffect(load, [load]);

  async function toggle(p: PartnerPost) {
    const hide = p.status !== 'HIDDEN';
    let reason: string | undefined;
    if (hide) {
      const r = await promptDialog({ title: 'Hide this post?', message: 'Customers stop seeing it; the partner sees why.', label: 'Reason', placeholder: 'e.g. Shows a patient without consent' });
      if (r === null) return;
      reason = r || undefined;
    }
    try { await api.adminSetPartnerPostHidden(p._id, hide, reason); setOpen(null); load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update the post'); }
  }

  const author = (p: PartnerPost) => (typeof p.author === 'object' ? `${p.author.name} (${p.author.role})` : '');

  return (
    <div className="card" style={{ marginTop: 16, display: 'grid', gap: 12 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Partner photos & videos</h2>
        <div className="segmented" role="group" aria-label="Show">
          {([['', 'All'], ['VISIBLE', 'Visible'], ['HIDDEN', 'Hidden']] as const).map(([v, l]) => (
            <button key={l} type="button" className={status === v ? 'on' : ''} aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
      </div>
      {error && <div className="notice bad" role="alert">{error}</div>}
      {posts === null ? <p className="muted">Loading…</p> : posts.length === 0 ? <p className="muted">No posts.</p> : <MediaGrid posts={posts} onOpen={setOpen} />}
      {open && (
        <Modal onClose={() => setOpen(null)} labelledBy="admin-post" wide>
          <div style={{ display: 'grid', gap: 10 }}>
            <h2 id="admin-post" style={{ margin: 0 }}>{author(open) || 'Post'}</h2>
            {open.kind === 'IMAGE'
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={api.absoluteUrl(`/api/v1/partner-posts/admin/${open._id}/media`)} alt={open.caption || 'Photo'} style={{ width: '100%', maxHeight: '65vh', objectFit: 'contain', background: '#000', borderRadius: 14 }} />
              : <video src={api.absoluteUrl(`/api/v1/partner-posts/admin/${open._id}/media`)} controls playsInline style={{ width: '100%', maxHeight: '65vh', background: '#000', borderRadius: 14 }} />}
            {open.caption && <p style={{ margin: 0 }}>{open.caption}</p>}
            <p className="muted" style={{ margin: 0 }}>{new Date(open.createdAt).toLocaleString('en-IN')} · {open.status === 'HIDDEN' ? `Hidden${open.hiddenReason ? `: ${open.hiddenReason}` : ''}` : 'Visible to customers'}</p>
            <div className="row" style={{ gap: 8, justifyContent: 'flex-start' }}>
              <button type="button" className={`btn ${open.status === 'HIDDEN' ? '' : 'secondary'}`} onClick={() => toggle(open)}>{open.status === 'HIDDEN' ? 'Show again' : 'Hide post'}</button>
              <button type="button" className="btn secondary" onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
