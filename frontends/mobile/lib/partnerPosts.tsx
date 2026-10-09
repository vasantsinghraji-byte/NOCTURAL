import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ResizeMode, Video } from 'expo-av';
import { EyeOff, ImagePlus, Play, Trash2, X } from 'lucide-react-native';
import type { PartnerPost } from '@medrush/shared';
import { api } from './api';
import { appAlert, appPrompt } from './dialog';
import { problem } from './market';
import { success } from './motion';
import { C, F, clay } from './theme';

const IMAGE_MAX = 10 * 1024 * 1024;
const VIDEO_MAX = 40 * 1024 * 1024;

/** Photos and videos in a 3-column grid; tap one to open it full screen. */
export function MediaGrid({ posts, onOpen }: { posts: PartnerPost[]; onOpen: (p: PartnerPost) => void }) {
  return (
    <View style={s.grid}>
      {posts.map((p) => (
        <Pressable key={p._id} onPress={() => onOpen(p)} style={({ pressed }) => [s.cell, pressed && { opacity: 0.85 }]}
          accessibilityRole="button" accessibilityLabel={`${p.kind === 'VIDEO' ? 'Video' : 'Photo'}${p.caption ? `: ${p.caption}` : ''}`}>
          {p.kind === 'IMAGE' ? (
            <Image source={{ uri: api.absoluteUrl(p.mediaUrl) }} style={s.thumb} resizeMode="cover" />
          ) : (
            <View style={[s.thumb, s.videoThumb]}><View style={s.play}><Play size={22} color="#ffffff" fill="#ffffff" /></View></View>
          )}
          {p.status === 'HIDDEN' ? <View style={s.hiddenTag}><EyeOff size={12} color="#ffffff" /><Text style={s.hiddenText}>Hidden</Text></View> : null}
        </Pressable>
      ))}
    </View>
  );
}

/** Full-screen photo or video, with the caption and (for the author) Delete. */
export function MediaViewer({ post, onClose, onDelete }: { post: PartnerPost | null; onClose: () => void; onDelete?: (p: PartnerPost) => void }) {
  const insets = useSafeAreaInsets();
  if (!post) return null;
  const uri = api.absoluteUrl(post.mediaUrl);
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.viewer}>
        {post.kind === 'IMAGE'
          ? <Image source={{ uri }} style={s.full} resizeMode="contain" accessibilityLabel={post.caption || 'Photo'} />
          : <Video source={{ uri }} style={s.full} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay isLooping={false} />}
        <View style={[s.viewerTop, { top: insets.top + 10 }]}>
          <Pressable onPress={onClose} style={s.round} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}><X size={22} color="#ffffff" /></Pressable>
          {onDelete ? (
            <Pressable onPress={() => onDelete(post)} style={s.round} accessibilityRole="button" accessibilityLabel="Delete this post" hitSlop={8}><Trash2 size={20} color="#ffffff" /></Pressable>
          ) : null}
        </View>
        {post.caption || post.status === 'HIDDEN' ? (
          <View style={[s.caption, { paddingBottom: insets.bottom + 16 }]}>
            {post.status === 'HIDDEN' ? <Text style={s.hiddenNote}>Hidden by Nabz{post.hiddenReason ? `: ${post.hiddenReason}` : ''}. Customers can’t see it.</Text> : null}
            {post.caption ? <Text style={s.captionText}>{post.caption}</Text> : null}
          </View>
        ) : null}
      </View>
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
    <View style={{ gap: 10 }}>
      <Text style={s.title}>Photos & videos</Text>
      <MediaGrid posts={posts} onOpen={setOpen} />
      <MediaViewer post={open} onClose={() => setOpen(null)} />
    </View>
  );
}

