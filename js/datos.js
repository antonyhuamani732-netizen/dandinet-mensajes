// Datos sincronizados en memoria + utilidades de formato.
// La verdad SIEMPRE la tiene el servidor; aquí solo se prepara lo que se muestra.
//
// Cliente "efectivo" (lo que se ve): datos del Excel (origen) + correcciones activas.
// Una corrección gana sobre el Excel y se marca con 🔒 (docs/ESPECIFICACION.md, sección 3.2).
import { kvGet, kvSet } from './db.js';
import { CONFIG } from './config.js';

/** Abre WhatsApp o una llamada. En el MODO PRUEBA no abre nada: solo muestra qué se habría abierto. */
export function abrirExterno(url) {
  if (CONFIG.DEMO) { window.dispatchEvent(new CustomEvent('demo-enlace', { detail: url })); return; }
  if (/^tel:/.test(url)) location.href = url;
  else window.open(url, '_blank', 'noopener');
}

export const D = {
  rol: '', clientes: [], porId: {}, telefonos: {}, estados: {}, ordenes: [], ordenesDet: [], quejas: [], gestiones: [],
  plantillas: [], informes: [], lineas: {}, mensajes: {}, noEnviar: [], usuarios: [], config: {}, generado: null, _s: null,
};

/** {cols, filas} → lista de objetos */
const aObjetos = (t) => (t && t.filas ? t.filas.map((f) => Object.fromEntries(t.cols.map((c, i) => [c, f[i]]))) : []);
const agrupar = (lista, campo) => lista.reduce((m, x) => { (m[x[campo]] = m[x[campo]] || []).push(x); return m; }, {});

/** Campos que se pueden corregir y su nombre en ClientesOrigen. */
export const CAMPOS_CORREGIBLES = { NOMBRES: 'NOMBRES', ZONA: 'ZONA', DIRECCION: 'DIRECCION', REFERENCIA: 'REFERENCIA', GPS: 'GPS_EXCEL' };

export async function cargarDatosLocales() {
  const s = await kvGet('datos');
  if (!s) return false;
  aplicar(s);
  return true;
}

export function aplicar(s) {
  D._s = s;
  D.rol = s.rol || '';
  const origen = Object.fromEntries(aObjetos(s.origen).map((o) => [o.ID_CLIENTE, o]));
  const corr = agrupar(aObjetos(s.correcciones), 'ID_CLIENTE');
  D.telefonos = agrupar(aObjetos(s.telefonos).sort((a, b) => Number(a.ORDEN) - Number(b.ORDEN)), 'ID_CLIENTE');
  D.estados = Object.fromEntries(aObjetos(s.estados).map((e) => [e.ID_CLIENTE, e]));
  D.clientes = aObjetos(s.clientes).map((c) => {
    const o = origen[c.ID_CLIENTE] || {}, ef = Object.assign({}, c, o, { corregido: {} });
    for (const k of corr[c.ID_CLIENTE] || []) {
      const campo = CAMPOS_CORREGIBLES[k.CAMPO];
      if (!campo) continue;
      ef[campo] = k.VALOR;
      ef.corregido[campo] = o[campo] === undefined ? '' : o[campo];   // guarda lo que decía el Excel
    }
    return ef;
  });
  D.porId = Object.fromEntries(D.clientes.map((c) => [c.ID_CLIENTE, c]));
  D.ordenes = aObjetos(s.ordenes);
  D.ordenesDet = aObjetos(s.ordenesDet);
  D.quejas = aObjetos(s.quejas);
  D.gestiones = aObjetos(s.gestiones);
  D.plantillas = aObjetos(s.plantillas);
  D.informes = aObjetos(s.informes).sort((a, b) => String(b.ID_INFORME).localeCompare(String(a.ID_INFORME)));
  D.lineas = agrupar(aObjetos(s.lineas), 'ID_CLIENTE');
  D.mensajes = agrupar(aObjetos(s.mensajes).sort((a, b) => String(b.F_RESULTADO).localeCompare(String(a.F_RESULTADO))), 'ID_CLIENTE');
  D.noEnviar = aObjetos(s.noEnviar);
  D.usuarios = aObjetos(s.usuarios);
  D.config = s.config || {};
  D.generado = s.generado;
}

