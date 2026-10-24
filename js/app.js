// APP D@NDINET MENSAJES — pantallas y navegación (#/ruta)
// Fase 1: base técnica (inicio de sesión, sincronización sin señal, roles, clientes,
// órdenes del técnico, configuración de mensajes). Los módulos de las fases 2 a 6 aparecen
// como "Próximamente" para que se vea el recorrido completo de la app.
import { CONFIG } from './config.js';
import { kvGet, kvSet, colaTodos, borrarTodo } from './db.js';
import { iniciarGoogle, dibujarBoton, leerToken, cerrarSesionGoogle, googleDisponible } from './auth.js';
import { llamar } from './api.js';
import { encolar, sincronizarTodo, iniciarAutoSync, alCambiar, pendientesDeEnvio } from './sync.js';
import { D, cargarDatosLocales, esc, soles, txtFecha, hoyISO, txtTel, buscarClientes, claseEstado, telefonosDe, gestionesDe, enNoEnviar, alertasDe, visitasDe } from './datos.js';
import { ic, observarIconos } from './iconos.js';
import { vImportar } from './importar.js';
import { vEnvios as vEnviosApp } from './envios.js';
import { vCliente as vFicha, vSeguimiento, vPendientes, recordarLista, quejaAbierta } from './ficha.js';
import { vOrdenes, vOrden, vRuta, vEquipo } from './ordenes.js';
import { vMapaClientes } from './mapaclientes.js';
import { vReportes, vReporte, vPanel } from './vistareportes.js';
import { vParalelo, vCuadre } from './paralelo.js';
import { candidatosTanda } from './avisos.js';
import { ayuda, iniciarAyuda } from './ayuda.js';

const $ = (s, el = document) => el.querySelector(s);
const vista = () => $('#vista');
let PERFIL = null;
let sincronizando = false;
const esTecnico = () => PERFIL && PERFIL.rol === 'TECNICO';

// ============================================================================
// ARRANQUE
// ============================================================================
async function arrancar() {
  observarIconos();
  iniciarAyuda();
  registrarServiceWorker();
  PERFIL = await kvGet('perfil');
  const hayDatos = await cargarDatosLocales();
  alCambiar(alEventoSync);
  esperarGoogle();
  if (PERFIL && hayDatos) {
    mostrarApp();
    iniciarAutoSync();
    if (navigator.onLine) sincronizarTodo().catch(manejarErrorSync);
  } else {
    mostrarLogin();
  }
}

/** Registra el service worker y avisa cuando llega una versión nueva. */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const habiaControl = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaControl) return;
    $('#actualizar').hidden = false;
    $('#btnActualizar').onclick = () => location.reload();
  });
}

/** El script de Google carga aparte (y no existe sin señal). */
function esperarGoogle(intentos = 0) {
  if (googleDisponible()) { iniciarGoogle(alIniciarSesion); if (!PERFIL) dibujarBoton($('#btnGoogle')); return; }
  if (intentos < 40) setTimeout(() => esperarGoogle(intentos + 1), 250);
  else if (!PERFIL && $('#btnGoogle')) dibujarBoton($('#btnGoogle'));
}

async function alIniciarSesion(token) {
  if (PERFIL) return;                       // renovación silenciosa del token
  const p = leerToken(token);
  $('#loginEstado').textContent = 'Verificando ' + (p ? p.email : '') + '…';
  try {
    PERFIL = await llamar('perfil');
    await kvSet('perfil', PERFIL);
    $('#loginEstado').textContent = 'Descargando datos…';
    await sincronizarTodo();
    mostrarApp();
    iniciarAutoSync();
  } catch (e) {
    PERFIL = null;
    $('#loginEstado').innerHTML = `<span class="error">${esc(e.message)}</span>`;
  }
}

function mostrarLogin() {
  $('#login').hidden = false;
  $('#app').hidden = true;
}

/** Barra inferior según el rol (docs/ESPECIFICACION.md, sección 8). */
function pintarNavegacion() {
  // técnico: lo de campo a un toque (sus zonas: avisos, clientes, órdenes y mapa); "Más" está en el inicio
  const items = esTecnico()
    ? [['inicio', 'inicio', 'Inicio'], ['clientes', 'buscar', 'Clientes'], ['envios', 'chat', 'Envíos'], ['ordenes', 'documento', 'Órdenes'], ['mapa', 'mapa', 'Mapa']]
    : [['inicio', 'inicio', 'Inicio'], ['clientes', 'buscar', 'Clientes'], ['envios', 'chat', 'Envíos'], ['mapa', 'mapa', 'Mapa'], ['mas', 'mas', 'Más']];
  $('nav.inferior').innerHTML = items.map(([r, i, t]) => `<a href="#/${r}" data-r="${r}">${ic(i)}${t}${r === 'mas' ? '<span id="insigniaCola" class="insignia" hidden></span>' : ''}</a>`).join('');
}

function mostrarApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#usuario').innerHTML = `<span>${esc(PERFIL.nombre)}</span><span class="avatar" aria-hidden="true">${esc(iniciales(PERFIL.nombre))}</span>`;
  pintarNavegacion();
  window.addEventListener('hashchange', enrutar);
  enrutar();
  pintarEstado();
}

const iniciales = (n) => String(n || '?').replace(/[()]/g, '').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

// ============================================================================
// LÍNEA DE ESTADO (en línea / sin señal / por enviar)
// ============================================================================
async function pintarEstado() {
  const pend = (await pendientesDeEnvio()).length;
  const ult = await kvGet('ultimaSync');
  const el = $('#estado');
  const hora = ult ? (ult.slice(0, 10) === hoyISO() ? ult.slice(11, 16) : txtFecha(ult)) : '—';
  el.className = 'estado ' + (navigator.onLine ? 'en-linea' : 'sin-senal');
  el.innerHTML = `<span class="grupo"><span class="punto"></span>${navigator.onLine ? 'En línea' : 'Sin señal'}</span>` +
    (sincronizando ? `<span class="grupo">${ic('sync', 'girando')}Sincronizando</span>` : '') +
    (pend ? `<span class="pend">${pend} por enviar</span>` : '') +
    `<span class="tenue">Act. ${esc(hora)}</span>`;
  const ins = $('#insigniaCola');
  if (ins) { ins.hidden = !pend; ins.textContent = pend > 99 ? '99+' : pend; }
}

function alEventoSync(info) {
  if (info.tipo === 'libro') aviso('El sistema cambió de libro: se borraron los datos anteriores de este celular.');
  if (info.tipo === 'inicio') sincronizando = true;
  if (info.tipo === 'fin') { sincronizando = false; if (info.ok) refrescarSiCorresponde(); else manejarErrorSync(info.error); }
  pintarEstado();
}

function manejarErrorSync(e) {
  if (e && e.codigo === 'AUTH') aviso('Su sesión venció. Toque "Sincronizar" para renovarla (o vuelva a iniciar sesión).', 'error');
  else if (e && e.codigo !== 'RED') aviso(e.message, 'error');
}

