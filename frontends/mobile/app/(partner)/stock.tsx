import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCheck, PackagePlus, Plus, Search } from 'lucide-react-native';
import type { InventoryBatch, Medicine, StockFilter, StoreStockItem } from '@medrush/shared';
import { api } from '@/lib/api';
import { appAlert } from '@/lib/dialog';
import { inr, problem } from '@/lib/market';
import { BottomSheet, Btn, Chip, Chips, Empty, Note } from '@/lib/marketUI';
import { success } from '@/lib/motion';
import { useTabBarSpace } from '@/lib/PillTabBar';
import { C, F, clay, ui } from '@/lib/theme';

const FILTERS: Array<{ value: StockFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'low', label: 'Running low' },
  { value: 'out', label: 'Out of stock' },
  { value: 'expiring', label: 'Expiring' },
  { value: 'hidden', label: 'Hidden' }
];
const PAGE = 30;
const monthYear = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '');

/** "MM/YYYY" (as printed on packs) → the last day of that month, or null. */
function parseExpiry(text: string): string | null {
  const m = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(text.trim());
  if (!m) return null;
  const month = Number(m[1]);
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

const num = (t: string) => (t.trim() === '' ? NaN : Number(t));

/**
 * Stock tab: find any product by name, salt or maker; filter to what's low,
 * out, expiring or hidden; tap a product to change its price, count or
 * visibility; receive new stock by batch; add a product from the catalogue.
 */
export default function StockTab() {
  const params = useLocalSearchParams<{ filter?: StockFilter; receive?: string }>();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const [filter, setFilter] = useState<StockFilter>('all');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<StoreStockItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<StoreStockItem | null>(null);
  const [receiving, setReceiving] = useState<{ medicine?: Pick<Medicine, '_id' | 'name'>; mrp?: number; sellingPrice?: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Opened from Today with a filter, or straight into "Receive stock".
  useEffect(() => { if (params.filter && FILTERS.some((f) => f.value === params.filter)) setFilter(params.filter); }, [params.filter]);
  useEffect(() => { if (params.receive) setReceiving({}); }, [params.receive]);

  const load = useCallback(async (nextPage = 1, query = q, f = filter) => {
    if (nextPage > 1) setLoadingMore(true);
    try {
      const r = await api.vendorListInventory({ q: query.trim() || undefined, filter: f, page: nextPage, limit: PAGE });
      setItems((prev) => (nextPage === 1 ? r.items : [...(prev || []), ...r.items]));
      setTotal(r.pagination.total);
      setPage(nextPage);
      setError('');
    } catch (e) { setError(problem(e).message); } finally { setLoadingMore(false); }
  }, [q, filter]);

  useFocusEffect(useCallback(() => { load(1); }, [load]));
  const onSearch = (text: string) => {
    setQ(text);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => load(1, text, filter), 350);
  };

  const confirmCounts = () => appAlert('Confirm stock counts?', 'Tell Nabz your shelf matches the counts here. Stores with fresh counts rank higher.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Counts are right', onPress: async () => {
        try { const r = await api.vendorConfirmInventory(); success(); appAlert('Thank you', `Confirmed ${r.confirmed} product(s).`); } catch (e) { appAlert('Couldn’t confirm', problem(e).message); }
      }
    }
  ]);

  const header = (
    <View style={{ gap: 12, paddingTop: insets.top + 10 }}>
      <Text style={s.title}>Stock</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label="Receive stock" icon={PackagePlus} onPress={() => setReceiving({})} style={{ flex: 1 }} />
        <Btn label="Add product" icon={Plus} variant="ghost" onPress={() => setAdding(true)} style={{ flex: 1 }} />
      </View>
      <View style={s.search}>
        <Search size={20} color={C.muted} />
        <TextInput value={q} onChangeText={onSearch} placeholder="Search name, salt or maker" placeholderTextColor={C.muted} style={s.searchInput}
          returnKeyType="search" accessibilityLabel="Search your stock" autoCorrect={false} />
      </View>
      <Chips>
        {FILTERS.map((f) => <Chip key={f.value} label={f.label} on={filter === f.value} onPress={() => { setFilter(f.value); load(1, q, f.value); }} />)}
      </Chips>
      {error ? <Note>{error}</Note> : null}
      {items ? <Text style={s.count}>{total} product{total === 1 ? '' : 's'}</Text> : null}
    </View>
  );

  return (
    <View style={ui.screen}>
      <FlatList
        data={items || []}
        keyExtractor={(i) => i._id}
        ListHeaderComponent={header}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: tabSpace }}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (items && items.length < total && !loadingMore) load(page + 1); }}
        ListEmptyComponent={items ? (
          <Empty title={filter === 'all' && !q ? 'No products yet' : 'Nothing here'}
            text={filter === 'all' && !q ? 'Receive stock or add a product to start selling on Nabz.' : 'Try another search or filter.'} />
        ) : <ActivityIndicator color={C.brand} />}
        ListFooterComponent={(
          <View style={{ gap: 10, marginTop: 6 }}>
            {loadingMore ? <ActivityIndicator color={C.brand} /> : null}
            <Btn label="Confirm stock counts" icon={CheckCheck} variant="ghost" onPress={confirmCounts} />
          </View>
        )}
        renderItem={({ item }) => <StockRow item={item} onPress={() => setEditing(item)} />}
      />
      {editing ? <EditSheet item={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(1); }}
        onReceive={() => { const it = editing; setEditing(null); setReceiving({ medicine: it.medicine, mrp: it.mrp, sellingPrice: it.sellingPrice }); }} /> : null}
      {receiving ? <ReceiveSheet start={receiving} onClose={() => setReceiving(null)} onSaved={() => { setReceiving(null); load(1); }} /> : null}
      {adding ? <AddSheet onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(1); }} /> : null}
    </View>
  );
}

