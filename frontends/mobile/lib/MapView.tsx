import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

/**
 * What a pin stands for. Each kind has its own colour and icon (like Uber's
 * cars vs Swiggy's scooters), so people can read the map at a glance:
 *   nurse · physio · caregiver · lab · pharmacy · rider · staff (any professional)
 * `store` is the old name for a pharmacy and still works.
 */
export type PinKind = 'nurse' | 'physio' | 'caregiver' | 'lab' | 'pharmacy' | 'rider' | 'staff' | 'store';
export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  kind: PinKind;
  /** A professional who is online right now (gently pulses). */
  live?: boolean;
  /** A paid map pin: gold ring and an "Ad" tag. */
  sponsored?: boolean;
}

export const PIN_LOOK: Record<Exclude<PinKind, 'store'>, { color: string; label: string }> = {
  nurse: { color: '#c21f3d', label: 'Nurse' },
  physio: { color: '#6d4bc3', label: 'Physio' },
  caregiver: { color: '#d9731f', label: 'Caregiver' },
  lab: { color: '#1f7fb8', label: 'Lab' },
  pharmacy: { color: '#1a9960', label: 'Pharmacy' },
  rider: { color: '#2a2523', label: 'Rider' },
  staff: { color: '#c21f3d', label: 'Professional' }
};

/** Map a staff role from the API to a pin kind. */
export const pinKindForRole = (role?: string): PinKind =>
  role === 'physiotherapist' ? 'physio' : role === 'medical_staff' ? 'caregiver' : role === 'nurse' ? 'nurse' : role === 'rider' || role === 'delivery_partner' ? 'rider' : 'staff';

/**
 * Live map without a Google Maps key: Leaflet + OpenStreetMap tiles in a
 * WebView. Fine for development/pilots; for production traffic switch the
 * tile URL to a paid provider (OSM's tile policy forbids heavy app use).
 */
