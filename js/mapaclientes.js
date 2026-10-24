// MAPA DE CLIENTES (fase 5): a quién hay que ver en persona.
// - Colores: rojo = sin WhatsApp / sin teléfono (avisar en persona), naranja = pendiente por atender,
//   morado = visita programada, gris = el resto (con deuda).
// - "Cerca de mí": sigue la ubicación del celular y avisa cuando pasa cerca (≤ 300 m) de alguien por atender.
// - Sin señal no hay mapa: se muestra la lista "por atender" por zona.
import { D, esc, soles, claseEstado, alertasDe, gpsDe, distanciaM } from './datos.js';
import { ic } from './iconos.js';
import { ayuda, celebrar } from './ayuda.js';
import { cargarLeaflet } from './mapa.js';
import { modalNuevaOrden } from './ordenes.js';

const CENTRO = [-11.4325, -74.4825];
const CAPAS = [['atender', 'Por atender'], ['sinwa', 'Sin WhatsApp'], ['pendiente', 'Pendientes'], ['visita', 'Visitas'], ['corte', 'Para corte'], ['deuda', 'Con deuda']];
const F = { capa: 'atender', zona: '' };
const CERCA_M = 300;
let VIGIA = null, AVISADOS = new Set();

const color = (al) => {
  const css = (v, d) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d;
  if (al.some((a) => a.k === 'visita')) return css('--c-primario', '#533afd');
  if (al.some((a) => a.k === 'pendiente')) return css('--c-susp', '#9a4a00');
  if (al.some((a) => ['sinwa', 'sintel'].includes(a.k))) return css('--c-peligro', '#b42318');
  if (al.some((a) => a.k === 'corte')) return '#7a1a12';
  return css('--c-neutro', '#4a5a72');
};
const pasa = (id, al) => {
  const e = D.estados[id] || {}, deuda = Number(e.MONTO) > 0 && (D.porId[id] || {}).ESTADO_INFORME !== 'AL_DIA_SALIO';
  if (F.capa === 'atender') return al.some((a) => ['sinwa', 'sintel', 'pendiente', 'visita'].includes(a.k)) && (deuda || al.some((a) => ['pendiente', 'visita'].includes(a.k)));
  if (F.capa === 'sinwa') return deuda && al.some((a) => ['sinwa', 'sintel'].includes(a.k));
  if (F.capa === 'deuda') return deuda;
  return al.some((a) => a.k === F.capa);
};