function refrescarSiCorresponde() {
  // no interrumpir un formulario, la revisión de un informe ni la ficha / búsqueda que se está usando
  if (!/^#\/(configuracion|importar|cliente|clientes|envios|mapa|ruta|equipo|reporte|panel|cuadre)/.test(location.hash || '#/') && !$('#modal')) enrutar();
}

let _avisoT = null;
function aviso(msg, tipo = 'ok') {
  const el = $('#toast');
  el.textContent = msg; el.className = 'toast ' + tipo; el.hidden = false;
  clearTimeout(_avisoT); _avisoT = setTimeout(() => { el.hidden = true; }, 4500);
}

// ============================================================================
// RUTAS
// ============================================================================
function enrutar() {
  const [rutaPedida, arg] = (location.hash.replace(/^#\//, '') || 'inicio').split('/');
  // el técnico no importa informes ni cambia la configuración o el equipo (el servidor también lo impide)
  const SOLO_ADMIN = ['configuracion', 'importar', 'equipo', 'proximamente', 'panel', 'paralelo', 'cuadre'];
  const ruta = esTecnico() && SOLO_ADMIN.includes(rutaPedida) ? 'inicio' : rutaPedida;
  document.querySelectorAll('nav.inferior a').forEach((a) => a.classList.toggle('activo', a.dataset.r === ruta || (ruta === 'orden' && a.dataset.r === 'ordenes') || (ruta === 'cliente' && a.dataset.r === 'clientes')));
  const u = fichaUI();
  const v = { inicio: vInicio, clientes: vClientes, cliente: (id) => vFicha(id, u), seguimiento: () => vSeguimiento(u), pendientes: () => vPendientes(u), envios: (t) => vEnviosApp(u, t),
    mapa: () => vMapaClientes(u), ruta: (id) => vRuta(u, id), reportes: () => vReportes(u), reporte: (t) => vReporte(u, t), panel: () => vPanel(u), paralelo: () => vParalelo(u), cuadre: () => vCuadre(u), ordenes: () => vOrdenes(u), orden: (id) => vOrden(id, u), equipo: () => vEquipo(u),
    mas: vMas, cola: vCola, configuracion: vConfiguracion, cuenta: vCuenta, proximamente: vProximamente,
    importar: () => vImportar({ vista, aviso, confirmar, sincronizar: () => sincronizarTodo().catch(manejarErrorSync) }) }[ruta] || vInicio;
  window.scrollTo(0, 0);
  cerrarModal();
  Promise.resolve(v(decodeURIComponent(arg || ''))).catch((e) => { vista().innerHTML = `<p class="error">${esc(e.message)}</p>`; });
}

const fila = (href, icono, etq, sub = '', extra = '') =>
  `<li><a href="${href}">${ic(icono)}<span class="etq">${etq}${sub ? `<small>${sub}</small>` : ''}</span>${extra}${ic('flecha', 'fin')}</a></li>`;

/** Módulos que llegan en las fases siguientes (para mostrar el recorrido completo). */
const PROXIMOS = {
  importar: ['Importar informe de la Empresa X', 2, 'Subir el Excel mensual, ver qué cambia y aplicarlo sin perder lo corregido.'],
  envios: ['Envíos por WhatsApp', 4, 'Tandas semiautomáticas: la app prepara cada mensaje y abre WhatsApp; usted pulsa Enviar.'],
  confirmaciones: ['Confirmaciones de pago', 4, 'Agradecer a quienes salieron del informe; cada envío lo decide usted.'],
  seguimiento: ['Seguimiento', 3, 'Promesas de pago vencidas y clientes avisados sin respuesta.'],
  quejas: ['Quejas y reportes', 5, 'Registrar quejas y convertirlas en órdenes para el técnico.'],
  mapa: ['Mapa y rutas', 5, 'Clientes en el mapa por estado y ruta ordenada para el técnico.'],
  reportes: ['Reportes', 6, 'Cobranza, técnico, datos para optimizar y comparación entre informes.'],
  dashboard: ['Dashboard', 6, 'Deuda por mes y zona, avance de avisos, efectividad.'],
};

// ---- INICIO: tareas por categoría, "qué hacer ahora" y estado de la deuda ---------------
const ESTADOS_DEUDA = ['Por vencer', 'Moroso 1 mes', 'Moroso 2 meses', 'Moroso 3+ meses', 'Para corte'];
const enDeuda = (id) => (D.porId[id] || {}).ESTADO_INFORME !== 'AL_DIA_SALIO' && Number((D.estados[id] || {}).MONTO) > 0;

/** Cifras del día para el inicio (el técnico ya recibe solo lo de sus zonas). */
function resumenDelDia() {
  const hoy = hoyISO(), yo = PERFIL.email;
  const pendientes = D.quejas.filter(quejaAbierta);
  const visitas = D.ordenesDet.filter((d) => d.ESTADO === 'PENDIENTE' && ['PENDIENTE', 'EN_CURSO'].includes((D.ordenes.find((o) => o.ID_OT === d.ID_OT) || {}).ESTADO)).length;
  let elegibles = 0;
  try { if (D.informes.some((i) => i.ESTADO === 'APLICADO')) elegibles = candidatosTanda(D, D.config, hoy, {}).elegibles.length; } catch (e) { /* sin plantillas aún */ }
  const enviados = Object.values(D.mensajes).flat().filter((m) => m.ESTADO === 'ENVIADO' && (m.USUARIO === 'yo' || m.USUARIO === yo) && String(m.F_RESULTADO).slice(0, 10) === hoy).length;
  const limite = Number(D.config.LIMITE_DIA || 30);
  const numsPorVer = new Set(), sinWa = [];
  D.clientes.forEach((c) => {
    if (!enDeuda(c.ID_CLIENTE)) return;
    const T = telefonosDe(c.ID_CLIENTE);
    T.porVer.forEach((t) => numsPorVer.add(t.NUMERO));
    if (T.resumen === 'SIN_WHATSAPP' || T.resumen === 'SIN_TELEFONO') sinWa.push(c.ID_CLIENTE);
  });
  const promesas = D.clientes.filter((c) => { const g = gestionesDe(c.ID_CLIENTE)[0]; return g && g.TIPO === 'PROMESA_PAGO' && String(g.FECHA_COMPROMISO).slice(0, 10) < hoy && enDeuda(c.ID_CLIENTE); }).length;
  return { pendientes, alta: pendientes.filter((q) => q.PRIORIDAD === 'ALTA').length, visitas, elegibles, enviados, limite, restan: Math.max(0, limite - enviados),
    porVerificar: numsPorVer.size, sinWa: sinWa.length, promesas };
}

async function vInicio() {
  const tec = esTecnico(), R = resumenDelDia(), pend = (await pendientesDeEnvio()).length;
  const h = new Date().getHours(), saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const conDeuda = D.clientes.filter((c) => enDeuda(c.ID_CLIENTE));
  const total = conDeuda.reduce((s, c) => s + Number(D.estados[c.ID_CLIENTE].MONTO || 0), 0);
  const porEstado = ESTADOS_DEUDA.map((e) => { const l = conDeuda.filter((c) => D.estados[c.ID_CLIENTE].ESTADO === e); return [e, l.length, l.reduce((s, c) => s + Number(D.estados[c.ID_CLIENTE].MONTO || 0), 0)]; });
  const maxN = Math.max(1, ...porEstado.map((x) => x[1]));
  // lo más urgente primero (máximo 4)
  const sugerencias = [
    [R.alta, 'alerta', `Atender ${R.alta} pendiente(s) urgente(s)`, '#/pendientes', 'rojo'],
    [R.visitas, 'ruta', `${R.visitas} visita(s) por hacer`, '#/ruta', ''],
    [R.promesas, 'reloj', `Llamar a ${R.promesas} que no cumplieron su promesa`, '#/seguimiento', ''],
    [Math.min(R.elegibles, R.restan), 'chat', `Enviar ${Math.min(R.elegibles, R.restan)} aviso(s) por WhatsApp`, '#/envios', 'verde'],
    [R.porVerificar, 'check', `Verificar ${R.porVerificar} número(s) de WhatsApp`, '#/envios/verificar', ''],
    [R.sinWa, 'mapa', `${R.sinWa} sin WhatsApp: avisar en persona`, '#/mapa', ''],
  ].filter((x) => x[0] > 0).slice(0, 4);
  const tiles = [
    ['#/envios', 'chat', 'Enviar avisos', R.elegibles ? `${R.enviados}/${R.limite} hoy` : '', ''],
    ['#/clientes', 'buscar', 'Clientes', '', ''],
    ['#/pendientes', 'alerta', 'Pendientes', R.pendientes.length || '', R.alta ? 'rojo' : ''],
    ['#/ordenes', 'documento', tec ? 'Mis órdenes' : 'Órdenes', R.visitas || '', ''],
    ['#/mapa', 'mapa', 'Mapa', R.sinWa ? R.sinWa + ' sin WA' : '', ''],
    ['#/seguimiento', 'reloj', 'Seguimiento', R.promesas || '', R.promesas ? 'rojo' : ''],
    ...(tec ? [] : [['#/importar', 'descargar', 'Importar informe', D.informes.some((i) => i.ESTADO === 'BORRADOR') ? 'en revisión' : '', '']]),
    ['#/mas', 'mas', 'Más', pend || '', pend ? 'rojo' : ''],
  ];
  vista().innerHTML = `
    <div class="saludo fila-ayuda"><div><p class="eyebrow">${esc(txtFecha(hoyISO()))}${tec && PERFIL.zonas && PERFIL.zonas.length ? ' · ' + esc(PERFIL.zonas.join(', ')) : ''}</p>
      <h1>${saludo}, ${esc(String(PERFIL.nombre).split(' ')[0])}</h1></div>${ayuda('inicio')}</div>
    ${D.clientes.length ? '' : `<p class="aviso">${ic('alerta')}<span>${tec ? 'Aún no tiene clientes: pida que le asignen zonas u órdenes.' : 'Todavía no hay clientes: se cargan al importar el informe.'}</span>${tec ? '' : ' <a class="mini" href="#/importar">Importar</a>'}</p>`}
    ${sugerencias.length ? `<section class="ahora"><h3>${ic('consejo')}Qué hacer ahora</h3>${sugerencias.map(([, i, t, href, cl]) =>
      `<a class="sugerencia ${cl}" href="${href}">${ic(i)}<span>${esc(t)}</span>${ic('flecha', 'fin')}</a>`).join('')}</section>`
      : D.clientes.length ? `<section class="ahora ok"><h3>${ic('check')}Todo al día</h3><p class="sub">No hay tareas urgentes.</p></section>` : ''}
    <nav class="mosaico" aria-label="Tareas">${tiles.map(([href, i, t, n, cl]) =>
      `<a class="baldosa" href="${href}">${ic(i)}<span>${esc(t)}</span>${n === '' ? '' : typeof n === 'number' ? `<em class="insignia-b ${cl}">${n}</em>` : `<small class="pie-b">${esc(n)}</small>`}</a>`).join('')}</nav>
    ${conDeuda.length ? `<section class="deuda-estado"><div class="titulo-fila"><h3>Estado de la deuda</h3>${ayuda('deuda')}${tec ? '' : '<a class="mini" href="#/panel">Ver panel</a>'}</div>
      <p class="total-deuda"><b>${soles(total)}</b><small>${conDeuda.length} cliente(s) con deuda${tec ? ' en sus zonas' : ''}</small></p>
      ${porEstado.map(([e, n, m]) => `<a class="barra-estado" href="#/clientes/e:${encodeURIComponent(e)}"><span class="et">${esc(e)}</span>
        <span class="barra"><i class="${claseEstado(e)}" style="width:${Math.max(n ? 4 : 0, Math.round(n / maxN * 100))}%"></i></span><span class="val">${n}<small>${soles(m)}</small></span></a>`).join('')}</section>` : ''}`;
}

/** "Último: 2026-10 (INF-0001)" o "Ninguno todavía". */
function ultimoInforme() {
  const u = D.informes.find((i) => i.ESTADO === 'APLICADO'), b = D.informes.find((i) => i.ESTADO === 'BORRADOR');
  return (u ? `Último: ${u.PERIODO} (${u.ID_INFORME})` : 'Ninguno todavía') + (b ? ' · hay uno en revisión' : '');
}

async function sincronizarManual() {
  if (!navigator.onLine) return aviso('Sin señal: lo que haga queda guardado y se enviará solo.', 'error');
  try { await sincronizarTodo(); aviso('Datos actualizados.'); } catch (e) { manejarErrorSync(e); }
}

function vProximamente(clave) {
  const p = PROXIMOS[clave] || ['Módulo', '-', ''];
  vista().innerHTML = `<section class="form"><h2>${esc(p[0])}</h2>
    <p class="aviso">${ic('reloj')}<span>Llega en la <b>fase ${esc(p[1])}</b> del plan (docs/ESPECIFICACION.md, sección 11).</span></p>
    <p>${esc(p[2])}</p><a class="btn secundario" href="#/inicio">${ic('atras')}Volver</a></section>`;
}

// ---- CLIENTES: buscador con filtros de zona, estado y situación ---------------------------
const FILTROS = [
  ['todos', 'Todas las situaciones', () => true],
  ['sinwa', 'Sin WhatsApp (en persona)', (c) => ['SIN_WHATSAPP', 'SIN_TELEFONO'].includes(telefonosDe(c.ID_CLIENTE).resumen)],
  ['verificar', 'WhatsApp por verificar', (c) => telefonosDe(c.ID_CLIENTE).resumen === 'POR_VERIFICAR'],
  ['pendiente', 'Con pendiente por atender', (c) => D.quejas.some((q) => q.ID_CLIENTE === c.ID_CLIENTE && quejaAbierta(q))],
  ['visita', 'Con visita programada', (c) => visitasDe(c.ID_CLIENTE).length > 0],
  ['gestion', 'Con gestión', (c) => gestionesDe(c.ID_CLIENTE).length > 0],
  ['corregidos', 'Datos corregidos 🔒', (c) => Object.keys(c.corregido || {}).length > 0],
  ['revisar', 'Monto por revisar', (c) => (D.estados[c.ID_CLIENTE] || {}).MONTO_REVISAR === 'REVISAR'],
  ['noenviar', 'NO ENVIAR', (c) => enNoEnviar(c.ID_CLIENTE)],
  ['salieron', 'Salieron del informe (al día)', (c) => c.ESTADO_INFORME === 'AL_DIA_SALIO'],
];
let FILTRO = 'todos', TEXTO = '', FZONA = '', FESTADO = '';
const WA_IC = { CON_WHATSAPP: ['wa-si', 'con WhatsApp'], POR_VERIFICAR: ['wa-ver', 'WhatsApp por verificar'], SIN_WHATSAPP: ['wa-no', 'sin WhatsApp'], SIN_TELEFONO: ['wa-sin', 'sin teléfono'] };

function vClientes(arg) {
  // atajos desde el inicio: e:Para corte · z:KIATARI · f:sinwa
  if (arg) { const [k, v] = [arg.slice(0, 2), arg.slice(2)]; if (k === 'e:') { FESTADO = v; FZONA = ''; FILTRO = 'todos'; } if (k === 'z:') FZONA = v; if (k === 'f:') FILTRO = v; TEXTO = ''; }
  const zonas = [...new Set(D.clientes.map((c) => c.ZONA).filter(Boolean))].sort();
  vista().innerHTML = `<div class="titulo-fila"><h2>Clientes</h2>${ayuda('clientes')}</div>
    <input id="q" class="buscador" type="search" placeholder="Nombre, teléfono, zona o referencia" autocomplete="off" value="${esc(TEXTO)}">
    <div class="filtros-envio">
      <label>Zona<select id="fZ"><option value="">Todas</option>${zonas.map((z) => `<option ${FZONA === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
      <label>Estado<select id="fE"><option value="">Todos</option><option value="deuda" ${FESTADO === 'deuda' ? 'selected' : ''}>Con deuda</option>${ESTADOS_DEUDA.map((e) => `<option ${FESTADO === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
      <label>Situación<select id="fS">${FILTROS.map(([k, t]) => `<option value="${k}" ${FILTRO === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <p class="sub fila-cuenta"><span id="cuenta"></span><button class="enlace" id="limpiar" hidden>Quitar filtros</button></p><ul id="res" class="lista"></ul>`;
  const pintar = () => {
    TEXTO = $('#q').value;
    const f = (FILTROS.find(([k]) => k === FILTRO) || FILTROS[0])[2];
    const todos = buscarClientes(TEXTO, 100000).filter((c) => {
      if (FZONA && c.ZONA !== FZONA) return false;
      const e = D.estados[c.ID_CLIENTE] || {};
      if (FESTADO === 'deuda' && !enDeuda(c.ID_CLIENTE)) return false;
      if (FESTADO && FESTADO !== 'deuda' && (e.ESTADO !== FESTADO || !enDeuda(c.ID_CLIENTE))) return false;
      return f(c);
    });
    recordarLista(todos.map((c) => c.ID_CLIENTE));
    const filtrado = FZONA || FESTADO || FILTRO !== 'todos';
    $('#limpiar').hidden = !filtrado;
    $('#cuenta').textContent = `${todos.length} cliente(s)` + (todos.length > 150 ? ' · se muestran 150' : '');
    $('#res').innerHTML = todos.slice(0, 150).map((c) => {
      const e = D.estados[c.ID_CLIENTE] || {}, [wc, wt] = WA_IC[telefonosDe(c.ID_CLIENTE).resumen] || WA_IC.SIN_TELEFONO;
      const al = alertasDe(c.ID_CLIENTE).filter((a) => ['corte', 'pendiente', 'visita', 'noenviar'].includes(a.k) && !(a.k === 'corte' && e.ESTADO === 'Para corte'));
      return `<li><a href="#/cliente/${esc(c.ID_CLIENTE)}">
        <div><b>${esc(c.NOMBRES || c.ID_CLIENTE)}${Object.keys(c.corregido || {}).length ? ' 🔒' : ''}</b>
          <small><span class="wa ${wc}" title="${wt}" aria-label="${wt}">${ic('chat')}</span>${esc(c.ZONA || '-')}${al.map((a) => ` <span class="chip ${a.cls}">${esc(a.txt)}</span>`).join('')}</small></div>
        <div class="der">${e.ESTADO ? `<span class="chip ${claseEstado(e.ESTADO)}">${esc(e.ESTADO)}</span>` : ''}<small>${Number(e.MONTO) > 0 ? soles(e.MONTO) : ''}</small></div>
      </a></li>`;
    }).join('') || `<li class="vacio">${D.clientes.length ? 'Sin resultados' : esTecnico() ? 'Aún no tiene clientes asignados.' : 'Aún no hay clientes (se cargan con el primer informe).'}</li>`;
  };
  $('#q').addEventListener('input', pintar);
  $('#fZ').onchange = (e) => { FZONA = e.target.value; pintar(); };
  $('#fE').onchange = (e) => { FESTADO = e.target.value; pintar(); };
  $('#fS').onchange = (e) => { FILTRO = e.target.value; pintar(); };
  $('#limpiar').onclick = () => { FZONA = ''; FESTADO = ''; FILTRO = 'todos'; vClientes(); };
  pintar();
}

/** Lo que la ficha necesita de la app (diálogos, avisos, cola). */
const fichaUI = () => ({ vista, aviso, confirmar, modal, cerrarModal, encolar, esTecnico, perfil: () => PERFIL, sincronizar: () => sincronizarTodo().catch(manejarErrorSync) });

// ---- MÁS: todo ordenado por categoría ------------------------------------------------------
async function vMas() {
  const pend = (await pendientesDeEnvio()).length, tec = esTecnico();
  const grupo = (titulo, items) => `<h3>${titulo}</h3><nav class="mosaico chico">${items.map(([href, i, t, n, cl]) =>
    `<a class="baldosa ${href ? '' : 'apagada'}" ${href ? `href="${href}"` : 'aria-disabled="true"'}>${ic(i)}<span>${esc(t)}</span>${n ? `<em class="insignia-b ${cl || ''}">${esc(n)}</em>` : ''}</a>`).join('')}</nav>`;
  vista().innerHTML = `<h2>Más opciones</h2>
    ${grupo('Trabajo', [['#/pendientes', 'alerta', 'Pendientes', D.quejas.filter(quejaAbierta).length || '', 'rojo'], ['#/seguimiento', 'reloj', 'Seguimiento'],
      ['#/ordenes', 'documento', 'Órdenes'], ['#/ruta', 'ruta', 'Ruta'], ['#/mapa', 'mapa', 'Mapa'], ...(tec ? [['#/reportes', 'documento', 'Reportes']] : [])])}
    ${tec ? '' : grupo('Informes y reportes', [['#/panel', 'grafico', 'Panel de control'], ['#/reportes', 'documento', 'Reportes'], ['#/importar', 'descargar', 'Importar informe'],
      ['#/paralelo', 'check', 'Marcha en paralelo'], ['#/cuadre', 'sync', 'Cuadre con la macro']])}
    ${grupo('Ajustes', [...(tec ? [] : [['#/equipo', 'equipo', 'Equipo y zonas'], ['#/configuracion', 'ajustes', 'Mensajes y límites']]),
      ['#/cola', 'cola', 'Cola de envío', pend || '', 'rojo'], ['#/cuenta', 'usuario', 'Mi cuenta']])}`;
}

// ---- COLA DE ENVÍO ---------------------------------------------------------------------
async function vCola() {
  const ops = (await colaTodos()).sort((a, b) => String(b.fDispositivo).localeCompare(String(a.fDispositivo)));
  const etiqueta = { pendiente: ['Por enviar', 'e-porvencer'], enviado: ['Recibido, en proceso', 'e-porvencer'], error: ['Error al enviar', 'e-moroso'],
    ok: ['Procesado', 'e-activo'], rechazado: ['Rechazado', 'e-moroso'] };
  vista().innerHTML = `<h2>Cola de envío</h2>
    <p class="sub">Todo lo que hace en el celular pasa por aquí. Sin señal queda "Por enviar" y sale solo al volver la conexión.</p>
    <ul class="lista">${ops.map((o) => { const [t, cl] = etiqueta[o.estadoLocal] || ['-', 'e-pend'];
      return `<li><div><b>${esc(o.tipo)}</b><small>${esc(txtFecha(o.fDispositivo))} ${esc(String(o.fDispositivo).slice(11, 16))}${o.resultado && o.resultado.mensaje ? ' · ' + esc(o.resultado.mensaje) : ''}</small></div>
        <div class="der"><span class="chip ${cl}">${t}</span></div></li>`; }).join('') || '<li class="vacio">No hay operaciones.</li>'}</ul>
    <button class="btn" id="btnSync">${ic('sync')}Enviar y sincronizar</button>`;
  $('#btnSync').onclick = async () => { await sincronizarManual(); vCola(); };
}

// ---- CONFIGURACIÓN DE MENSAJES (solo ADMIN; el servidor vuelve a comprobarlo) -----------
const GRUPOS_CONFIG = [
  ['Datos del mensaje', [['EMPRESA', 'Nombre con el que se presenta ({Empresa})'], ['CEL_CONSTANCIA', 'Celular para constancias ({CelConstancia})'],
    ['METODOS_PAGO', 'Formas de pago ({MetodosPago})', 'area'], ['SALUDOS', 'Saludos (separados por |)'], ['DESPEDIDAS', 'Despedidas (separadas por |)'],
    ['SERVICIO_TV', 'Texto para TV CABLE'], ['SERVICIO_DUO', 'Texto para DUO']]],
  ['Reglas de deuda y avisos', [['DIA_ULTIMO_PAGO', 'Último día de pago del mes', 'num'], ['DIAS_PLAZO', 'Días de plazo en el aviso', 'num'],
    ['MESES_PARA_CORTE', 'Meses de deuda para "Para corte"', 'num'], ['DIAS_NO_REENVIAR', 'Días mínimos entre avisos', 'num'],
    ['MAX_AVISOS', 'Avisos por ciclo', 'num'], ['DIAS_CICLO', 'Días del ciclo de avisos', 'num'], ['DIAS_SEGUIMIENTO', 'Días para seguimiento', 'num']]],
  ['Límites de envío', [['LIMITE_DIA', 'Mensajes por día y por usuario', 'num'], ['HORA_INICIO', 'Desde la hora (hh:mm)'], ['HORA_FIN', 'Hasta la hora (hh:mm)'],
    ['DIAS_SIN_ENVIO', 'Días sin envío']]],
  ['Opciones (SI / NO)', [['EXIGIR_VERIFICACION', 'Solo a teléfonos con WhatsApp comprobado', 'sino'], ['ENVIAR_A_TODOS_LOS_TELEFONOS', 'Enviar a todos los teléfonos del cliente', 'sino'],
    ['PERMITIR_NUMERO_COMPARTIDO', 'Número compartido: avisar a ambos', 'sino'], ['PRIORIZAR_GUARDADOS', 'Primero los contactos guardados', 'sino'],
    ['CORTE_REQUIERE_AVISO', 'Cortar solo a quien se avisó', 'sino'], ['CORTE_RESPETA_PLAZO', 'Respetar el plazo del aviso', 'sino'],
    ['REPORTE_CON_UBICACION', 'Reportes con dirección y teléfonos', 'sino']]],
];

function vConfiguracion() {
  const v = (k) => String(D.config[k] === undefined ? '' : D.config[k]).replace(/\\n/g, '\n');
  const campo = ([k, etq, tipo]) => tipo === 'area'
    ? `<label>${esc(etq)}<textarea data-k="${k}" rows="5">${esc(v(k))}</textarea></label>`
    : tipo === 'sino'
      ? `<label>${esc(etq)}<select data-k="${k}"><option ${/^S/i.test(v(k)) ? 'selected' : ''}>SI</option><option ${/^N/i.test(v(k)) ? 'selected' : ''}>NO</option></select></label>`
      : `<label>${esc(etq)}<input data-k="${k}" value="${esc(v(k))}" ${tipo === 'num' ? 'inputmode="numeric"' : ''} autocomplete="off"></label>`;
  vista().innerHTML = `<section class="form"><h2>Configuración de mensajes</h2>
    <p class="sub">Los mismos ajustes de la hoja CONFIG de la macro. Se aplican al sincronizar.</p>
    ${GRUPOS_CONFIG.map(([t, campos]) => `<h3>${esc(t)}</h3>${campos.map(campo).join('')}`).join('')}
    <button class="btn grande verde" id="guardar">${ic('check')}GUARDAR</button></section>`;
  $('#guardar').onclick = async () => {
    const valores = {};
    vista().querySelectorAll('[data-k]').forEach((el) => {
      const nuevo = el.value.replace(/\r?\n/g, '\\n').trim();
      if (nuevo !== String(D.config[el.dataset.k] === undefined ? '' : D.config[el.dataset.k]).trim()) valores[el.dataset.k] = nuevo;
    });
    const malos = Object.keys(valores).filter((k) => GRUPOS_CONFIG.some(([, c]) => c.some(([kk, , t]) => kk === k && t === 'num')) && !/^\d+$/.test(valores[k]));
    if (malos.length) return aviso('Debe ser un número entero: ' + malos.join(', '), 'error');
    if (['HORA_INICIO', 'HORA_FIN'].some((k) => k in valores && !/^\d{1,2}:\d{2}$/.test(valores[k]))) return aviso('Las horas van como hh:mm (ej. 09:00).', 'error');
    if (!Object.keys(valores).length) return aviso('No hay cambios.');
    await encolar('GUARDAR_CONFIG', { valores });
    Object.assign(D.config, valores);
    aviso(navigator.onLine ? 'Configuración enviada.' : 'Guardada: se enviará al volver la señal.');
  };
}

// ---- MI CUENTA ---------------------------------------------------------------------------
async function vCuenta() {
  const pend = (await pendientesDeEnvio()).length;
  vista().innerHTML = `<section class="form"><h2>Mi cuenta</h2>
    <div class="cuenta-perfil"><span class="avatar" aria-hidden="true">${esc(iniciales(PERFIL.nombre))}</span>
      <div><b>${esc(PERFIL.nombre)}</b><small>${esc(PERFIL.email)} · ${esc(PERFIL.rol)}${PERFIL.zonas && PERFIL.zonas.length ? ' · ' + esc(PERFIL.zonas.join(', ')) : ''}</small></div></div>
    <p class="sub">D@ndinet Mensajes ${CONFIG.VERSION}. Datos del ${esc(txtFecha(D.generado))} ${esc(String(D.generado || '').slice(11, 16))}.</p>
    <h3>Apariencia</h3>
    <div class="tema" role="group" aria-label="Tema">${[['auto', 'Automático'], ['dia', 'Día (sol)'], ['noche', 'Noche']].map(([v, t]) =>
      `<button class="mini ${temaActual() === v ? 'sel' : ''}" data-tema="${v}" aria-pressed="${temaActual() === v}">${t}</button>`).join('')}</div>
    <p class="sub">"Día" usa más contraste para leer en la calle.</p>
    <button class="btn" id="btnSync">${ic('sync')}Sincronizar ahora</button>
    <button class="btn rojo" id="salir">${ic('salir')}Cerrar sesión</button>
    ${pend ? `<p class="aviso error">Tiene ${pend} operación(es) sin enviar. Sincronice antes de cerrar sesión.</p>` : ''}</section>`;
  $('#btnSync').onclick = sincronizarManual;
  vista().querySelectorAll('[data-tema]').forEach((b) => { b.onclick = () => { ponerTema(b.dataset.tema); vCuenta(); }; });
  $('#salir').onclick = async () => {
    if (pend && !(await confirmar(`Hay ${pend} operación(es) SIN ENVIAR que se perderían.`, { titulo: '¿Cerrar sesión de todos modos?', si: 'Cerrar sesión', peligro: true }))) return;
    if (!(await confirmar('Se borrarán los datos guardados en este celular.', { titulo: 'Cerrar sesión', si: 'Cerrar sesión', peligro: true }))) return;
    cerrarSesionGoogle();
    await borrarTodo();
    location.hash = '';
    location.reload();
  };
}

// ============================================================================
// DIÁLOGOS (tomados de PROYECTO_APP)
// ============================================================================
function modal(html) {
  cerrarModal();
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo'; fondo.id = 'modal';
  fondo.innerHTML = `<div class="modal">${html}</div>`;
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrarModal(); });
  document.body.appendChild(fondo);
  return fondo;
}
function cerrarModal() { const m = $('#modal'); if (m) m.remove(); }

/** Reemplazo accesible de confirm(): devuelve true/false. */
function confirmar(mensaje, { titulo = 'Confirmar', si = 'Sí, continuar', no = 'Cancelar', peligro = false } = {}) {
  return new Promise((ok) => {
    const m = modal(`<h3 id="dlgT">${esc(titulo)}</h3><p class="mensaje">${esc(mensaje)}</p>
      <div class="acciones"><button class="btn" data-r="0">${esc(no)}</button><button class="btn ${peligro ? 'rojo' : 'verde'}" data-r="1">${esc(si)}</button></div>`);
    const caja = m.querySelector('.modal');
    caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-modal', 'true'); caja.setAttribute('aria-labelledby', 'dlgT');
    m.addEventListener('click', (e) => { if (e.target === m) ok(false); });
    m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cerrarModal(); ok(false); } });
    m.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => { cerrarModal(); ok(b.dataset.r === '1'); }; });
    m.querySelector('[data-r="1"]').focus();
  });
}

// ---- TEMA (Automático / Día / Noche) — se guarda solo en este celular ------------------
function temaActual() { try { return localStorage.getItem('tema') || 'auto'; } catch (e) { return 'auto'; } }
function ponerTema(t) {
  try { if (t === 'auto') localStorage.removeItem('tema'); else localStorage.setItem('tema', t); } catch (e) { /* sin almacenamiento */ }
  if (t === 'auto') delete document.documentElement.dataset.tema; else document.documentElement.dataset.tema = t;
  const oscuro = t === 'noche' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.setAttribute('content', oscuro ? '#081a33' : '#0c2447'); });
}

window.addEventListener('DOMContentLoaded', arrancar);