// ---------------------------------------------------------------- cambios locales (sin esperar al servidor)
// Lo que se hace en la ficha se ve al instante, aun sin señal. La operación va a la cola y,
// al sincronizar, el servidor manda la versión definitiva (que reemplaza a esta).
const col = (t, c) => (t && t.cols ? t.cols.indexOf(c) : -1);
function fijar(t, fila, campo, valor) { const i = col(t, campo); if (i >= 0) fila[i] = valor; }
function agregarFila(t, obj) { if (t && t.cols) t.filas.push(t.cols.map((c) => (obj[c] === undefined ? '' : obj[c]))); }
const filasDe = (t, campo, valor) => (t && t.filas ? t.filas.filter((f) => f[col(t, campo)] === valor) : []);

export async function aplicarLocal(tipo, d) {
  const s = D._s; if (!s) return;
  const ahora = ahoraISO().slice(0, 19);                     // hora de Lima (no UTC)
  if (tipo === 'CORREGIR' || tipo === 'QUITAR_CORRECCION') {
    const t = s.correcciones;
    t.filas = t.filas.filter((f) => !(f[col(t, 'ID_CLIENTE')] === d.idCliente && f[col(t, 'CAMPO')] === d.campo));
    if (tipo === 'CORREGIR') agregarFila(t, { ID_CORR: 'LOCAL', ID_CLIENTE: d.idCliente, CAMPO: d.campo, VALOR: d.campo === 'ZONA' ? String(d.valor).toUpperCase() : String(d.valor).replace(/\s+/g, ' '), ACTIVA: 'Sí', F_DESDE: ahora });
  } else if (tipo === 'TELEFONO_AGREGAR') {
    const t = s.telefonos, n = '+51' + String(d.numero).replace(/\D/g, '').slice(-9);
    const ya = filasDe(t, 'ID_CLIENTE', d.idCliente).find((f) => f[col(t, 'NUMERO')] === n);
    if (ya) { fijar(t, ya, 'ACTIVO', 'Sí'); fijar(t, ya, 'NUMERO_EQUIVOCADO', 'No'); }
    else {
      const otro = t.filas.find((f) => f[col(t, 'NUMERO')] === n && ['SI', 'NO'].includes(f[col(t, 'WHATSAPP')]));
      agregarFila(t, { ID_TEL: 'LOCAL-' + Date.now(), ID_CLIENTE: d.idCliente, NUMERO: n, ORDEN: d.principal ? 0 : 99, WHATSAPP: otro ? otro[col(t, 'WHATSAPP')] : 'POR_VERIFICAR',
        ACTIVO: 'Sí', NUMERO_EQUIVOCADO: 'No', ORIGEN: 'MANUAL' });
    }
  } else if (tipo === 'TELEFONO_EDITAR') {
    const t = s.telefonos, f = t.filas.find((x) => x[col(t, 'ID_TEL')] === d.idTel);
    if (f) {
      if (d.whatsapp !== undefined) t.filas.filter((x) => x[col(t, 'NUMERO')] === f[col(t, 'NUMERO')]).forEach((x) => fijar(t, x, 'WHATSAPP', d.whatsapp));
      if (d.equivocado !== undefined) fijar(t, f, 'NUMERO_EQUIVOCADO', d.equivocado ? 'Sí' : 'No');
      if (d.activo !== undefined) fijar(t, f, 'ACTIVO', d.activo ? 'Sí' : 'No');
      if (d.principal) filasDe(t, 'ID_CLIENTE', f[col(t, 'ID_CLIENTE')]).forEach((x) => fijar(t, x, 'ORDEN', x === f ? 0 : Number(x[col(t, 'ORDEN')]) + 1));
    }
  } else if (tipo === 'MARCAS') {
    const t = s.clientes, f = filasDe(t, 'ID_CLIENTE', d.idCliente)[0];
    if (f) {
      if (d.contactoGuardado !== undefined) fijar(t, f, 'CONTACTO_GUARDADO', d.contactoGuardado ? 'SI' : '');
      if (d.montoVerificado !== undefined) fijar(t, f, 'MONTO_VERIFICADO', d.montoVerificado ? 'SI' : '');
      if (d.noEnviarHasta !== undefined) fijar(t, f, 'NO_ENVIAR_HASTA', d.noEnviarHasta || '');
      if (d.obs !== undefined) fijar(t, f, 'OBS', d.obs);
    }
    const e = filasDe(s.estados, 'ID_CLIENTE', d.idCliente)[0];
    if (e && d.montoVerificado !== undefined) fijar(s.estados, e, 'MONTO_REVISAR', d.montoVerificado ? 'Verificado' : '');
  } else if (tipo === 'NO_ENVIAR') {
    const c = D.porId[d.idCliente] || {}, t = s.noEnviar, tipoNE = c.DNI ? 'DNI' : 'CLIENTE', valor = c.DNI || d.idCliente;
    if (t) {
      t.filas = t.filas.filter((f) => !(f[col(t, 'TIPO')] === tipoNE && f[col(t, 'VALOR')] === valor));
      if (d.activo) agregarFila(t, { TIPO: tipoNE, VALOR: valor, MOTIVO: d.motivo || '' });
    }
  } else if (tipo === 'GESTION') {
    agregarFila(s.gestiones, { ID_GEST: 'LOCAL', ID_CLIENTE: d.idCliente, TIPO: d.tipo, FECHA_COMPROMISO: d.fechaCompromiso || '', OBS: d.obs || '', USUARIO: 'yo', FECHA: ahora });
    // igual que el servidor: estas gestiones dejan un pendiente por atender
    const cat = { NUMERO_EQUIVOCADO: ['NUMERO_EQUIVOCADO', 'MEDIA'], RECLAMO: ['RECLAMO_COBRO', 'ALTA'], SOLICITA_CORTE: ['SOLICITA_CORTE', 'ALTA'], SOLICITA_BAJA: ['SOLICITA_BAJA', 'ALTA'] }[d.tipo];
    if (cat) agregarQuejaLocal(s, { idCliente: d.idCliente, categoria: cat[0], prioridad: cat[1], descripcion: d.obs || '', canal: 'GESTION' }, ahora);
    if (d.tipo === 'NUMERO_EQUIVOCADO' && d.idTel) return aplicarLocal('TELEFONO_EDITAR', { idTel: d.idTel, equivocado: true });
  } else if (tipo === 'REGISTRAR_ENVIO') {
    const n = '+51' + String(d.numero).replace(/\D/g, '').slice(-9), aviso = d.resultado === 'ENVIADO' && Number(d.avisoNivel) > 0;
    agregarFila(s.mensajes, { ID_MSG: 'LOCAL-' + Date.now(), ID_TANDA: d.idTanda || '', ID_CLIENTE: d.idCliente, NUMERO: n, PLANTILLA: d.plantilla,
      AVISO_NIVEL: aviso ? Number(d.avisoNivel) : '', ESTADO: d.resultado, USUARIO: 'yo', F_RESULTADO: ahora });
    const wa = d.resultado === 'ENVIADO' ? 'SI' : d.resultado === 'SIN_WHATSAPP' ? 'NO' : '';
    if (wa && s.telefonos) s.telefonos.filas.filter((f) => f[col(s.telefonos, 'NUMERO')] === n).forEach((f) => fijar(s.telefonos, f, 'WHATSAPP', wa));
    const e = filasDe(s.estados, 'ID_CLIENTE', d.idCliente)[0];
    if (e && aviso) { fijar(s.estados, e, 'AVISO_NIVEL', Number(d.avisoNivel)); fijar(s.estados, e, 'ULT_AVISO', ahora.slice(0, 10)); }
  } else if (tipo === 'ANULAR_ENVIO') {
    const t = s.mensajes, f = t && t.filas.find((x) => x[col(t, 'ID_MSG')] === d.idMsg);
    if (f) fijar(t, f, 'ESTADO', 'NO_ENTREGADO');
  } else if (tipo === 'GUARDAR_PLANTILLA') {
    const t = s.plantillas, f = t && t.filas.find((x) => x[col(t, 'NOMBRE')] === d.nombre);
    if (f) { fijar(t, f, 'TEXTO', d.texto); if (d.estados !== undefined) fijar(t, f, 'ESTADOS', d.estados); }
    else agregarFila(t, { ID_PLANTILLA: 'LOCAL', NOMBRE: d.nombre, ESTADOS: d.estados || '', TEXTO: d.texto, ACTIVA: 'Sí' });
  } else if (tipo === 'CREAR_ORDEN') {
    const id = 'LOCAL-OT-' + Date.now();
    agregarFila(s.ordenes, { ID_OT: id, TIPO: d.tipo, ESTADO: 'PENDIENTE', TECNICO: d.tecnico || (D._s && D._s.usuario) || '', F_PROGRAMADA: d.fProgramada || ahora.slice(0, 10),
      ZONA: (D.porId[(d.clientes[0] || {}).idCliente] || {}).ZONA || '', TITULO: d.titulo || '', F_CREACION: ahora, USUARIO: 'yo' });
    d.clientes.forEach((x, k) => {
      agregarFila(s.ordenesDet, { ID_DET: id + '-' + k, ID_OT: id, ID_CLIENTE: x.idCliente, ID_QUEJA: x.idQueja || '', ORDEN_RUTA: k + 1, ESTADO: 'PENDIENTE', OBS: x.obs || '' });
      const t = s.quejas, f = x.idQueja && t && t.filas.find((q) => q[col(t, 'ID_QUEJA')] === x.idQueja);
      if (f && f[col(t, 'ESTADO')] === 'ABIERTA') fijar(t, f, 'ESTADO', 'EN_ORDEN');
    });
  } else if (tipo === 'CERRAR_VISITA') {
    const t = s.ordenesDet, f = t && t.filas.find((x) => x[col(t, 'ID_DET')] === d.idDet);
    if (f) {
      fijar(t, f, 'ESTADO', d.resultado); fijar(t, f, 'RESULTADO', d.obs || ''); fijar(t, f, 'GPS', d.gps || ''); fijar(t, f, 'F_EJEC', ahora);
      if (d.foto) fijar(t, f, 'FOTO', 'por enviar');
      const idOt = f[col(t, 'ID_OT')], quedan = t.filas.filter((x) => x[col(t, 'ID_OT')] === idOt && x[col(t, 'ESTADO')] === 'PENDIENTE').length;
      const o = s.ordenes.filas.find((x) => x[col(s.ordenes, 'ID_OT')] === idOt);
      if (o) fijar(s.ordenes, o, 'ESTADO', quedan ? 'EN_CURSO' : 'CERRADA');
      const idQ = f[col(t, 'ID_QUEJA')], q = idQ && s.quejas.filas.find((x) => x[col(s.quejas, 'ID_QUEJA')] === idQ);
      if (q) { fijar(s.quejas, q, 'ESTADO', d.resultado === 'HECHO' ? 'RESUELTA' : 'ABIERTA'); if (d.resultado === 'HECHO') fijar(s.quejas, q, 'SOLUCION', 'Visita: ' + (d.obs || '')); }
      // A2: corte / reconexión hechos por el técnico
      const tipoOt = o ? o[col(s.ordenes, 'TIPO')] : '', fc = s.clientes.filas.find((x) => x[col(s.clientes, 'ID_CLIENTE')] === f[col(t, 'ID_CLIENTE')]);
      if (fc && d.resultado === 'HECHO' && (tipoOt === 'CORTE' || tipoOt === 'RECONEXION')) {
        fijar(s.clientes, fc, 'SERVICIO_ESTADO', tipoOt === 'CORTE' ? 'CORTADO' : 'ACTIVO'); fijar(s.clientes, fc, 'F_CORTE', tipoOt === 'CORTE' ? ahora : '');
      }
      agregarFila(s.gestiones, { ID_GEST: 'LOCAL', ID_CLIENTE: f[col(t, 'ID_CLIENTE')], TIPO: 'VISITA', OBS: idOt + ': ' + ({ HECHO: 'hecha', NO_HECHO: 'no se pudo hacer', NO_ESTABA: 'no estaba' }[d.resultado]) + (d.obs ? ' · ' + d.obs : ''), USUARIO: 'yo', FECHA: ahora });
    }
  } else if (tipo === 'ACTUALIZAR_ORDEN') {
    const t = s.ordenes, f = t && t.filas.find((x) => x[col(t, 'ID_OT')] === d.idOt);
    if (f) {
      if (d.anular) fijar(t, f, 'ESTADO', 'ANULADA');
      if (d.tecnico) fijar(t, f, 'TECNICO', d.tecnico);
      if (d.fProgramada) fijar(t, f, 'F_PROGRAMADA', d.fProgramada);
    }
  } else if (tipo === 'GUARDAR_USUARIO') {
    const t = s.usuarios;
    if (t) {
      const f = t.filas.find((x) => String(x[col(t, 'EMAIL')]).toLowerCase() === String(d.email).toLowerCase());
      const fila = { EMAIL: String(d.email).toLowerCase(), NOMBRE: d.nombre || d.email, ROL: d.rol, ZONAS: String(d.zonas || '').toUpperCase(), ACTIVO: d.activo === false ? 'No' : 'Sí' };
      if (f) Object.keys(fila).forEach((k) => fijar(t, f, k, fila[k])); else agregarFila(t, fila);
    }
  } else if (tipo === 'ABRIR_QUEJA') {
    agregarQuejaLocal(s, d, ahora);
  } else if (tipo === 'ATENDER_QUEJA') {
    const t = s.quejas, f = t && t.filas.find((x) => x[col(t, 'ID_QUEJA')] === d.idQueja);
    if (f) {
      fijar(t, f, 'ESTADO', d.estado);
      if (d.solucion) fijar(t, f, 'SOLUCION', d.solucion);
      fijar(t, f, 'F_CIERRE', ['RESUELTA', 'CERRADA'].includes(d.estado) ? ahora : '');
    }
  } else return;
  aplicar(s);
  try { await kvSet('datos', s); } catch (e) { /* se recupera al sincronizar */ }
}