const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
  html,body,#m{margin:0;height:100%;background:#efe9e1}
  .leaflet-tile-pane{filter:grayscale(.5) sepia(.18) saturate(.7) contrast(.96) brightness(1.04)}
  body.dark,body.dark #m{background:#131014}
  body.dark .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) grayscale(.7) brightness(.78) contrast(.92) sepia(.08)}
  .route{stroke:#2a2523;stroke-width:5;stroke-linecap:round;fill:none}
  body.dark .route{stroke:#f3f5fb}
  .me{width:18px;height:18px;border-radius:50%;background:#c21f3d;border:3px solid #fff;box-shadow:0 0 0 8px rgba(194,31,61,.22)}
  /* Teardrop pin: coloured per service, white icon, soft shadow. */
  .mp{position:relative;width:44px;height:54px}
  .mp .drop{position:absolute;left:4px;top:2px;width:36px;height:36px;border-radius:50% 50% 50% 6px;transform:rotate(-45deg);
    background:var(--c);border:2.5px solid #fff;box-shadow:0 8px 14px -4px rgba(0,0,0,.35)}
  .mp svg{position:absolute;left:13px;top:11px;width:18px;height:18px;stroke:#fff;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
  .mp .ring{position:absolute;left:2px;top:0;width:40px;height:40px;border-radius:50%;background:var(--c);opacity:0;animation:pulse 2.2s ease-out infinite}
  @keyframes pulse{0%{transform:scale(.6);opacity:.45}100%{transform:scale(1.7);opacity:0}}
  .mp.sp{transform:scale(1.12);transform-origin:50% 100%}
  .mp.sp .drop{border-color:#ffc94d;box-shadow:0 0 0 3px rgba(255,201,77,.45),0 8px 14px -4px rgba(0,0,0,.35)}
  .mp .ad{position:absolute;right:-6px;top:-6px;background:#ffc94d;color:#3a2a00;font:800 9px/1 system-ui,sans-serif;padding:3px 5px;border-radius:8px;border:1.5px solid #fff}
  @media (prefers-reduced-motion: reduce){.mp .ring{animation:none}}
  .leaflet-control-attribution{font-size:9px}
</style></head><body><div id="m"></div><script>
  var map=L.map('m',{zoomControl:false,attributionControl:true}).setView([26.9110,75.8010],14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  var me=null, layer=L.layerGroup().addTo(map), route=null;
  var ICON={
    nurse:'<path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5"/><path d="m9 11 4 4"/><path d="m5 19-3 3"/><path d="m14 4 6 6"/>',
    physio:'<circle cx="12" cy="5" r="1.5"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10v4"/>',
    caregiver:'<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    lab:'<path d="M10 2v7.5a2 2 0 0 1-.2.9L4.7 20.6a1 1 0 0 0 .9 1.4h12.8a1 1 0 0 0 .9-1.4l-5.1-10.2a2 2 0 0 1-.2-.9V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
    pharmacy:'<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
    rider:'<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
    staff:'<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>'
  };
  var COLOR={nurse:'#c21f3d',physio:'#6d4bc3',caregiver:'#d9731f',lab:'#1f7fb8',pharmacy:'#1a9960',rider:'#2a2523',staff:'#c21f3d'};
  function pinHtml(p){
    var k = p.kind==='store' ? 'pharmacy' : (ICON[p.kind] ? p.kind : 'staff');
    return '<div class="mp'+(p.sponsored?' sp':'')+'" style="--c:'+COLOR[k]+'">'+(p.live?'<div class="ring"></div>':'')+'<div class="drop"></div><svg viewBox="0 0 24 24">'+ICON[k]+'</svg>'+(p.sponsored?'<span class="ad">Ad</span>':'')+'</div>';
  }
  function send(o){ try{ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); } }catch(_){} }
  function update(d){
    document.body.className = d.dark ? 'dark' : '';
    if(route){ map.removeLayer(route); route=null; }
    if(d.route && d.route.length>1){ route=L.polyline(d.route,{className:'route',dashArray:'1 10',weight:5}).addTo(map); }
    if(d.center){ if(!me){me=L.marker(d.center,{icon:L.divIcon({className:'',html:'<div class="me"></div>',iconSize:[18,18]}),zIndexOffset:1000}).addTo(map);} else me.setLatLng(d.center); if(!d.fit && d.follow!==false) map.setView(d.center, d.zoom||map.getZoom()||14); }
    layer.clearLayers();
    (d.pins||[]).forEach(function(p){
      var m=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:pinHtml(p),iconSize:[44,54],iconAnchor:[22,50]}),zIndexOffset:p.sponsored?500:0,keyboard:false}).bindTooltip(p.label,{direction:'top',offset:[0,-44]}).addTo(layer);
      m.on('click',function(){ send({type:'pin',id:p.id}); });
    });
    if(d.fit && d.center && (d.pins||[]).length){ var b=L.latLngBounds([d.center].concat(d.pins.map(function(p){return [p.lat,p.lng];}))); map.fitBounds(b,{padding:[60,60],maxZoom:16}); }
  }
  function onMsg(e){ try{ update(JSON.parse(e.data)); }catch(_){} }
  document.addEventListener('message',onMsg); window.addEventListener('message',onMsg);
</script></body></html>`;

/** `fit` zooms to show the center and every pin (tracking); otherwise the map follows `center`. */
export function LiveMap({ center, pins, fit = false, dark = false, route, onPinPress }: {
  center: { lat: number; lng: number } | null;
  pins: MapPin[];
  fit?: boolean;
  dark?: boolean;
  /** Draw a dotted line (e.g. nurse → home) through these points. */
  route?: Array<{ lat: number; lng: number }>;
  onPinPress?: (pin: MapPin) => void;
}) {
  const ref = useRef<WebView>(null);
  const payload = useMemo(() => JSON.stringify({
    center: center ? [center.lat, center.lng] : undefined,
    pins,
    fit,
    dark,
    route: route ? route.map((p) => [p.lat, p.lng]) : undefined
  }), [center, pins, fit, dark, route]);

  useEffect(() => { ref.current?.postMessage(payload); }, [payload]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data) as { type?: string; id?: string };
      if (msg.type === 'pin' && onPinPress) {
        const pin = pins.find((p) => p.id === msg.id);
        if (pin) onPinPress(pin);
      }
    } catch { /* ignore other messages */ }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={ref}
        source={{ html, baseUrl: 'https://medrush.local/' }}
        originWhitelist={['*']}
        onLoadEnd={() => ref.current?.postMessage(payload)}
        onMessage={onMessage}
        javaScriptEnabled
        scrollEnabled={false}
        style={{ backgroundColor: dark ? '#131014' : '#efe9e1' }}
      />
    </View>
  );
}
