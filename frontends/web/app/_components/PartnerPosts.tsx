'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EyeOff, ImagePlus, Play, Trash2 } from 'lucide-react';
import type { PartnerPost } from '@medrush/shared';
import { api } from '@/lib/api';
import { problem } from '@/lib/care';
import { Modal, confirmDialog } from './Dialog';

const IMAGE_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 40 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';

/** Photos and videos, three across; click one to open it. */
export function MediaGrid({ posts, onOpen }: { posts: PartnerPost[]; onOpen: (p: PartnerPost) => void }) {
  return (
    <div className="media-grid">
      {posts.map((p) => (
        <button key={p._id} type="button" className="media-cell" onClick={() => onOpen(p)} aria-label={`${p.kind === 'VIDEO' ? 'Video' : 'Photo'}${p.caption ? `: ${p.caption}` : ''}`}>
          {p.kind === 'IMAGE'
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={api.absoluteUrl(p.mediaUrl)} alt="" loading="lazy" width={240} height={240} />
            : <span className="media-video"><Play size={26} fill="#fff" aria-hidden="true" /></span>}
          {p.status === 'HIDDEN' && <span className="media-hidden"><EyeOff size={12} aria-hidden="true" /> Hidden</span>}
        </button>
      ))}
    </div>
  );
}

export function MediaViewer({ post, onClose, onDelete }: { post: PartnerPost | null; onClose: () => void; onDelete?: (p: PartnerPost) => void }) {
  if (!post) return null;
  const src = api.absoluteUrl(post.mediaUrl);
  return (
    <Modal onClose={onClose} labelledBy="media-view" wide>
      <div style={{ display: 'grid', gap: 10 }}>
        <h2 id="media-view" style={{ margin: 0 }}>{post.kind === 'VIDEO' ? 'Video' : 'Photo'}</h2>
        {post.kind === 'IMAGE'
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={src} alt={post.caption || 'Photo'} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 16, background: '#000' }} />
          : <video src={src} controls autoPlay playsInline style={{ width: '100%', maxHeight: '70vh', borderRadius: 16, background: '#000' }} />}
        {post.status === 'HIDDEN' && <p className="mk-note" style={{ margin: 0 }}>Hidden by Nabz{post.hiddenReason ? `: ${post.hiddenReason}` : ''}. Customers can’t see it.</p>}
        {post.caption && <p style={{ margin: 0 }}>{post.caption}</p>}
        <div className="mk-row" style={{ gap: 8 }}>
          {onDelete && <button type="button" className="mk-btn ghost" onClick={() => onDelete(post)}><Trash2 size={16} aria-hidden="true" /> Delete</button>}
          <button type="button" className="mk-btn soft" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}

/** A care shop's photos and videos for customers (nothing when there are none). */
export function ShopPosts({ storeId }: { storeId: string }) {
  const [posts, setPosts] = useState<PartnerPost[]>([]);
  const [open, setOpen] = useState<PartnerPost | null>(null);
  useEffect(() => { api.shopPosts(storeId).then((r) => setPosts(r.posts)).catch(() => undefined); }, [storeId]);
  if (!posts.length) return null;
  return (
    <section className="mk-card" aria-labelledby="shop-posts">
      <h2 id="shop-posts" className="mk-title" style={{ fontSize: 20, marginBottom: 12 }}>Photos & videos</h2>
      <MediaGrid posts={posts} onOpen={setOpen} />
      <MediaViewer post={open} onClose={() => setOpen(null)} />
    </section>
  );
}

/** Partner: post photos and short videos to the profile customers see. */
export function MyPosts() {
  const [posts, setPosts] = useState<PartnerPost[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [caption, setCaption] = useState('');
  const [open, setOpen] = useState<PartnerPost | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const load = useCallback(() => { api.myPartnerPosts().then((r) => setPosts(r.posts)).catch(() => setPosts([])); }, []);
  useEffect(load, [load]);

  async function upload(file: File) {
    setError('');
    const video = file.type.startsWith('video/');
    if (file.size > (video ? VIDEO_MAX : IMAGE_MAX)) { setError(video ? 'Videos can be up to 40 MB.' : 'Photos can be up to 10 MB.'); return; }
    setBusy(video ? 'Uploading video…' : 'Uploading photo…');
    try {
      const { upload: target } = await api.partnerPostUploadUrl(file.type, file.size);
      if (target.mode === 's3') {
        const put = await fetch(target.url, { method: 'PUT', headers: target.headers, body: file });
        if (!put.ok) throw new Error('The upload didn’t finish. Please try again.');
        await api.completePartnerPost(target.key, caption.trim() || undefined);
      } else {
        await api.createPartnerPost(file, file.name, caption.trim() || undefined);
      }
      setCaption('');
      load();
    } catch (e) { setError(problem(e).message); } finally { setBusy(''); if (picker.current) picker.current.value = ''; }
  }

  async function remove(p: PartnerPost) {
    if (!(await confirmDialog({ title: 'Delete this post?', message: 'It’s removed from your profile for everyone.', confirmLabel: 'Delete', danger: true }))) return;
    try { await api.deletePartnerPost(p._id); setOpen(null); load(); } catch (e) { setError(problem(e).message); }
  }

  return (
    <section className="card" style={{ marginTop: 16, display: 'grid', gap: 12 }} aria-labelledby="my-posts">
      <div>
        <h2 id="my-posts" style={{ margin: 0 }}>My photos & videos</h2>
        <p className="muted" style={{ margin: '4px 0 0' }}>Customers see these on your profile. Show your clinic, kit or certificates. Never post a patient without their consent.</p>
      </div>
      <label className="mk-field">
        <span className="mk-label">Caption (optional)</span>
        <input className="mk-input" value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} placeholder="For example: Our physio room…" autoComplete="off" />
      </label>
      <div>
        <input ref={picker} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <button type="button" className="mk-btn" disabled={!!busy} onClick={() => picker.current?.click()}>
          <ImagePlus size={18} aria-hidden="true" /> {busy || 'Add Photo or Video'}
        </button>
        <p className="mk-help" style={{ marginTop: 6 }}>JPG, PNG or WebP photos up to 10 MB · MP4, MOV or WebM videos up to 40 MB.</p>
      </div>
      {error && <p className="mk-error" role="alert">{error}</p>}
      {posts === null ? <div className="mk-skel" style={{ minHeight: 90 }} /> : posts.length === 0 ? <p className="muted" style={{ margin: 0 }}>No posts yet.</p> : <MediaGrid posts={posts} onOpen={setOpen} />}
      <MediaViewer post={open} onClose={() => setOpen(null)} onDelete={remove} />
    </section>
  );
}