/** Partner: post photos and short videos to the profile customers see. */
export function MyPostsCard() {
  const [posts, setPosts] = useState<PartnerPost[] | null>(null);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<PartnerPost | null>(null);
  const load = useCallback(() => { api.myPartnerPosts().then((r) => setPosts(r.posts)).catch(() => setPosts([])); }, []);
  useEffect(load, [load]);

  async function add() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { appAlert('Allow photos', 'Allow access to your photos to post them.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8, videoMaxDuration: 60, allowsMultipleSelection: false });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const video = a.type === 'video';
    const mime = (a.mimeType || (video ? 'video/mp4' : 'image/jpeg')).toLowerCase();
    if (a.fileSize && a.fileSize > (video ? VIDEO_MAX : IMAGE_MAX)) {
      appAlert('Too large', video ? 'Videos can be up to 40 MB. Try a shorter clip.' : 'Photos can be up to 10 MB.');
      return;
    }
    const caption = await appPrompt({ title: 'Add a caption?', message: 'Optional. For example: “Our physio room” or “Wound care kit”.', placeholder: 'Caption', confirmText: 'Post', maxLength: 300 });
    if (caption === null) return;
    setBusy(video ? 'Uploading video…' : 'Uploading photo…');
    try {
      const file = await fetch(a.uri);
      const blob = await file.blob();
      const { upload } = await api.partnerPostUploadUrl(mime, a.fileSize || blob.size);
      if (upload.mode === 's3') {
        const put = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: blob });
        if (!put.ok) throw new Error('The upload didn’t finish. Please try again.');
        await api.completePartnerPost(upload.key, caption.trim() || undefined);
      } else {
        const name = a.fileName || (video ? 'video.mp4' : 'photo.jpg');
        await api.createPartnerPost({ uri: a.uri, name, type: mime }, name, caption.trim() || undefined);
      }
      success();
      load();
    } catch (e) {
      appAlert('Couldn’t post it', problem(e).message);
    } finally {
      setBusy('');
    }
  }

  function remove(p: PartnerPost) {
    appAlert('Delete this post?', 'It’s removed from your profile for everyone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await api.deletePartnerPost(p._id); setOpen(null); load(); } catch (e) { appAlert('Couldn’t delete it', problem(e).message); }
        }
      }
    ]);
  }

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>My photos & videos</Text>
          <Text style={s.meta}>Customers see these on your profile. Show your clinic, kit or certificates. Never post a patient without their consent.</Text>
        </View>
      </View>
      <Pressable onPress={add} disabled={!!busy} style={({ pressed }) => [s.addBtn, (pressed || !!busy) && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel="Add a photo or video">
        {busy ? <ActivityIndicator color="#ffffff" /> : <ImagePlus size={20} color="#ffffff" />}
        <Text style={s.addText}>{busy || 'Add Photo or Video'}</Text>
      </Pressable>
      {posts === null ? <ActivityIndicator color={C.brand} /> : posts.length === 0 ? (
        <Text style={s.meta}>No posts yet. Photos up to 10 MB, videos up to 40 MB (about a minute).</Text>
      ) : <MediaGrid posts={posts} onOpen={setOpen} />}
      <MediaViewer post={open} onClose={() => setOpen(null)} onDelete={remove} />
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: '32.4%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: C.cardAlt },
  thumb: { width: '100%', height: '100%' },
  videoThumb: { backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center' },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  hiddenTag: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  hiddenText: { color: '#ffffff', fontFamily: F.bold, fontSize: 11 },
  viewer: { flex: 1, backgroundColor: '#000000', justifyContent: 'center' },
  full: { width: '100%', height: '100%' },
  viewerTop: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: 'rgba(0,0,0,0.55)', gap: 6 },
  captionText: { color: '#ffffff', fontFamily: F.medium, fontSize: 15, lineHeight: 21 },
  hiddenNote: { color: '#ffd3da', fontFamily: F.bold, fontSize: 13 },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 16, gap: 12, ...clay },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontFamily: F.display, fontSize: 19, color: C.ink },
  meta: { fontFamily: F.medium, fontSize: 13, color: C.muted, lineHeight: 18, marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.brand, borderRadius: 16, minHeight: 50, paddingHorizontal: 16 },
  addText: { color: '#ffffff', fontFamily: F.bold, fontSize: 15 }
});