function agregarQuejaLocal(s, d, ahora) {
  const t = s.quejas;
  if (!t) return;
  const abierta = t.filas.some((f) => f[col(t, 'ID_CLIENTE')] === d.idCliente && f[col(t, 'CATEGORIA')] === d.categoria && ['ABIERTA', 'EN_ORDEN', 'DERIVADA_EMPRESA_X'].includes(f[col(t, 'ESTADO')]));
  if (abierta) return;
  agregarFila(t, { ID_QUEJA: 'LOCAL-' + Date.now(), ID_CLIENTE: d.idCliente, CANAL: d.canal || 'OFICINA', CATEGORIA: d.categoria, DESCRIPCION: d.descripcion || '',
    PRIORIDAD: d.prioridad || 'MEDIA', ESTADO: 'ABIERTA', F_APERTURA: ahora, USUARIO: 'yo' });
}

// ---------------------------------------------------------------- datos derivados de un cliente
/** Teléfonos activos, cuáles sirven para avisar y el resumen de WhatsApp (como la macro). */
export function telefonosDe(id) {
  const todos = D.telefonos[id] || [];
  const activos = todos.filter((t) => t.ACTIVO !== 'No');
  const utiles = activos.filter((t) => t.NUMERO_EQUIVOCADO !== 'Sí');
  const conWa = utiles.filter((t) => t.WHATSAPP === 'SI'), porVer = utiles.filter((t) => !t.WHATSAPP || t.WHATSAPP === 'POR_VERIFICAR');
  const resumen = !utiles.length ? 'SIN_TELEFONO' : conWa.length ? 'CON_WHATSAPP' : porVer.length ? 'POR_VERIFICAR' : 'SIN_WHATSAPP';
  return { todos, activos, utiles, conWa, porVer, resumen };
}
export const gestionesDe = (id) => D.gestiones.filter((g) => g.ID_CLIENTE === id).sort((a, b) => String(b.FECHA).localeCompare(String(a.FECHA)));
export function enNoEnviar(id) {
  const c = D.porId[id] || {};
  return D.noEnviar.some((n) => (n.TIPO === 'DNI' && c.DNI && String(n.VALOR) === String(c.DNI)) || (n.TIPO === 'CLIENTE' && n.VALOR === id));
}

