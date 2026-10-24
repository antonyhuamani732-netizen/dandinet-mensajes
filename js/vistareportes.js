// PANTALLAS DE REPORTES Y PANEL (fase 6). Los cálculos están en reportes.js.
// - Reportes: cada uno se ve en pantalla, se imprime / guarda en PDF (A4) y se baja a Excel (CSV).
// - Panel: filtros arriba (informe, zona, servicio, estado), cifras clave y gráficos con detalle al tocar.
// Ningún reporte lleva DNI; teléfonos y referencias solo con REPORTE_CON_UBICACION = SI.
import { D, esc, soles, txtFecha, txtTel, hoyISO, claseEstado, telefonosDe } from './datos.js';
import { ic } from './iconos.js';
import { ayuda } from './ayuda.js';
import { modalNuevaOrden } from './ordenes.js';
import * as R from './reportes.js';

const conUbicacion = () => /^S/i.test(String(D.config.REPORTE_CON_UBICACION || 'SI'));
const zonas = () => [...new Set(D.clientes.map((c) => c.ZONA).filter(Boolean))].sort();
const cifra = (n) => Number(n || 0).toLocaleString('es-PE');
const solesC = (x) => 'S/ ' + Math.round(Number(x) || 0).toLocaleString('en-US');   // sin decimales en los gráficos
const NOMBRE_GES = { NO_CONTESTA: 'No contesta', PROMESA_PAGO: 'Promesa de pago', PAGO_POR_CONFIRMAR: 'Dijo que pagó', NUMERO_EQUIVOCADO: 'Número equivocado',
  RECLAMO: 'Reclamo', SOLICITA_CORTE: 'Pide corte', SOLICITA_BAJA: 'Pide baja', VISITA: 'Visita', OTRO: 'Otro' };
const NOMBRE_TIPO = { VISITA_COBRO: 'Visita de cobro', REVISION: 'Revisión técnica', CORTE: 'Corte', RECONEXION: 'Reconexión', DATOS: 'Actualizar datos', OTRO: 'Otro' };
const NOMBRE_CAT = { SIN_SERVICIO: 'Sin servicio', SENAL_LENTA: 'Señal lenta', EQUIPO: 'Equipo', NUMERO_EQUIVOCADO: 'Número equivocado', RECLAMO_COBRO: 'Reclamo de cobro',
  SOLICITA_CORTE: 'Pide corte', SOLICITA_BAJA: 'Pide baja', OTRO: 'Otro' };

// ============================================================================
// LISTA DE REPORTES
// ============================================================================
const REPORTES = [
  ['cobranza', 'cobrar', 'Cobranza', 'Deuda por zona y estado, avisos y acciones del mes', false],
  ['corte', 'cortar', 'Lista de corte', 'Qué cortar, qué revisar y a quién avisar primero', true],
  ['datos', 'editar', 'Datos para optimizar', 'Sin teléfono, sin WhatsApp, sin GPS, montos por revisar', true],
  ['comparar', 'grafico', 'Comparación de informes', 'Nuevos, salieron (pagaron), subió o bajó', false],
  ['empresa', 'documento', 'Quejas y órdenes (Empresa X)', 'Pendientes, derivadas y trabajos del mes', false],
  ['correcciones', 'ubicacion', 'Correcciones de contacto (Empresa X)', 'Teléfonos, direcciones y referencias corregidos', false],
];

export function vReportes(ui) {
  const tec = ui.esTecnico();
  const lista = REPORTES.filter((r) => !tec || r[4]);
  ui.vista().innerHTML = `<div class="titulo-fila"><h2>Reportes</h2>${ayuda('reportes')}</div>
    ${tec ? '' : `<a class="cta" href="#/panel">${ic('grafico')}<span class="txt"><b>Panel de control</b><small>Cifras y gráficos con filtros</small></span>${ic('flecha', 'fin')}</a>`}
    <ul class="tarjetas-lista">${lista.map(([k, i, t, sub]) => `<li><a class="tarjeta-ot" href="#/reporte/${k}"><span class="ico-ot">${ic(i)}</span>
      <span class="txt"><b>${esc(t)}</b><small>${esc(sub)}</small></span>${ic('flecha', 'fin')}</a></li>`).join('')}</ul>`;
}