function StockRow({ item, onPress }: { item: StoreStockItem; onPress: () => void }) {
  const out = item.isAvailable && item.stockQty <= 0;
  const b = item.batchSummary;
  const tags: Array<{ label: string; tone: 'red' | 'amber' | 'neutral' }> = [];
  if (!item.isAvailable) tags.push({ label: 'Hidden', tone: 'neutral' });
  if (out) tags.push({ label: 'Out of stock', tone: 'red' });
  if (item.low) tags.push({ label: 'Running low', tone: 'amber' });
  if (b && b.pulledQty > 0) tags.push({ label: `${b.pulledQty} off sale`, tone: 'red' });
  if (b && b.expiringQty > 0) tags.push({ label: `${b.expiringQty} expiring`, tone: 'amber' });
  const meta = [item.medicine.manufacturer, item.medicine.packSize || item.medicine.strength].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.medicine.name}, ${item.stockQty} in stock, ${inr(item.sellingPrice)}. Tap to edit`}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.name} numberOfLines={2}>{item.medicine.name}</Text>
        {meta ? <Text style={s.meta} numberOfLines={1}>{meta}</Text> : null}
        <Text style={s.price}>{inr(item.sellingPrice)} <Text style={s.mrp}>MRP {inr(item.mrp)}</Text></Text>
        {b?.nextExpiry ? <Text style={s.meta}>Next expiry {monthYear(b.nextExpiry)} · {b.count} batch{b.count === 1 ? '' : 'es'}</Text> : null}
        {tags.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {tags.map((t) => <Text key={t.label} style={[s.tag, t.tone === 'red' ? s.tagRed : t.tone === 'amber' ? s.tagAmber : s.tagGrey]}>{t.label}</Text>)}
          </View>
        ) : null}
      </View>
      <View style={s.qtyBox}>
        <Text style={[s.qty, out && { color: C.brand }]}>{item.stockQty}</Text>
        <Text style={s.qtyLabel}>in stock</Text>
      </View>
    </Pressable>
  );
}

function Field({ label, value, onChange, placeholder, numeric = true, hint }: { label: string; value: string; onChange: (t: string) => void; placeholder?: string; numeric?: boolean; hint?: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted} style={s.input}
        keyboardType={numeric ? 'decimal-pad' : 'default'} autoCapitalize={numeric ? 'none' : 'characters'} accessibilityLabel={label} />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

function EditSheet({ item, onClose, onSaved, onReceive }: { item: StoreStockItem; onClose: () => void; onSaved: () => void; onReceive: () => void }) {
  const batched = Boolean(item.batchSummary);
  const [price, setPrice] = useState(String(item.sellingPrice));
  const [mrp, setMrp] = useState(String(item.mrp));
  const [count, setCount] = useState(String(item.stockQty));
  const [alertAt, setAlertAt] = useState(String(item.lowStockThreshold ?? 5));
  const [visible, setVisible] = useState(item.isAvailable);
  const [batches, setBatches] = useState<InventoryBatch[] | null>(null);
  const [batchCounts, setBatchCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!batched) return;
    api.vendorListBatches(item.medicine._id).then((r) => {
      setBatches(r.batches);
      setBatchCounts(Object.fromEntries(r.batches.map((b) => [b._id, String(b.qty)])));
    }).catch(() => setBatches([]));
  }, [batched, item.medicine._id]);

  const save = async () => {
    const sp = num(price); const m = num(mrp); const c = num(count); const a = num(alertAt);
    if (!(m > 0)) return setErr('Enter the MRP printed on the pack');
    if (!(sp >= 0) || sp > m) return setErr('Selling price can’t be more than the MRP');
    if (!batched && !(Number.isInteger(c) && c >= 0)) return setErr('Stock count must be a whole number');
    if (!(Number.isInteger(a) && a >= 0)) return setErr('Low-stock alert must be a whole number');
    setBusy(true); setErr('');
    try {
      await api.vendorUpsertInventory({ medicineId: item.medicine._id, mrp: m, sellingPrice: sp, isAvailable: visible, lowStockThreshold: a, ...(batched || c === item.stockQty ? {} : { stockQty: c }) });
      if (batches) {
        for (const b of batches) {
          const n = num(batchCounts[b._id] ?? '');
          if (Number.isInteger(n) && n >= 0 && n !== b.qty) await api.vendorSetBatchCount(b._id, n);
        }
      }
      success();
      onSaved();
    } catch (e) { setErr(problem(e).message); } finally { setBusy(false); }
  };

  return (
    <BottomSheet visible onClose={onClose} title={item.medicine.name}>
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Your price (₹)" value={price} onChange={setPrice} />
          <Field label="MRP (₹)" value={mrp} onChange={setMrp} />
        </View>
        {!batched ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Units on shelf" value={count} onChange={setCount} />
            <Field label="Alert me below" value={alertAt} onChange={setAlertAt} />
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <Text style={s.label}>Counted by batch</Text>
            {!batches ? <ActivityIndicator color={C.brand} /> : batches.map((b) => (
              <View key={b._id} style={s.batchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.batchNo}>{b.batchNumber}</Text>
                  <Text style={[s.meta, b.status !== 'ACTIVE' && { color: C.brand }]}>Exp {monthYear(b.expiryDate)}{b.status !== 'ACTIVE' ? ` · ${b.status === 'RECALLED' ? 'Recalled' : 'Off sale (near expiry)'}` : ''}</Text>
                </View>
                <TextInput value={batchCounts[b._id] ?? ''} onChangeText={(t) => setBatchCounts((p) => ({ ...p, [b._id]: t }))} keyboardType="number-pad"
                  style={[s.input, { width: 90, textAlign: 'center' }]} accessibilityLabel={`Units in batch ${b.batchNumber}`} />
              </View>
            ))}
            <Field label="Alert me below" value={alertAt} onChange={setAlertAt} />
          </View>
        )}
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>Show to customers</Text>
            <Text style={s.meta}>Switch off to stop selling it on Nabz without losing its count.</Text>
          </View>
          <Switch value={visible} onValueChange={setVisible} trackColor={{ true: C.mint, false: C.faint }} thumbColor="#ffffff" accessibilityLabel="Show to customers" />
        </View>
        {err ? <Note>{err}</Note> : null}
        <Btn label="Save" onPress={save} loading={busy} disabled={busy} />
        <Btn label="Receive more of this" icon={PackagePlus} variant="ghost" onPress={onReceive} />
      </ScrollView>
    </BottomSheet>
  );
}

/** Pick a product from the Nabz catalogue by name. */
function ProductPicker({ value, onPick }: { value?: Pick<Medicine, '_id' | 'name'>; onPick: (m: Medicine | undefined) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Medicine[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = (text: string) => {
    setQ(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      api.searchMedicines({ q: text.trim(), limit: 8 }).then((r) => setResults(r.results as Medicine[])).catch(() => setResults([]));
    }, 300);
  };
  if (value) {
    return (
      <View style={s.picked}>
        <Text style={[s.name, { flex: 1 }]} numberOfLines={2}>{value.name}</Text>
        <Pressable onPress={() => onPick(undefined)} hitSlop={10} accessibilityRole="button"><Text style={s.change}>Change</Text></Pressable>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>Product</Text>
      <TextInput value={q} onChangeText={search} placeholder="Type the medicine name" placeholderTextColor={C.muted} style={s.input} autoFocus accessibilityLabel="Product name" />
      {results.map((m) => (
        <Pressable key={m._id} onPress={() => onPick(m)} accessibilityRole="button" style={({ pressed }) => [s.result, pressed && { backgroundColor: C.brandSoft }]}>
          <Text style={s.name} numberOfLines={1}>{m.name}</Text>
          <Text style={s.meta} numberOfLines={1}>{[m.manufacturer, m.packSize || m.strength].filter(Boolean).join(' · ')}</Text>
        </Pressable>
      ))}
      {q.trim().length >= 2 && results.length === 0 ? <Text style={s.hint}>No match yet. Try fewer letters.</Text> : null}
    </View>
  );
}

function ReceiveSheet({ start, onClose, onSaved }: { start: { medicine?: Pick<Medicine, '_id' | 'name'>; mrp?: number; sellingPrice?: number }; onClose: () => void; onSaved: () => void }) {
  const [medicine, setMedicine] = useState(start.medicine);
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [qty, setQty] = useState('');
  const [mrp, setMrp] = useState(start.mrp ? String(start.mrp) : '');
  const [price, setPrice] = useState(start.sellingPrice ? String(start.sellingPrice) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    if (!medicine) return setErr('Pick the product first');
    if (!batch.trim()) return setErr('Enter the batch number printed on the pack');
    const exp = parseExpiry(expiry);
    if (!exp) return setErr('Enter the expiry as month/year, like 08/2027');
    const n = num(qty);
    if (!(Number.isInteger(n) && n > 0)) return setErr('Enter how many units you received');
    setBusy(true); setErr('');
    try {
      await api.vendorReceiveBatch({
        medicineId: medicine._id, batchNumber: batch.trim(), expiryDate: exp, qty: n,
        ...(num(mrp) > 0 ? { mrp: num(mrp) } : {}), ...(num(price) >= 0 ? { sellingPrice: num(price) } : {})
      });
      success();
      appAlert('Stock received', `${n} unit${n === 1 ? '' : 's'} of ${medicine.name} added. Oldest expiry is sold first.`);
      onSaved();
    } catch (e) { setErr(problem(e).message); } finally { setBusy(false); }
  };

  return (
    <BottomSheet visible onClose={onClose} title="Receive stock">
      <ScrollView style={{ maxHeight: 540 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
        <ProductPicker value={medicine} onPick={(m) => setMedicine(m)} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Batch no." value={batch} onChange={setBatch} numeric={false} placeholder="B12345" />
          <Field label="Expiry (MM/YYYY)" value={expiry} onChange={setExpiry} placeholder="08/2027" />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Units received" value={qty} onChange={setQty} placeholder="20" />
          <Field label="MRP on pack (₹)" value={mrp} onChange={setMrp} />
        </View>
        <Field label="Your price (₹)" value={price} onChange={setPrice} hint="Needed only for a product you don’t sell yet." />
        {err ? <Note>{err}</Note> : null}
        <Btn label="Add to stock" onPress={save} loading={busy} disabled={busy} />
      </ScrollView>
    </BottomSheet>
  );
}

function AddSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [medicine, setMedicine] = useState<Medicine | undefined>();
  const [mrp, setMrp] = useState('');
  const [price, setPrice] = useState('');
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = (m: Medicine | undefined) => { setMedicine(m); if (m?.referenceMrp && !mrp) setMrp(String(m.referenceMrp)); };
  const save = async () => {
    if (!medicine) return setErr('Pick the product first');
    const m = num(mrp); const sp = num(price); const c = count.trim() ? num(count) : 0;
    if (!(m > 0)) return setErr('Enter the MRP printed on the pack');
    if (!(sp >= 0) || sp > m) return setErr('Your price can’t be more than the MRP');
    if (!(Number.isInteger(c) && c >= 0)) return setErr('Units must be a whole number');
    setBusy(true); setErr('');
    try {
      await api.vendorUpsertInventory({ medicineId: medicine._id, mrp: m, sellingPrice: sp, stockQty: c, isAvailable: true });
      success();
      onSaved();
    } catch (e) { setErr(problem(e).message); } finally { setBusy(false); }
  };

  return (
    <BottomSheet visible onClose={onClose} title="Add a product">
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
        <ProductPicker value={medicine} onPick={pick} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="MRP (₹)" value={mrp} onChange={setMrp} />
          <Field label="Your price (₹)" value={price} onChange={setPrice} />
        </View>
        <Field label="Units on shelf" value={count} onChange={setCount} placeholder="0" hint="Tracking by batch and expiry? Leave 0 and use Receive stock." />
        {err ? <Note>{err}</Note> : null}
        <Btn label="Add product" onPress={save} loading={busy} disabled={busy} />
      </ScrollView>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: F.display, fontSize: 28, color: C.ink },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 14, minHeight: 52, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, fontFamily: F.medium, fontSize: 16, color: C.ink, paddingVertical: 12 },
  count: { fontFamily: F.semi, fontSize: 13, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, padding: 14, ...clay },
  name: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  meta: { fontFamily: F.medium, fontSize: 13, color: C.muted },
  price: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  mrp: { fontFamily: F.medium, fontSize: 13, color: C.muted },
  qtyBox: { alignItems: 'center', minWidth: 64, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 16, backgroundColor: C.cardAlt },
  qty: { fontFamily: F.display, fontSize: 24, color: C.ink },
  qtyLabel: { fontFamily: F.medium, fontSize: 11, color: C.muted },
  tag: { fontFamily: F.bold, fontSize: 12, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  tagRed: { backgroundColor: C.brandSoft, color: C.brandDark },
  tagAmber: { backgroundColor: C.amberSoft, color: C.amber },
  tagGrey: { backgroundColor: C.cardAlt, color: C.inkSoft },
  label: { fontFamily: F.bold, fontSize: 14, color: C.inkSoft },
  hint: { fontFamily: F.medium, fontSize: 12, color: C.muted },
  input: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, minHeight: 50, color: C.ink, fontFamily: F.semi, fontSize: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, padding: 12 },
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 14, padding: 10 },
  batchNo: { fontFamily: F.bold, fontSize: 15, color: C.ink },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.brandSoft, borderRadius: 14, padding: 14 },
  change: { fontFamily: F.bold, fontSize: 15, color: C.brand },
  result: { backgroundColor: C.card, borderRadius: 12, padding: 12, gap: 2, minHeight: 48 }
});