/** "lat,lng" del cliente → [lat, lng] (o null). */
export function gpsDe(c) {
  const m = String((c && c.GPS_EXCEL) || '').match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
/** Distancia en metros entre dos puntos [lat, lng]. */
export function distanciaM(a, b) {
  const R = 6371000, r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const quejaAbiertaD = (q) => ['ABIERTA', 'EN_ORDEN', 'DERIVADA_EMPRESA_X'].includes(q.ESTADO);
/** Visitas pendientes (de órdenes vigentes) de un cliente. */
export const visitasDe = (id) => D.ordenesDet.filter((d) => d.ID_CLIENTE === id && d.ESTADO === 'PENDIENTE'
  && (D.ordenes.find((o) => o.ID_OT === d.ID_OT) || {}).ESTADO !== 'ANULADA');
/**
 * Lo importante de un cliente en una mirada (etiquetas de la ficha y colores del mapa).
 * [{ k, txt, cls, ayuda }]: corte, pendientes, visita, NO ENVIAR, pausa, sin WhatsApp, sin teléfono, monto por revisar.
 */
export function alertasDe(id) {
  const c = D.porId[id] || {}, e = D.estados[id] || {}, T = telefonosDe(id), hoy = hoyISO(), out = [];
  const hasta = String(c.NO_ENVIAR_HASTA || '').slice(0, 10);
  const pend = D.quejas.filter((q) => q.ID_CLIENTE === id && quejaAbiertaD(q)), vis = visitasDe(id);
  const cortado = c.SERVICIO_ESTADO === 'CORTADO';
  if (cortado && c.ESTADO_INFORME === 'AL_DIA_SALIO') out.push({ k: 'reconectar', txt: 'Reconectar', cls: 'e-activo', ayuda: 'Tiene el servicio cortado y ya salió del informe (pagó): toca reconectarlo.' });
  else if (cortado) out.push({ k: 'cortado', txt: 'Servicio cortado', cls: 'e-baja', ayuda: 'El técnico le cortó el servicio el ' + txtFecha(c.F_CORTE) + '. Se reconecta cuando salga del informe.' });
  if (e.ESTADO === 'Para corte' && !cortado) out.push({ k: 'corte', txt: 'Para corte', cls: 'e-moroso', ayuda: (e.MESES || '') + ' mes(es) de deuda. Solo se corta a quien ya recibió el aviso de corte.' });
  if (pend.length) out.push({ k: 'pendiente', txt: pend.length + ' pendiente(s)', cls: 'e-moroso', ayuda: 'Reportes por atender (quejas, número equivocado, reclamo, corte o baja).' });
  if (vis.length) out.push({ k: 'visita', txt: 'Visita programada', cls: 'e-porvencer', ayuda: 'Está en una orden de trabajo pendiente.' });
  if (enNoEnviar(id)) out.push({ k: 'noenviar', txt: 'NO ENVIAR', cls: 'e-baja', ayuda: 'Pidió no recibir avisos de cobranza.' });
  else if (hasta && hasta >= hoy) out.push({ k: 'pausa', txt: 'Avisos en pausa', cls: 'e-susp', ayuda: 'No recibe avisos hasta el ' + txtFecha(hasta) + '.' });
  if (T.resumen === 'SIN_WHATSAPP') out.push({ k: 'sinwa', txt: 'Sin WhatsApp', cls: 'e-moroso', ayuda: 'Ningún número tiene WhatsApp: hay que avisarle en persona (ver Mapa).' });
  if (T.resumen === 'SIN_TELEFONO') out.push({ k: 'sintel', txt: 'Sin teléfono', cls: 'e-moroso', ayuda: 'No hay un número útil. Pídalo en la visita.' });
  if (e.MONTO_REVISAR === 'REVISAR') out.push({ k: 'revisar', txt: 'Monto por revisar', cls: 'e-porvencer', ayuda: 'El monto no coincide con plan × meses: confírmelo con la Empresa X antes de avisar.' });
  return out;
}

/** Búsqueda por varias palabras en cualquier orden, sin tildes (como "Gestionar cliente" de la macro). */
export const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
export function buscarClientes(texto, max = 80) {
  const palabras = sinTildes(texto).trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (const c of D.clientes) {
    const tels = (D.telefonos[c.ID_CLIENTE] || []).map((t) => t.NUMERO).join(' ');
    const s = sinTildes(`${c.ID_CLIENTE} ${c.NOMBRES} ${c.DNI || ''} ${tels} ${c.ZONA} ${c.DIRECCION || ''} ${c.REFERENCIA || ''}`);
    if (palabras.every((p) => s.includes(p))) out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

// ---- utilidades de formato ------------------------------------------------------
export const esc = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
export const soles = (x) => 'S/ ' + r2(x || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const txtFecha = (iso) => { const s = String(iso || ''); return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; };
export const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
export const ahoraISO = () => {
  const d = new Date(), f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d);
  const g = (t) => f.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}:${g('second')}-05:00`;
};
/** +51900111222 → 900 111 222 */
export const txtTel = (n) => { const d = String(n || '').replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, ''); return d.length === 9 ? d.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : String(n || ''); };

/** Clase de color del chip según el estado del cliente (tokens de PROYECTO_APP). */
export function claseEstado(e) {
  return { 'Al día': 'e-activo', 'Por vencer': 'e-porvencer', 'Moroso 1 mes': 'e-porvencer', 'Moroso 2 meses': 'e-susp',
    'Moroso 3+ meses': 'e-moroso', 'Para corte': 'e-moroso', PENDIENTE: 'e-porvencer', EN_RUTA: 'e-porvencer', CERRADA: 'e-activo',
    ANULADA: 'e-baja', HECHO: 'e-activo', NO_UBICADO: 'e-cortado', ABIERTA: 'e-moroso', RESUELTA: 'e-activo',
    EN_CURSO: 'e-porvencer', NO_HECHO: 'e-moroso', NO_ESTABA: 'e-susp' }[e] || 'e-pend';
}
