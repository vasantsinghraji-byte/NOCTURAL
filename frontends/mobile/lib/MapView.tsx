import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

export interface MapPin { id: string; lat: number; lng: number; label: string; kind: 'store' | 'staff' }

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
  /* Muted, cool-toned "custom" map look over OSM tiles (dark variant for dark mode). */
  .leaflet-tile-pane{filter:grayscale(.5) sepia(.18) saturate(.7) contrast(.96) brightness(1.04)}
  body.dark,body.dark #m{background:#131014}
  body.dark .leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) grayscale(.7) brightness(.78) contrast(.92) sepia(.08)}
  .route{stroke:#2a2523;stroke-width:5;stroke-linecap:round;fill:none}
  body.dark .route{stroke:#f3f5fb}
  .me{width:18px;height:18px;border-radius:50%;background:#b83a50;border:3px solid #fff;box-shadow:0 0 0 8px rgba(184,58,80,.22)}
  .pin{width:34px;height:34px;border-radius:12px;background:#b83a50;display:grid;place-items:center;box-shadow:0 6px 14px rgba(184,58,80,.35);border:2px solid #fff}
  .pin.staff{background:#1a9960}
  .pin svg{width:18px;height:18px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .leaflet-control-attribution{font-size:9px}
</style></head><body><div id="m"></div><script>
  var map=L.map('m',{zoomControl:false,attributionControl:true}).setView([26.9110,75.8010],14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  var me=null, layer=L.layerGroup().addTo(map), route=null;
  var STORE='<svg viewBox="0 0 24 24"><path d="m2 7 4.4-4.4A2 2 0 0 1 7.8 2h8.4a2 2 0 0 1 1.4.6L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>';
  var STAFF='<svg viewBox="0 0 24 24"><path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/></svg>';
  function update(d){
    document.body.className = d.dark ? 'dark' : '';
    if(route){ map.removeLayer(route); route=null; }
    if(d.route && d.route.length>1){ route=L.polyline(d.route,{className:'route',dashArray:'1 10',weight:5}).addTo(map); }
    if(d.center){ if(!me){me=L.marker(d.center,{icon:L.divIcon({className:'',html:'<div class="me"></div>',iconSize:[18,18]})}).addTo(map);} else me.setLatLng(d.center); if(!d.fit && d.follow!==false) map.setView(d.center, d.zoom||map.getZoom()||14); }
    layer.clearLayers();
    (d.pins||[]).forEach(function(p){ L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:'<div class="pin'+(p.kind==='staff'?' staff':'')+'">'+(p.kind==='store'?STORE:STAFF)+'</div>',iconSize:[36,36]})}).bindTooltip(p.label).addTo(layer); });
    if(d.fit && d.center && (d.pins||[]).length){ var b=L.latLngBounds([d.center].concat(d.pins.map(function(p){return [p.lat,p.lng];}))); map.fitBounds(b,{padding:[60,60],maxZoom:16}); }
  }
  function onMsg(e){ try{ update(JSON.parse(e.data)); }catch(_){} }
  document.addEventListener('message',onMsg); window.addEventListener('message',onMsg);
</script></body></html>`;

/** `fit` zooms to show the center and every pin (tracking); otherwise the map follows `center`. */
export function LiveMap({ center, pins, fit = false, dark = false, route }: {
  center: { lat: number; lng: number } | null;
  pins: MapPin[];
  fit?: boolean;
  dark?: boolean;
  /** Draw a dotted line (e.g. nurse → home) through these points. */
  route?: Array<{ lat: number; lng: number }>;
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

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={ref}
        source={{ html, baseUrl: 'https://medrush.local/' }}
        originWhitelist={['*']}
        onLoadEnd={() => ref.current?.postMessage(payload)}
        javaScriptEnabled
        scrollEnabled={false}
        style={{ backgroundColor: dark ? '#131014' : '#efe9e1' }}
      />
    </View>
  );
}
