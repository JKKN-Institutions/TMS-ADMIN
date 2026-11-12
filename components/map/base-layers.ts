/**
 * The map styles every tracking map offers, and the viewer's remembered choice.
 *
 *   Street     standard OpenStreetMap tiles (keyless) — the default.
 *   Light      Esri Light Gray Canvas: a pale, low-detail map that lets the buses stand
 *              out. Chosen because CARTO's Positron, the usual light style, serves an
 *              "API KEY REQUIRED" placeholder for keyless requests (re-checked
 *              2026-11-12). Its tiles stop at zoom 16, so closer zooms are enlarged.
 *   Satellite  Esri World Imagery.
 *
 * All three are free with attribution and need no key. Client-only (imports leaflet).
 */
import L from 'leaflet';

const STORE_KEY = 'tms-map-style';
type StyleName = 'Street' | 'Light' | 'Satellite';

function remembered(): StyleName {
  try {
    const v = window.localStorage.getItem(STORE_KEY);
    if (v === 'Light' || v === 'Satellite') return v;
  } catch {
    /* private window or blocked storage: fall through to the default */
  }
  return 'Street';
}

/** Adds the base layers and the switcher to `map`, showing the remembered style. */
export function addBaseLayers(map: L.Map): void {
  const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
    maxNativeZoom: 19,
    attribution: '© OpenStreetMap contributors',
  });
  const light = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      maxNativeZoom: 16,
      attribution: 'Tiles © Esri',
    }),
    // Place names as a separate, sparse layer over the pale base.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      maxNativeZoom: 16,
    }),
  ]);
  const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 20, attribution: 'Tiles © Esri' },
  );

  const layers: Record<StyleName, L.Layer> = { Street: street, Light: light, Satellite: satellite };
  layers[remembered()].addTo(map);
  L.control.layers(layers, {}, { position: 'topright' }).addTo(map);

  map.on('baselayerchange', (e: L.LayersControlEvent) => {
    try {
      window.localStorage.setItem(STORE_KEY, e.name);
    } catch {
      /* not remembered this time; the map still switches */
    }
  });
}