export async function vMapaClientes(ui) {
  pararVigia();
  const zonas = [...new Set(D.clientes.map((c) => c.ZONA).filter(Boolean))].sort();
  const todos = D.clientes.filter((c) => !F.zona || c.ZONA === F.zona).map((c) => ({ c, al: alertasDe(c.ID_CLIENTE) })).filter((x) => pasa(x.c.ID_CLIENTE, x.al));
  const con = todos.filter((x) => (x.p = gpsDe(x.c))), sin = todos.filter((x) => !x.p);
  ui.vista().innerHTML = `<div class="titulo-fila"><h2>Mapa</h2>${ayuda('mapa')}</div>
    <div class="chips desliza">${CAPAS.map(([k, t]) => `<button class="mini ${F.capa === k ? 'sel' : ''}" data-capa="${k}">${t}</button>`).join('')}</div>
    <div class="fila-mapa"><label class="filtros">Zona<select id="mZona"><option value="">Todas</option>${zonas.map((z) => `<option ${F.zona === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
      <button class="btn ${VIGIA ? 'verde' : ''}" id="cerca">${ic('ubicacion')}Cerca de mí</button></div>
    <div class="leyenda"><span><i style="background:${color([{ k: 'sinwa' }])}"></i>Sin WhatsApp</span><span><i style="background:${color([{ k: 'pendiente' }])}"></i>Pendiente</span>
      <span><i style="background:${color([{ k: 'visita' }])}"></i>Visita</span><span><i style="background:${color([])}"></i>Otros</span></div>
    ${con.length ? '' : `<p class="aviso">${ic('ubicacion')}<span>Nadie de este filtro tiene ubicación todavía. Se guarda sola al <b>registrar una visita</b>, o con <b>Estoy aquí</b> en la ficha.</span></p>`}
    <div class="mapa mapa-grande" id="mapaCli"></div>
    <div id="cercanos" class="cercanos" hidden></div>
    <p class="sub">${con.length} en el mapa${sin.length ? ` · <button class="enlace" id="sinUb">${sin.length} sin ubicación</button>` : ''}</p>
    <ul class="lista compacta" id="listaSin" hidden>${sin.slice(0, 200).map((x) => filaCli(x)).join('')}</ul>`;
  const v = ui.vista();
  v.querySelectorAll('[data-capa]').forEach((b) => { b.onclick = () => { F.capa = b.dataset.capa; vMapaClientes(ui); }; });
  v.querySelector('#mZona').onchange = (e) => { F.zona = e.target.value; vMapaClientes(ui); };
  const su = v.querySelector('#sinUb'); if (su) su.onclick = () => { const l = v.querySelector('#listaSin'); l.hidden = !l.hidden; };

  const caja = v.querySelector('#mapaCli');
  let L = null, mapa = null, yo = null;
  if (navigator.onLine) {
    try {
      L = await cargarLeaflet();
      if (!document.body.contains(caja)) return;
      mapa = L.map(caja);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
      con.forEach((x) => {
        L.circleMarker(x.p, { radius: 8, color: '#fff', weight: 2, fillColor: color(x.al), fillOpacity: 0.95 }).addTo(mapa)
          .bindPopup(() => popup(x), { maxWidth: 260 })
          .on('popupopen', (e) => {
            const el = e.popup.getElement(), b = el && el.querySelector('[data-orden]');
            if (b) b.onclick = () => { mapa.closePopup(); modalNuevaOrden(ui, { clientes: [x.c.ID_CLIENTE] }, () => vMapaClientes(ui)); };
          });
      });
      if (con.length) mapa.fitBounds(L.latLngBounds(con.map((x) => x.p)).pad(0.1), { maxZoom: 16 }); else mapa.setView(CENTRO, 13);
      setTimeout(() => mapa.invalidateSize(), 150);
      window.addEventListener('hashchange', () => { pararVigia(); mapa.remove(); }, { once: true });
    } catch (e) { caja.innerHTML = `<p class="aviso">${ic('alerta')}<span>${esc(e.message)}</span></p>`; }
  } else {
    caja.outerHTML = `<p class="aviso">${ic('wifi')}<span>Sin señal no se ve el mapa. Abajo la lista por atender.</span></p><ul class="lista compacta">${todos.slice(0, 150).map(filaCli).join('')}</ul>`;
  }

  // ---- cerca de mí -------------------------------------------------------------
  v.querySelector('#cerca').onclick = () => {
    if (VIGIA) { pararVigia(); return vMapaClientes(ui); }
    if (!navigator.geolocation) return ui.aviso('Este equipo no da la ubicación.', 'error');
    AVISADOS = new Set();
    v.querySelector('#cerca').classList.add('verde');
    ui.aviso('Siguiendo su ubicación: le avisaremos al pasar cerca de alguien por atender.');
    VIGIA = navigator.geolocation.watchPosition((pos) => {
      const p = [pos.coords.latitude, pos.coords.longitude];
      if (mapa && L) {
        if (!yo) { yo = L.circleMarker(p, { radius: 9, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(mapa).bindPopup('Usted'); mapa.setView(p, 16); }
        else yo.setLatLng(p);
      }
      const cerca = con.map((x) => Object.assign(x, { dist: distanciaM(p, x.p) })).filter((x) => x.dist <= CERCA_M).sort((a, b) => a.dist - b.dist);
      const nuevos = cerca.filter((x) => !AVISADOS.has(x.c.ID_CLIENTE));
      nuevos.forEach((x) => AVISADOS.add(x.c.ID_CLIENTE));
      if (nuevos.length) celebrar(`Cerca: ${nuevos[0].c.NOMBRES || ''}`, `${Math.round(nuevos[0].dist)} m · ${nuevos[0].al.map((a) => a.txt).slice(0, 2).join(' · ')}${nuevos.length > 1 ? ` · y ${nuevos.length - 1} más` : ''}`, 'aviso');
      const box = document.getElementById('cercanos');
      if (!box) return;
      box.hidden = !cerca.length;
      box.innerHTML = `<b>${ic('ubicacion')} Cerca de usted (${cerca.length})</b><ul class="lista compacta">${cerca.slice(0, 5).map((x) => filaCli(x)).join('')}</ul>`;
    }, () => { ui.aviso('No se pudo obtener la ubicación.', 'error'); pararVigia(); }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
  };
}

function pararVigia() { if (VIGIA !== null && navigator.geolocation) navigator.geolocation.clearWatch(VIGIA); VIGIA = null; }

function filaCli(x) {
  const e = D.estados[x.c.ID_CLIENTE] || {};
  return `<li><a href="#/cliente/${esc(x.c.ID_CLIENTE)}"><div><b>${esc(x.c.NOMBRES || x.c.ID_CLIENTE)}</b>
    <small>${x.dist != null ? Math.round(x.dist) + ' m · ' : ''}${esc(x.c.ZONA || '')} ${x.al.slice(0, 2).map((a) => `<span class="chip ${a.cls}">${esc(a.txt)}</span>`).join(' ')}</small></div>
    <div class="der">${e.ESTADO ? `<span class="chip ${claseEstado(e.ESTADO)}">${esc(e.ESTADO)}</span>` : ''}</div></a></li>`;
}

function popup(x) {
  const e = D.estados[x.c.ID_CLIENTE] || {};
  return `<div class="pop"><b>${esc(x.c.NOMBRES || '')}</b><small>${esc(x.c.ZONA || '')}${x.c.REFERENCIA ? ' · ' + esc(x.c.REFERENCIA) : ''}</small>
    <div>${x.al.slice(0, 3).map((a) => `<span class="chip ${a.cls}">${esc(a.txt)}</span>`).join(' ')}${Number(e.MONTO) > 0 ? ` <small>${soles(e.MONTO)}</small>` : ''}</div>
    <div class="pop-acc"><a class="mini" href="#/cliente/${esc(x.c.ID_CLIENTE)}">Ficha</a>
      <a class="mini" href="https://www.google.com/maps/dir/?api=1&destination=${x.p.join(',')}" target="_blank" rel="noopener">Ir</a>
      <button class="mini verde" data-orden="1">+ Visita</button></div></div>`;
}