// ============================================================================
// UN REPORTE
// ============================================================================
const FR = { zona: '', mes: '', a: '', b: '', todas: false };
export function vReporte(ui, tipo) {
  const def = REPORTES.find((r) => r[0] === tipo);
  if (!def || (ui.esTecnico() && !def[4])) { location.hash = '#/reportes'; return; }
  const hoy = hoyISO(), aps = R.informesAplicados(D);
  FR.mes = FR.mes || hoy.slice(0, 7);
  const filtros = [];
  if (['cobranza', 'corte', 'datos', 'correcciones'].includes(tipo)) filtros.push(`<label>Zona<select data-f="zona"><option value="">Todas</option>${zonas().map((z) => `<option ${FR.zona === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>`);
  if (tipo === 'empresa') filtros.push(`<label>Mes<input type="month" data-f="mes" value="${esc(FR.mes)}"></label>`);
  if (tipo === 'comparar' && aps.length >= 2) {
    if (!FR.a || !aps.some((i) => i.ID_INFORME === FR.a)) FR.a = aps[aps.length - 2].ID_INFORME;
    if (!FR.b || !aps.some((i) => i.ID_INFORME === FR.b)) FR.b = aps[aps.length - 1].ID_INFORME;
    const opc = (sel) => aps.map((i) => `<option value="${esc(i.ID_INFORME)}" ${sel === i.ID_INFORME ? 'selected' : ''}>${esc(i.PERIODO)}</option>`).join('');
    filtros.push(`<label>Antes<select data-f="a">${opc(FR.a)}</select></label><label>Ahora<select data-f="b">${opc(FR.b)}</select></label>`);
  }
  const rep = ARMAR[tipo](hoy, aps);
  ui.vista().innerHTML = `<div class="titulo-fila"><h2>${esc(def[2])}</h2></div>
    ${filtros.length ? `<div class="filtros-envio">${filtros.join('')}</div>` : ''}
    <div class="botones"><button class="btn" id="pdf">${ic('documento')}Imprimir / PDF</button>${rep.csv ? `<button class="btn" id="csv">${ic('descargar')}Excel</button>` : ''}
      ${rep.accion ? `<button class="btn verde" id="accion">${ic(rep.accion[0])}${esc(rep.accion[1])}</button>` : ''}</div>
    <div class="reporte">${rep.html}</div>
    <a class="btn secundario" href="#/reportes">${ic('atras')}Reportes</a>`;
  ui.vista().querySelectorAll('[data-f]').forEach((el) => { el.onchange = () => { FR[el.dataset.f] = el.value; vReporte(ui, tipo); }; });
  ui.vista().querySelector('#pdf').onclick = () => imprimir(def[2], rep.sub, rep.html);
  const cv = ui.vista().querySelector('#csv'); if (cv) cv.onclick = () => descargarCSV(`${tipo}_${hoy}.csv`, rep.csv);
  const ac = ui.vista().querySelector('#accion'); if (ac) ac.onclick = () => rep.accion[2](ui);
  const vt = ui.vista().querySelector('#verTodas'); if (vt) vt.onclick = () => { FR.todas = !FR.todas; vReporte(ui, tipo); };
}

const filtroZona = (l) => l.filter((x) => !FR.zona || x.zona === FR.zona);
const lineaCli = (x, extra = '') => `<tr><td><a href="#/cliente/${esc(x.id)}">${esc(x.nombre)}</a></td><td>${esc(x.zona)}</td>${extra}</tr>`;
const tels = (id) => telefonosDe(id).utiles.map((t) => txtTel(t.NUMERO)).join(' / ');

const ARMAR = {
  cobranza(hoy) {
    const C = R.reporteCobranza(D, D.config, hoy, { zona: FR.zona }), P = C.P;
    const html = `${tarjetas([['Con deuda', cifra(P.conDeuda)], ['Deuda', soles(P.deuda)], ['Para corte', cifra(P.paraCorte)], ['Avance de avisos', `${P.avance.avisados}/${P.avance.deben} · ${P.avance.pct} %`]])}
      <h3>Deuda por zona y estado</h3><div class="tabla-desliza"><table class="tabla"><thead><tr><th>Zona</th>${R.ESTADOS.map((e) => `<th>${esc(e)}</th>`).join('')}<th>Total</th></tr></thead>
      <tbody>${C.tabla.map((z) => `<tr><td>${esc(z.zona)}</td>${z.celdas.map((c) => `<td class="num">${c.n ? `${c.n}<small>${soles(c.monto)}</small>` : '–'}</td>`).join('')}<td class="num"><b>${z.n}</b><small>${soles(z.total)}</small></td></tr>`).join('')}</tbody></table></div>
      <h3>Acciones del mes</h3><p>${C.avisosMes} aviso(s) enviados por WhatsApp${Object.keys(C.acciones).length ? ' · ' + Object.entries(C.acciones).map(([k, n]) => `${esc(NOMBRE_GES[k] || k)}: ${n}`).join(' · ') : ''}.</p>
      <p class="sub">Informe ${esc(P.informe ? P.informe.PERIODO : '—')}${P.recuperado !== null ? ` · recuperado frente al anterior: <b>${soles(P.recuperado)}</b>` : ' · el recuperado aparece con el informe del próximo mes'}.</p>`;
    const csv = [['Zona', ...R.ESTADOS.flatMap((e) => [e + ' (clientes)', e + ' (S/)']), 'Clientes', 'Total S/']].concat(C.tabla.map((z) => [z.zona, ...z.celdas.flatMap((c) => [c.n, c.monto.toFixed(2)]), z.n, z.total.toFixed(2)]));
    return { html, csv, sub: `Informe ${P.informe ? P.informe.PERIODO : ''}${FR.zona ? ' · ' + FR.zona : ''}` };
  },
  corte(hoy) {
    const G = R.clasificarCorte(D, D.config, hoy), ubic = conUbicacion();
    Object.keys(G).forEach((k) => { G[k] = filtroZona(G[k]); });
    const html = `${tarjetas([['Cortar', cifra(G.cortar.length)], ['Falta aviso', cifra(G.avisar.length + G.persona.length)], ['Revisar / no cortar', cifra(G.revisar.length + G.nocortar.length)], ['Piden corte o baja', cifra(G.pide.length)]])}
      ${R.GRUPOS_CORTE.map(([k, t, exp]) => G[k].length ? `<h3 class="${k === 'cortar' ? 'rojo' : ''}">${esc(t)} (${G[k].length})</h3><p class="sub">${esc(exp)}</p>
        <div class="tabla-desliza"><table class="tabla"><thead><tr><th>Cliente</th><th>Zona</th><th>Meses</th><th>Deuda</th><th>Motivo</th>${ubic ? '<th>Teléfono · referencia</th>' : ''}</tr></thead><tbody>
        ${G[k].map((x) => lineaCli(x, `<td class="num">${x.meses}</td><td class="num">${soles(x.monto)}</td><td>${esc(x.motivo)}</td>${ubic ? `<td>${esc(tels(x.id))}<small>${esc((D.porId[x.id] || {}).REFERENCIA || '')}</small></td>` : ''}`)).join('')}</tbody></table></div>` : '').join('')
        || '<p class="vacio">Nadie para corte.</p>'}`;
    const csv = [['Grupo', 'Cliente', 'Zona', 'Meses', 'Deuda', 'Motivo', ...(ubic ? ['Teléfonos', 'Referencia'] : [])]]
      .concat(R.GRUPOS_CORTE.flatMap(([k, t]) => G[k].map((x) => [t, x.nombre, x.zona, x.meses, x.monto.toFixed(2), x.motivo, ...(ubic ? [tels(x.id), (D.porId[x.id] || {}).REFERENCIA || ''] : [])])));
    return { html, csv, sub: `Al ${txtFecha(hoy)}${FR.zona ? ' · ' + FR.zona : ''} · el corte lo hace nuestro técnico`,
      accion: G.cortar.length ? ['cortar', `Orden de corte (${Math.min(G.cortar.length, 60)})`, (ui) => modalNuevaOrden(ui, { tipo: 'CORTE', clientes: G.cortar.slice(0, 60).map((x) => x.id) }, () => vReporte(ui, 'corte'))] : null };
  },
  datos() {
    const G = R.datosOptimizar(D);
    Object.keys(G).forEach((k) => { G[k] = filtroZona(G[k]); });
    const html = `<p class="sub">Clientes con deuda. Toque un nombre para corregirlo en su ficha.</p>
      ${R.GRUPOS_DATOS.map(([k, t]) => `<details class="plegable" ${G[k].length && G[k].length < 40 ? 'open' : ''}><summary>${esc(t)} (${G[k].length})</summary>
        ${G[k].length ? `<table class="tabla"><tbody>${G[k].map((x) => lineaCli(x, `<td><small>${esc(x.ref)}</small></td>`)).join('')}</tbody></table>` : '<p class="sub">Nadie.</p>'}</details>`).join('')}`;
    const csv = [['Problema', 'Cliente', 'Zona', 'Referencia']].concat(R.GRUPOS_DATOS.flatMap(([k, t]) => G[k].map((x) => [t, x.nombre, x.zona, x.ref])));
    return { html, csv, sub: `Datos por corregir${FR.zona ? ' · ' + FR.zona : ''}`,
      accion: G.singps.length || G.sintel.length ? ['ubicacion', 'Orden para actualizar datos', (ui) => modalNuevaOrden(ui, { tipo: 'DATOS', clientes: [...new Set(G.sintel.concat(G.singps).map((x) => x.id))].slice(0, 20) }, () => vReporte(ui, 'datos'))] : null };
  },
  comparar(hoy, aps) {
    if (aps.length < 2) return { html: `<p class="aviso">${ic('reloj')}<span>Hay un solo informe aplicado (${esc(aps[0] ? aps[0].PERIODO : '—')}). La comparación aparece al importar el del próximo mes.</span></p>`, sub: '' };
    const c = R.compararInformes(D, FR.a, FR.b), pa = (aps.find((i) => i.ID_INFORME === FR.a) || {}).PERIODO, pb = (aps.find((i) => i.ID_INFORME === FR.b) || {}).PERIODO;
    const bloque = (t, l, extra) => `<details class="plegable"><summary>${esc(t)} (${l.length})</summary>${l.length ? `<table class="tabla"><tbody>${l.map((x) => lineaCli(x, extra(x))).join('')}</tbody></table>` : '<p class="sub">Nadie.</p>'}</details>`;
    const html = `${tarjetas([['Salieron (pagaron)', cifra(c.salieron.length)], ['Nuevos en deuda', cifra(c.nuevos.length)], ['Bajó / subió', `${c.bajo.length} / ${c.subio.length}`], ['Recuperado', soles(c.recuperado)]])}
      <h3>Por zona</h3><div class="tabla-desliza"><table class="tabla"><thead><tr><th>Zona</th><th>${esc(pa)}</th><th>${esc(pb)}</th><th>Salieron</th><th>Nuevos</th></tr></thead>
      <tbody>${c.porZona.map((z) => `<tr><td>${esc(z.zona)}</td><td class="num">${soles(z.antes)}</td><td class="num">${soles(z.ahora)}</td><td class="num">${z.salieron}</td><td class="num">${z.nuevos}</td></tr>`).join('')}</tbody></table></div>
      ${bloque('Salieron (pagaron)', c.salieron, (x) => `<td class="num">${soles(x.monto)}</td>`)}${bloque('Nuevos en deuda', c.nuevos, (x) => `<td class="num">${soles(x.monto)}</td>`)}
      ${bloque('Bajó su deuda', c.bajo, (x) => `<td class="num">${soles(x.antes)} → ${soles(x.monto)}</td>`)}${bloque('Subió su deuda', c.subio, (x) => `<td class="num">${soles(x.antes)} → ${soles(x.monto)}</td>`)}`;
    const csv = [['Cambio', 'Cliente', 'Zona', `Deuda ${pa}`, `Deuda ${pb}`]].concat(
      c.salieron.map((x) => ['Salió', x.nombre, x.zona, x.monto.toFixed(2), '0.00']), c.nuevos.map((x) => ['Nuevo', x.nombre, x.zona, '0.00', x.monto.toFixed(2)]),
      c.bajo.map((x) => ['Bajó', x.nombre, x.zona, x.antes.toFixed(2), x.monto.toFixed(2)]), c.subio.map((x) => ['Subió', x.nombre, x.zona, x.antes.toFixed(2), x.monto.toFixed(2)]));
    return { html, csv, sub: `${pa} → ${pb}` };
  },
  empresa() {
    const Q = R.quejasYOrdenes(D, FR.mes), nom = (id) => (D.porId[id] || {}).NOMBRES || id, zon = (id) => (D.porId[id] || {}).ZONA || '';
    const tq = (l, fecha) => l.length ? `<div class="tabla-desliza"><table class="tabla"><thead><tr><th>Cliente</th><th>Zona</th><th>Problema</th><th>${fecha ? 'Cerrado' : 'Desde'}</th><th>Detalle</th></tr></thead><tbody>
      ${l.map((q) => `<tr><td>${esc(nom(q.ID_CLIENTE))}</td><td>${esc(zon(q.ID_CLIENTE))}</td><td>${esc(NOMBRE_CAT[q.CATEGORIA] || q.CATEGORIA)}</td><td>${esc(txtFecha(fecha ? q.F_CIERRE : q.F_APERTURA))}</td><td>${esc(q.SOLUCION || q.DESCRIPCION || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">Ninguno.</p>';
    const html = `${tarjetas([['Por atender', cifra(Q.abiertas.length)], ['Derivados a la Empresa X', cifra(Q.derivadas.length)], ['Cortes', cifra(Q.cortes)], ['Reconexiones', cifra(Q.reconexiones)]])}
      <h3>Derivados a la Empresa X</h3>${tq(Q.derivadas)}<h3>Por atender</h3>${tq(Q.abiertas)}<h3>Resueltos en el mes</h3>${tq(Q.resueltas, true)}
      <h3>Trabajos de campo del mes</h3>${Q.visitas.length ? `<div class="tabla-desliza"><table class="tabla"><thead><tr><th>Cliente</th><th>Zona</th><th>Trabajo</th><th>Fecha</th><th>Resultado</th></tr></thead><tbody>
        ${Q.visitas.map((v) => `<tr><td>${esc(nom(v.ID_CLIENTE))}</td><td>${esc(zon(v.ID_CLIENTE))}</td><td>${esc(NOMBRE_TIPO[v.tipo] || v.tipo)}</td><td>${esc(txtFecha(v.F_EJEC))}</td><td>${esc({ HECHO: 'Hecho', NO_HECHO: 'No se pudo', NO_ESTABA: 'No estaba' }[v.ESTADO] || v.ESTADO)}${v.RESULTADO ? ' · ' + esc(v.RESULTADO) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="sub">Ninguno.</p>'}`;
    const csv = [['Tipo', 'Cliente', 'Zona', 'Detalle', 'Estado', 'Fecha']].concat(
      Q.derivadas.concat(Q.abiertas, Q.resueltas).map((q) => ['Queja: ' + (NOMBRE_CAT[q.CATEGORIA] || q.CATEGORIA), nom(q.ID_CLIENTE), zon(q.ID_CLIENTE), q.SOLUCION || q.DESCRIPCION || '', q.ESTADO, txtFecha(q.F_CIERRE || q.F_APERTURA)]),
      Q.visitas.map((v) => [NOMBRE_TIPO[v.tipo] || v.tipo, nom(v.ID_CLIENTE), zon(v.ID_CLIENTE), v.RESULTADO || '', v.ESTADO, txtFecha(v.F_EJEC)]));
    return { html, csv, sub: `Mes ${FR.mes}` };
  },
  correcciones(hoy) {
    // A4: por ahora NO se mandan a la Empresa X; queda listo por si acaso (solo lo nuevo desde el último envío)
    const enviadas = String(D.config.CORRECCIONES_ENVIADAS_HASTA || '').slice(0, 10), desde = FR.todas ? '' : enviadas;
    const L = filtroZona(R.correccionesContacto(D, desde));
    const cab = `<p class="aviso">${ic('info')}<span>Hoy <b>no se mandan</b> a la Empresa X. Si algún día se mandan, use este reporte y luego <b>Marcar como enviadas</b>: la próxima vez saldrá solo lo nuevo.
      ${enviadas ? `<br>Último envío: <b>${esc(txtFecha(enviadas))}</b> · ${FR.todas ? 'mostrando todas' : 'mostrando solo lo nuevo'} <button class="enlace" id="verTodas">${FR.todas ? 'ver solo lo nuevo' : 'ver todas'}</button>` : ''}</span></p>`;
    const html = cab + (L.length ? `<p class="sub">${L.length} cliente(s) con datos corregidos en la app${desde ? ' después del ' + esc(txtFecha(desde)) : ''}.</p>
      <div class="tabla-desliza"><table class="tabla"><thead><tr><th>Cliente</th><th>Zona</th><th>Dato</th><th>Decía</th><th>Ahora</th></tr></thead><tbody>
      ${L.flatMap((x) => x.cambios.map((c, k) => `<tr>${k ? '<td></td><td></td>' : `<td><a href="#/cliente/${esc(x.id)}">${esc(x.nombre)}</a></td><td>${esc(x.zona)}</td>`}<td>${esc(c.campo)}</td><td>${esc(c.antes ? (c.campo.startsWith('Teléfono') ? txtTel(c.antes) : c.antes) : '—')}</td><td>${esc(c.campo === 'Teléfono nuevo' ? txtTel(c.ahora) : c.ahora)}</td></tr>`)).join('')}</tbody></table></div>`
      : `<p class="vacio">${desde ? 'Nada nuevo desde el último envío.' : 'Todavía no hay correcciones.'}</p>`);
    const csv = [['Cliente', 'Zona', 'Dato', 'Decía', 'Ahora', 'Fecha']].concat(L.flatMap((x) => x.cambios.map((c) => [x.nombre, x.zona, c.campo, c.antes, c.ahora, txtFecha(c.fecha)])));
    return { html, csv, sub: 'Correcciones de contacto' + (desde ? ' desde el ' + txtFecha(desde) : ''),
      accion: L.length ? ['check', 'Marcar como enviadas', async (ui) => {
        if (!(await ui.confirmar('La próxima vez el reporte mostrará solo lo corregido después de hoy.', { titulo: 'Marcar como enviadas a la Empresa X', si: 'Marcar' }))) return;
        await ui.encolar('GUARDAR_CONFIG', { valores: { CORRECCIONES_ENVIADAS_HASTA: hoy } });
        D.config.CORRECCIONES_ENVIADAS_HASTA = hoy; FR.todas = false; ui.aviso('Marcadas como enviadas hoy.'); vReporte(ui, 'correcciones');
      }] : null };
  },
};

function tarjetas(l) {
  return `<section class="cifras cuatro">${l.map(([t, v]) => `<div><span>${esc(t)}</span><b>${v}</b></div>`).join('')}</section>`;
}

/** Hoja A4 en una ventana nueva (Imprimir → Guardar como PDF). */
export function imprimir(titulo, sub, html) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)} ${hoyISO()}</title>
    <style>body{font-family:system-ui,sans-serif;color:#0d253d;margin:20px;font-size:12px}h1{font-size:19px;margin:0}h3{font-size:14px;margin:16px 0 6px;color:#0c2447}
    .sub,p.sub{color:#536580;margin:2px 0 10px}a{color:inherit;text-decoration:none}table{width:100%;border-collapse:collapse;margin:4px 0}th,td{border:1px solid #c9d3df;padding:4px 6px;vertical-align:top;text-align:left}
    th{background:#0c2447;color:#fff;font-weight:600}td.num{text-align:right;font-variant-numeric:tabular-nums}td small{display:block;color:#536580}.cifras{display:flex;gap:8px;margin:10px 0}
    .cifras div{flex:1;border:1px solid #c9d3df;border-radius:6px;padding:6px 8px}.cifras span{display:block;color:#536580;font-size:11px}.cifras b{font-size:16px}
    details{margin:6px 0}summary{font-weight:600;font-size:13px;margin:8px 0 4px}.rojo{color:#b42318}.vacio{color:#536580}@page{size:A4;margin:12mm}</style></head><body>
    <h1>D@NDINET · ${esc(titulo)}</h1><p class="sub">${esc(sub || '')} · ${esc(txtFecha(hoyISO()))} · sin DNI</p>${html}
    </body></html>`);
  w.document.close();
  w.document.querySelectorAll('details').forEach((d) => { d.open = true; });
  setTimeout(() => { w.focus(); w.print(); }, 300);
}

/** CSV que Excel abre bien (UTF-8 con BOM, separado por ;). */
export function descargarCSV(nombre, filas) {
  const celda = (v) => {
    let s = String(v === null || v === undefined ? '' : v);
    if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d[\d\s.,]*$/.test(s)) s = "'" + s;   // seguridad: que Excel no lo tome como fórmula
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const blob = new Blob(['﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ============================================================================
// PANEL DE CONTROL
// ============================================================================
const FP = { informe: '', zona: '', servicio: '', estado: '' };
export function vPanel(ui) {
  const hoy = hoyISO(), aps = R.informesAplicados(D);
  if (!aps.length) { ui.vista().innerHTML = `<h2>Panel</h2><p class="aviso">${ic('alerta')}<span>Primero importe el informe de la Empresa X.</span></p>`; return; }
  const P = R.panel(D, D.config, hoy, FP);
  const servicios = [...new Set(Object.values(D.lineas).flat().map((l) => l.SERVICIO).filter(Boolean))].sort();
  const sel = (k, opciones, todos) => `<label>${{ informe: 'Informe', zona: 'Zona', servicio: 'Servicio', estado: 'Estado' }[k]}<select data-p="${k}">${todos ? `<option value="">${todos}</option>` : ''}${opciones.map(([v, t]) => `<option value="${esc(v)}" ${FP[k] === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const maxZ = Math.max(1, ...P.series.porZona.map((z) => z.deuda)), maxM = Math.max(1, ...P.series.porMes.map((m) => m.deuda)), maxD = Math.max(1, ...P.series.porDia.map((x) => x.enviados));
  const totalE = Math.max(1, P.series.porEstado.reduce((s, x) => s + x.clientes, 0));
  const ef = P.series.efectividad, hayEf = ef.some((x) => x.pct !== null);
  ui.vista().innerHTML = `<div class="titulo-fila"><h2>Panel de control</h2>${ayuda('panel')}</div>
    <div class="filtros-envio filtros-panel">${sel('informe', aps.slice().reverse().map((i) => [i.ID_INFORME, i.PERIODO]), '')}${sel('zona', zonas().map((z) => [z, z]), 'Todas')}
      ${sel('servicio', servicios.map((s) => [s, s]), 'Todos')}${sel('estado', R.ESTADOS.map((e) => [e, e]), 'Todos')}</div>
    <section class="heroe"><span>Deuda según el informe ${esc(P.informe.PERIODO)}</span><b>${soles(P.deuda)}</b>
      <small>${cifra(P.conDeuda)} cliente(s) con deuda · ${cifra(P.paraCorte)} para corte${P.recuperado !== null ? ` · recuperado frente a ${esc(P.anterior.PERIODO)}: <strong>${soles(P.recuperado)}</strong>` : ''}</small></section>
    <section class="kpis">
      ${kpi('Avance de avisos', `${P.avance.pct} %`, `${P.avance.avisados} de ${P.avance.deben} avisados en el ciclo`, P.avance.pct)}
      ${kpi('Enviados hoy', `${P.hoy.enviados}`, `límite ${P.hoy.limite} por celular · ${P.hoy.sinWa} sin WhatsApp · ${P.hoy.fallidos} fallidos`)}
      ${kpi('Pendientes', `${P.quejas.abiertas}`, `${P.quejas.alta} urgentes${P.quejas.diasSolucion !== null ? ` · se resuelven en ${P.quejas.diasSolucion} día(s)` : ''}`)}
      ${kpi('Visitas', `${P.ordenes.pendientes} por hacer`, `${P.ordenes.hechas} hechas · ${P.ordenes.cortes} cortes · ${P.ordenes.reconexiones} reconexiones`)}
      ${kpi('Con WhatsApp', `${P.calidad.conWa} %`, 'de los clientes con deuda', P.calidad.conWa)}
      ${kpi('Con ubicación', `${P.calidad.conGps} %`, `${P.calidad.corregidos} con datos corregidos 🔒`, P.calidad.conGps)}
    </section>

    ${grafico('Clientes por estado', `<div class="apilada" role="img" aria-label="Clientes por estado">${P.series.porEstado.map((x, k) => x.clientes ? `<span class="seg sec-${k + 1}" style="flex:${x.clientes}" tabindex="0" data-tip="${esc(x.estado)}|${x.clientes} cliente(s) · ${soles(x.deuda)}"></span>` : '').join('')}</div>
      <ul class="leyenda-g">${P.series.porEstado.map((x, k) => `<li><i class="sec-${k + 1}"></i>${esc(x.estado)} <b>${x.clientes}</b> <small>${Math.round(x.clientes / totalE * 100)} %</small></li>`).join('')}</ul>`,
      [['Estado', 'Clientes', 'Deuda'], ...P.series.porEstado.map((x) => [x.estado, x.clientes, soles(x.deuda)])])}

    ${grafico('Deuda por zona', `<div class="barras-h">${P.series.porZona.map((z) => `<a class="bh" href="#/clientes/z:${encodeURIComponent(z.zona)}" data-tip="${esc(z.zona)}|${soles(z.deuda)} · ${z.clientes} cliente(s) · ${z.morosidad} % de la zona con deuda">
        <span class="et">${esc(z.zona)}</span><span class="pista"><i style="width:${Math.max(2, z.deuda / maxZ * 100)}%"></i></span><span class="val">${solesC(z.deuda)}</span></a>`).join('')}</div>`,
      [['Zona', 'Deuda', 'Clientes', '% con deuda'], ...P.series.porZona.map((z) => [z.zona, soles(z.deuda), z.clientes, z.morosidad + ' %'])])}

    ${grafico('Deuda por mes (informes)', P.series.porMes.length < 2 ? `<p class="sub">${ic('reloj')} Un solo informe (${esc(P.series.porMes[0].periodo)}: ${soles(P.series.porMes[0].deuda)}). La tendencia aparece desde el próximo mes.</p>`
      : columnas(P.series.porMes.map((m) => [m.periodo, m.deuda, `${soles(m.deuda)} · ${m.clientes} cliente(s)`]), maxM, (v) => solesC(v)),
      [['Informe', 'Deuda', 'Clientes'], ...P.series.porMes.map((m) => [m.periodo, soles(m.deuda), m.clientes])])}

    ${grafico('Mensajes enviados (14 días)', columnas(P.series.porDia.map((x) => [x.dia.slice(8) + '/' + x.dia.slice(5, 7), x.enviados, `${x.enviados} enviado(s) el ${txtFecha(x.dia)}`]), maxD, (v) => String(v), true),
      [['Día', 'Enviados'], ...P.series.porDia.map((x) => [txtFecha(x.dia), x.enviados])])}

    ${grafico('Efectividad de los avisos', hayEf ? `<div class="barras-h">${ef.map((x) => `<div class="bh" data-tip="${x.nivel}.º aviso|${x.pct === null ? 'sin datos' : `${x.mejoraron} de ${x.avisados} pagaron o bajaron su deuda`}">
        <span class="et">${x.nivel}.º aviso</span><span class="pista"><i style="width:${x.pct || 0}%"></i></span><span class="val">${x.pct === null ? '—' : x.pct + ' %'}</span></div>`).join('')}</div>`
      : `<p class="sub">${ic('reloj')} Se calcula comparando un informe con el siguiente: aparece desde el próximo mes.</p>`,
      [['Nivel', 'Avisados', 'Pagaron o bajaron', '%'], ...ef.map((x) => [x.nivel + '.º', x.avisados, x.mejoraron, x.pct === null ? '—' : x.pct + ' %'])])}`;
  ui.vista().querySelectorAll('[data-p]').forEach((el) => { el.onchange = () => { FP[el.dataset.p] = el.value; vPanel(ui); }; });
  activarTooltips(ui.vista());
}

function kpi(t, v, sub, pct) {
  return `<div class="kpi-p"><span>${esc(t)}</span><b>${esc(v)}</b>${pct !== undefined ? `<span class="medidor"><i style="width:${Math.min(100, pct)}%"></i></span>` : ''}<small>${esc(sub)}</small></div>`;
}
function grafico(titulo, cuerpo, tabla) {
  return `<section class="grafico"><h3>${esc(titulo)}</h3>${cuerpo}
    <details class="ver-tabla"><summary>Ver tabla</summary><table class="tabla"><thead><tr>${tabla[0].map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${tabla.slice(1).map((f) => `<tr>${f.map((c, i) => `<td class="${i ? 'num' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></details></section>`;
}
/** Columnas (un solo color): etiqueta solo en la más alta y la última, el resto en el globo. */
function columnas(datos, max, fmt, pocas) {
  const iMax = datos.reduce((b, d, i) => (d[1] > datos[b][1] ? i : b), 0);
  return `<div class="columnas ${pocas ? 'muchas' : ''}">${datos.map(([et, v, tip], i) => `<div class="col" tabindex="0" data-tip="${esc(et)}|${esc(tip)}">
    <span class="v">${(i === iMax || i === datos.length - 1) && v ? esc(fmt(v)) : ''}</span><span class="pista-v"><i style="height:${v ? Math.max(3, v / max * 100) : 0}%"></i></span><span class="et">${esc(et)}</span></div>`).join('')}</div>`;
}
/** Globo con el detalle al pasar el dedo o el mouse (también con el teclado). */
function activarTooltips(raiz) {
  let tip = document.getElementById('tipG');
  if (!tip) { tip = document.createElement('div'); tip.id = 'tipG'; tip.className = 'tip-g'; tip.hidden = true; document.body.appendChild(tip); }
  const mostrar = (el) => {
    const [a, b] = String(el.dataset.tip).split('|');
    tip.textContent = '';
    const fuerte = document.createElement('b'); fuerte.textContent = b || ''; const sub = document.createElement('small'); sub.textContent = a || '';
    tip.append(fuerte, sub); tip.hidden = false;
    const r = el.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2)) + 'px';
    tip.style.top = (r.top + window.scrollY - tip.offsetHeight - 8) + 'px';
  };
  raiz.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('pointerenter', () => mostrar(el));
    el.addEventListener('focus', () => mostrar(el));
    el.addEventListener('pointerleave', () => { tip.hidden = true; });
    el.addEventListener('blur', () => { tip.hidden = true; });
  });
  window.addEventListener('hashchange', () => { tip.hidden = true; }, { once: true });
}
