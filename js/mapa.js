// MAPA (OpenStreetMap + Leaflet), tomado de la app D@NDINET: tocar para marcar la ubicación.
// Leaflet se descarga solo cuando se abre el mapa (necesita señal). Versión fija.
import { ic } from './iconos.js';

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
const CENTRO_PANGOA = [-11.4325, -74.4825];
let _leaflet = null;

export function cargarLeaflet() {
  if (_leaflet) return _leaflet;
  _leaflet = new Promise((ok, mal) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.css'; css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; css.crossOrigin = '';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = LEAFLET + 'leaflet.js'; js.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; js.crossOrigin = '';
    js.onload = () => ok(window.L);
    js.onerror = () => { _leaflet = null; mal(new Error('No se pudo cargar el mapa (¿sin señal?)')); };
    document.head.appendChild(js);
  });
  return _leaflet;
}

/** "lat,lng" → [lat, lng] o null */
export function aPunto(txt) {
  const m = String(txt || '').match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * Abre el mapa en un diálogo propio (encima del que esté abierto). Devuelve "lat,lng" o null.
 * ui: { aviso }
 */
export async function elegirEnMapa(ui, actual, titulo = 'Ubicar al cliente') {
  if (!navigator.onLine) { ui.aviso('El mapa necesita señal. Use "Estoy aquí" o escriba las coordenadas.', 'error'); return null; }
  let L;
  try { L = await cargarLeaflet(); } catch (e) { ui.aviso(e.message, 'error'); return null; }
  const p0 = aPunto(actual);
  let punto = p0 || CENTRO_PANGOA;
  return new Promise((ok) => {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo capa-mapa';
    fondo.innerHTML = `<div class="modal grande" role="dialog" aria-modal="true" aria-labelledby="mapaT"><h3 id="mapaT">${titulo}</h3>
      <p class="sub">Toque el mapa o arrastre la marca. Acerque con dos dedos.</p>
      <div class="mapa" id="mapaSel"></div><p class="sub" id="mapaTxt"></p>
      <div class="botones"><button class="btn" id="mapaYo">${ic('ubicacion')}Mi ubicación</button><button class="btn verde" id="mapaOk">${ic('check')}Usar esta</button></div>
      <button class="btn secundario" id="mapaNo">Cancelar</button></div>`;
    document.body.appendChild(fondo);
    const q = (s) => fondo.querySelector(s);
    const mapa = L.map(q('#mapaSel')).setView(punto, p0 ? 17 : 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
    const marca = L.marker(punto, { draggable: true }).addTo(mapa);
    const mostrar = () => { q('#mapaTxt').textContent = punto[0].toFixed(6) + ', ' + punto[1].toFixed(6); };
    mostrar();
    mapa.on('click', (e) => { punto = [e.latlng.lat, e.latlng.lng]; marca.setLatLng(e.latlng); mostrar(); });
    marca.on('dragend', () => { const p = marca.getLatLng(); punto = [p.lat, p.lng]; mostrar(); });
    const cerrar = (v) => { mapa.remove(); fondo.remove(); ok(v); };
    q('#mapaYo').onclick = () => navigator.geolocation && navigator.geolocation.getCurrentPosition((p) => {
      punto = [p.coords.latitude, p.coords.longitude]; marca.setLatLng(punto); mapa.setView(punto, 17); mostrar();
    }, () => ui.aviso('No se pudo obtener la ubicación.', 'error'), { enableHighAccuracy: true, timeout: 15000 });
    q('#mapaOk').onclick = () => cerrar(punto[0].toFixed(6) + ',' + punto[1].toFixed(6));
    q('#mapaNo').onclick = () => cerrar(null);
    fondo.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(null); });
    setTimeout(() => mapa.invalidateSize(), 200);
  });
}

/** Ubicación actual del celular → "lat,lng" (con su precisión) o error. */
export function miUbicacion() {
  return new Promise((ok, mal) => {
    if (!navigator.geolocation) return mal(new Error('Este equipo no da la ubicación.'));
    navigator.geolocation.getCurrentPosition((p) => ok({ valor: p.coords.latitude.toFixed(6) + ',' + p.coords.longitude.toFixed(6), precision: Math.round(p.coords.accuracy) }),
      (e) => mal(new Error('No se pudo obtener la ubicación: ' + e.message)), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
