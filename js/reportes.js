// CÁLCULOS DE REPORTES Y DEL PANEL (fase 6) — sin pantalla: se prueban en la PC (pruebas-local/reportes.js).
// Todo sale de los datos ya sincronizados (D): funciona sin señal y respeta las zonas del técnico.
// Ningún reporte lleva DNI.
import { telefonosDe, gestionesDe, enNoEnviar, gpsDe, visitasDe } from './datos.js';

export const ESTADOS = ['Por vencer', 'Moroso 1 mes', 'Moroso 2 meses', 'Moroso 3+ meses', 'Para corte'];
const num = (x) => Number(x) || 0;
const dia = (f) => String(f || '').slice(0, 10);
const sumarDias = (iso, n) => { const d = new Date(dia(iso) + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const salio = (c) => c && c.ESTADO_INFORME === 'AL_DIA_SALIO';

/** Informes aplicados, del más antiguo al más reciente. */
export const informesAplicados = (D) => D.informes.filter((i) => i.ESTADO === 'APLICADO').sort((a, b) => String(a.PERIODO).localeCompare(String(b.PERIODO)) || String(a.ID_INFORME).localeCompare(String(b.ID_INFORME)));

/** Estado de un informe pasado según sus meses (el del último informe viene exacto de D.estados). */
export function estadoPorMeses(meses, cfg) {
  const m = num(meses);
  if (m <= 0) return 'Por vencer';
  if (m >= num(cfg.MESES_PARA_CORTE || 4)) return 'Para corte';
  return m === 1 ? 'Moroso 1 mes' : m === 2 ? 'Moroso 2 meses' : 'Moroso 3+ meses';
}

/**
 * Clientes en deuda de un informe: [{ id, nombre, zona, servicio, meses, monto, estado }].
 * Último informe: estados exactos (con "Por vencer"); los anteriores, por meses.
 */
export function filasInforme(D, idInforme, cfg = D.config) {
  const aps = informesAplicados(D), ultimo = aps[aps.length - 1];
  const out = [];
  for (const c of D.clientes) {
    const ls = (D.lineas[c.ID_CLIENTE] || []).filter((l) => l.ID_INFORME === idInforme);
    if (!ls.length) continue;
    const monto = ls.reduce((s, l) => s + num(l.MONTO), 0), meses = Math.max(...ls.map((l) => num(l.MESES)));
    const e = D.estados[c.ID_CLIENTE] || {};
    const estado = ultimo && idInforme === ultimo.ID_INFORME && e.ESTADO ? e.ESTADO : estadoPorMeses(meses, cfg);
    out.push({ id: c.ID_CLIENTE, nombre: c.NOMBRES || c.ID_CLIENTE, zona: c.ZONA || '—', servicio: ls.map((l) => l.SERVICIO).join(' + ') || c.SERVICIO || '', meses, monto, estado });
  }
  return out;
}

/** Filtro común: { zona, servicio, estado } (vacío = todos). */
export const filtrar = (filas, f = {}) => filas.filter((x) => (!f.zona || x.zona === f.zona) && (!f.servicio || x.servicio.includes(f.servicio)) && (!f.estado || x.estado === f.estado));

/** Comparación entre dos informes: nuevos, salieron (pagaron), subió, bajó, igual — con totales por zona. */
export function compararInformes(D, idA, idB, f = {}) {
  const A = new Map(filtrar(filasInforme(D, idA), f).map((x) => [x.id, x])), B = new Map(filtrar(filasInforme(D, idB), f).map((x) => [x.id, x]));
  const r = { nuevos: [], salieron: [], subio: [], bajo: [], igual: [], porZona: {} };
  const zona = (z) => (r.porZona[z] = r.porZona[z] || { zona: z, antes: 0, ahora: 0, nuevos: 0, salieron: 0 });
  for (const [id, b] of B) {
    const a = A.get(id), z = zona(b.zona);
    z.ahora += b.monto;
    if (!a) { r.nuevos.push(b); z.nuevos++; }
    else if (b.monto > a.monto + 0.005) r.subio.push(Object.assign({ antes: a.monto }, b));
    else if (b.monto < a.monto - 0.005) r.bajo.push(Object.assign({ antes: a.monto }, b));
    else r.igual.push(b);
  }
  for (const [id, a] of A) {
    zona(a.zona).antes += a.monto;
    if (!B.has(id)) { r.salieron.push(a); zona(a.zona).salieron++; }
  }
  r.recuperado = r.salieron.reduce((s, x) => s + x.monto, 0) + r.bajo.reduce((s, x) => s + (x.antes - x.monto), 0);
  r.porZona = Object.values(r.porZona).sort((x, y) => y.ahora - x.ahora);
  return r;
}

/** Mensajes enviados (todos los usuarios), como lista. */
const mensajes = (D) => Object.values(D.mensajes).flat();

/** Último aviso de corte ENVIADO de un cliente (fecha) o ''. */
function ultimoAvisoCorte(D, id) {
  const m = (D.mensajes[id] || []).filter((x) => x.ESTADO === 'ENVIADO' && x.PLANTILLA === 'AVISO_CORTE').map((x) => dia(x.F_RESULTADO)).sort();
  return m[m.length - 1] || '';
}

/**
 * LISTA DE CORTE (reporte técnico "Atender primero", reglas de modTecnico).
 * Grupos en orden: pide (corte o baja) → revisar → no cortar → en persona → avisar → CORTAR. Aparte: en orden y cortados.
 */
export const GRUPOS_CORTE = [
  ['pide', 'Pide corte o baja', 'Lo pidió el cliente: atender primero.'],
  ['revisar', 'Revisar antes', 'Reclamo abierto o monto sin verificar.'],
  ['nocortar', 'No cortar todavía', 'Promesa de pago vigente o plazo del aviso sin cumplir.'],
  ['persona', 'Avisar en persona', 'Sin WhatsApp y sin aviso de corte.'],
  ['avisar', 'Falta el aviso de corte', 'Enviar el aviso de corte por WhatsApp primero.'],
  ['cortar', 'CORTAR', 'Para corte, avisado y con el plazo cumplido.'],
  ['enorden', 'Ya en una orden', 'Tiene una visita programada.'],
  ['cortados', 'Ya cortados', 'Servicio cortado por el técnico.'],
];
export function clasificarCorte(D, cfg, hoy) {
  const requiereAviso = !/^N/i.test(String(cfg.CORTE_REQUIERE_AVISO || 'SI')), respetaPlazo = !/^N/i.test(String(cfg.CORTE_RESPETA_PLAZO || 'SI'));
  const plazo = num(cfg.DIAS_PLAZO || 3), g = Object.fromEntries(GRUPOS_CORTE.map(([k]) => [k, []]));
  for (const c of D.clientes) {
    const id = c.ID_CLIENTE, e = D.estados[id] || {};
    const quejas = D.quejas.filter((q) => q.ID_CLIENTE === id && ['ABIERTA', 'EN_ORDEN', 'DERIVADA_EMPRESA_X'].includes(q.ESTADO));
    const pide = quejas.some((q) => ['SOLICITA_CORTE', 'SOLICITA_BAJA'].includes(q.CATEGORIA));
    if (e.ESTADO !== 'Para corte' && !pide) continue;
    if (salio(c) && !pide) continue;
    const aviso = ultimoAvisoCorte(D, id), x = { id, nombre: c.NOMBRES || id, zona: c.ZONA || '—', meses: num(e.MESES), monto: num(e.MONTO), aviso, motivo: '' };
    const ult = gestionesDe(id)[0];
    if (c.SERVICIO_ESTADO === 'CORTADO') { x.motivo = 'cortado el ' + dia(c.F_CORTE); g.cortados.push(x); continue; }
    if (visitasDe(id).some((d) => ['CORTE', 'RECONEXION'].includes((D.ordenes.find((o) => o.ID_OT === d.ID_OT) || {}).TIPO))) { x.motivo = 'orden de corte pendiente'; g.enorden.push(x); continue; }
    if (pide) { x.motivo = quejas.find((q) => ['SOLICITA_CORTE', 'SOLICITA_BAJA'].includes(q.CATEGORIA)).CATEGORIA === 'SOLICITA_BAJA' ? 'pide la baja' : 'pide el corte'; g.pide.push(x); continue; }
    if (quejas.some((q) => q.CATEGORIA === 'RECLAMO_COBRO') || e.MONTO_REVISAR === 'REVISAR') { x.motivo = e.MONTO_REVISAR === 'REVISAR' ? 'monto por revisar' : 'reclamo de cobro abierto'; g.revisar.push(x); continue; }
    if (ult && ult.TIPO === 'PROMESA_PAGO' && dia(ult.FECHA_COMPROMISO) >= hoy) { x.motivo = 'prometió pagar el ' + dia(ult.FECHA_COMPROMISO); g.nocortar.push(x); continue; }
    if (aviso && respetaPlazo && sumarDias(aviso, plazo) > hoy) { x.motivo = 'plazo del aviso hasta el ' + sumarDias(aviso, plazo); g.nocortar.push(x); continue; }
    if (!aviso && requiereAviso) {
      const T = telefonosDe(id);
      if (T.resumen === 'SIN_WHATSAPP' || T.resumen === 'SIN_TELEFONO') { x.motivo = 'sin WhatsApp'; g.persona.push(x); } else { x.motivo = 'sin aviso de corte'; g.avisar.push(x); }
      continue;
    }
    x.motivo = aviso ? 'avisado el ' + aviso : 'corte sin aviso (CORTE_REQUIERE_AVISO = NO)';
    g.cortar.push(x);
  }
  Object.values(g).forEach((l) => l.sort((a, b) => a.zona.localeCompare(b.zona) || b.meses - a.meses));
  return g;
}

/** DATOS PARA OPTIMIZAR: lo que falta o está mal en los contactos. */
export const GRUPOS_DATOS = [
  ['sintel', 'Sin teléfono útil'], ['equivocado', 'Número equivocado'], ['sinwa', 'Sin WhatsApp (avisar en persona)'],
  ['porver', 'WhatsApp por verificar'], ['revisar', 'Monto por revisar'], ['singps', 'Sin ubicación GPS'],
];
export function datosOptimizar(D, soloDeuda = true) {
  const g = Object.fromEntries(GRUPOS_DATOS.map(([k]) => [k, []]));
  for (const c of D.clientes) {
    const id = c.ID_CLIENTE, e = D.estados[id] || {};
    if (soloDeuda && (salio(c) || !(num(e.MONTO) > 0))) continue;
    const T = telefonosDe(id), x = { id, nombre: c.NOMBRES || id, zona: c.ZONA || '—', ref: c.REFERENCIA || '' };
    if (T.resumen === 'SIN_TELEFONO') g.sintel.push(x);
    if (T.activos.some((t) => t.NUMERO_EQUIVOCADO === 'Sí')) g.equivocado.push(x);
    if (T.resumen === 'SIN_WHATSAPP') g.sinwa.push(x);
    if (T.resumen === 'POR_VERIFICAR') g.porver.push(x);
    if (e.MONTO_REVISAR === 'REVISAR') g.revisar.push(x);
    if (!gpsDe(c)) g.singps.push(x);
  }
  Object.values(g).forEach((l) => l.sort((a, b) => a.zona.localeCompare(b.zona) || a.nombre.localeCompare(b.nombre)));
  return g;
}

/**
 * CORRECCIONES DE CONTACTO para la Empresa X: datos corregidos 🔒 y teléfonos agregados en la app.
 * desde (aaaa-mm-dd, opcional): solo lo corregido DESPUÉS de esa fecha (lo nuevo desde el último envío).
 */
export function correccionesContacto(D, desde = '') {
  const NOMBRE = { NOMBRES: 'Nombre', ZONA: 'Zona', DIRECCION: 'Dirección', REFERENCIA: 'Referencia', GPS_EXCEL: 'Ubicación GPS' };
  const CAMPO_CORR = { NOMBRES: 'NOMBRES', ZONA: 'ZONA', DIRECCION: 'DIRECCION', REFERENCIA: 'REFERENCIA', GPS_EXCEL: 'GPS' };
  const tc = (D._s && D._s.correcciones) || { cols: [], filas: [] }, ci = (k) => tc.cols.indexOf(k);
  const fechaCorr = (id, k) => { const f = tc.filas.filter((x) => x[ci('ID_CLIENTE')] === id && x[ci('CAMPO')] === CAMPO_CORR[k]).map((x) => dia(x[ci('F_DESDE')])).sort(); return f[f.length - 1] || ''; };
  const nuevo = (f) => !desde || (f && f > desde);
  const out = [];
  for (const c of D.clientes) {
    const cambios = Object.keys(c.corregido || {}).map((k) => ({ campo: NOMBRE[k] || k, antes: c.corregido[k] || '', ahora: c[k] || '', fecha: fechaCorr(c.ID_CLIENTE, k) })).filter((x) => nuevo(x.fecha));
    const tels = (D.telefonos[c.ID_CLIENTE] || []).filter((t) => t.ACTIVO !== 'No' && ['MANUAL', 'CAMPO'].includes(t.ORIGEN) && t.NUMERO_EQUIVOCADO !== 'Sí' && nuevo(dia(t.F_ALTA)));
    tels.forEach((t) => cambios.push({ campo: 'Teléfono nuevo', antes: '', ahora: t.NUMERO, fecha: dia(t.F_ALTA) }));
    const malos = (D.telefonos[c.ID_CLIENTE] || []).filter((t) => t.NUMERO_EQUIVOCADO === 'Sí' && nuevo(dia(t.F_VERIF || t.F_ALTA)));
    malos.forEach((t) => cambios.push({ campo: 'Teléfono equivocado', antes: t.NUMERO, ahora: '(no es del cliente)', fecha: dia(t.F_VERIF || t.F_ALTA) }));
    if (cambios.length) out.push({ id: c.ID_CLIENTE, nombre: c.NOMBRES || c.ID_CLIENTE, zona: c.ZONA || '—', cambios });
  }
  return out.sort((a, b) => a.zona.localeCompare(b.zona) || a.nombre.localeCompare(b.nombre));
}

/** QUEJAS Y ÓRDENES de un periodo (aaaa-mm) para la Empresa X. */
export function quejasYOrdenes(D, mes) {
  const enMes = (f) => dia(f).slice(0, 7) === mes;
  const abiertas = D.quejas.filter((q) => ['ABIERTA', 'EN_ORDEN'].includes(q.ESTADO));
  const derivadas = D.quejas.filter((q) => q.ESTADO === 'DERIVADA_EMPRESA_X');
  const resueltas = D.quejas.filter((q) => ['RESUELTA', 'CERRADA'].includes(q.ESTADO) && enMes(q.F_CIERRE));
  const visitas = D.ordenesDet.filter((d) => d.ESTADO !== 'PENDIENTE' && enMes(d.F_EJEC)).map((d) => Object.assign({ tipo: (D.ordenes.find((o) => o.ID_OT === d.ID_OT) || {}).TIPO || '' }, d));
  return { abiertas, derivadas, resueltas, visitas,
    cortes: visitas.filter((v) => v.tipo === 'CORTE' && v.ESTADO === 'HECHO').length, reconexiones: visitas.filter((v) => v.tipo === 'RECONEXION' && v.ESTADO === 'HECHO').length };
}

/**
 * PANEL: indicadores y series del dashboard. f = { informe, zona, servicio, estado }.
 * Las cifras de avisos, quejas, órdenes y calidad de datos son de hoy (no cambian con el informe elegido).
 */
export function panel(D, cfg, hoy, f = {}) {
  const aps = informesAplicados(D), sel = aps.find((i) => i.ID_INFORME === f.informe) || aps[aps.length - 1];
  const ant = sel ? aps[aps.indexOf(sel) - 1] : null;
  const filas = sel ? filtrar(filasInforme(D, sel.ID_INFORME, cfg), f) : [];
  const ids = new Set(filas.map((x) => x.id));
  const cmp = sel && ant ? compararInformes(D, ant.ID_INFORME, sel.ID_INFORME, f) : null;
  // avance de avisos del ciclo (sobre el último informe)
  const ciclo = num(cfg.DIAS_CICLO || 30), desde = sumarDias(hoy, -ciclo);
  const deben = filas.filter((x) => !enNoEnviar(x.id) && !salio(D.porId[x.id]));
  const avisados = deben.filter((x) => { const e = D.estados[x.id] || {}; return num(e.AVISO_NIVEL) > 0 && dia(e.ULT_AVISO) >= desde; });
  // mensajes
  const ms = mensajes(D), hoyMs = ms.filter((m) => dia(m.F_RESULTADO) === hoy);
  const porDia = [];
  for (let k = 13; k >= 0; k--) { const d = sumarDias(hoy, -k); porDia.push({ dia: d, enviados: ms.filter((m) => m.ESTADO === 'ENVIADO' && dia(m.F_RESULTADO) === d).length }); }
  // quejas y órdenes
  const abiertas = D.quejas.filter((q) => ['ABIERTA', 'EN_ORDEN', 'DERIVADA_EMPRESA_X'].includes(q.ESTADO));
  const cerradas = D.quejas.filter((q) => ['RESUELTA', 'CERRADA'].includes(q.ESTADO) && q.F_CIERRE && q.F_APERTURA);
  const diasSol = cerradas.length ? cerradas.reduce((s, q) => s + Math.max(0, (Date.parse(dia(q.F_CIERRE)) - Date.parse(dia(q.F_APERTURA))) / 864e5), 0) / cerradas.length : null;
  const dets = D.ordenesDet.map((d) => Object.assign({ tipo: (D.ordenes.find((o) => o.ID_OT === d.ID_OT) || {}).TIPO, estOt: (D.ordenes.find((o) => o.ID_OT === d.ID_OT) || {}).ESTADO }, d));
  // calidad de datos (clientes con deuda del filtro)
  const base = filas.length ? filas.map((x) => D.porId[x.id]).filter(Boolean) : [];
  const pct = (n) => (base.length ? Math.round(n / base.length * 100) : 0);
  // series
  const porMes = aps.map((i) => { const l = filtrar(filasInforme(D, i.ID_INFORME, cfg), f); return { periodo: i.PERIODO, deuda: l.reduce((s, x) => s + x.monto, 0), clientes: l.length }; });
  const zonasTodas = {};
  D.clientes.forEach((c) => { const z = c.ZONA || '—'; zonasTodas[z] = (zonasTodas[z] || 0) + 1; });
  const porZona = Object.values(filas.reduce((m, x) => { (m[x.zona] = m[x.zona] || { zona: x.zona, deuda: 0, clientes: 0 }); m[x.zona].deuda += x.monto; m[x.zona].clientes++; return m; }, {}))
    .map((z) => Object.assign(z, { morosidad: zonasTodas[z.zona] ? Math.round(z.clientes / zonasTodas[z.zona] * 100) : 0 })).sort((a, b) => b.deuda - a.deuda);
  const porEstado = ESTADOS.map((e) => { const l = filas.filter((x) => x.estado === e); return { estado: e, clientes: l.length, deuda: l.reduce((s, x) => s + x.monto, 0) }; });
  return {
    informe: sel || null, anterior: ant || null,
    conDeuda: filas.length, deuda: filas.reduce((s, x) => s + x.monto, 0), paraCorte: filas.filter((x) => x.estado === 'Para corte').length,
    recuperado: cmp ? cmp.recuperado : null, comparacion: cmp,
    avance: { avisados: avisados.length, deben: deben.length, pct: deben.length ? Math.round(avisados.length / deben.length * 100) : 0 },
    hoy: { enviados: hoyMs.filter((m) => m.ESTADO === 'ENVIADO').length, sinWa: hoyMs.filter((m) => m.ESTADO === 'SIN_WHATSAPP').length, fallidos: hoyMs.filter((m) => m.ESTADO === 'FALLIDO').length,
      limite: num(cfg.LIMITE_DIA || 30) },
    quejas: { abiertas: abiertas.length, alta: abiertas.filter((q) => q.PRIORIDAD === 'ALTA').length, diasSolucion: diasSol === null ? null : Math.round(diasSol * 10) / 10 },
    ordenes: { pendientes: dets.filter((d) => d.ESTADO === 'PENDIENTE' && ['PENDIENTE', 'EN_CURSO'].includes(d.estOt)).length,
      hechas: dets.filter((d) => d.ESTADO === 'HECHO').length, cortes: dets.filter((d) => d.ESTADO === 'HECHO' && d.tipo === 'CORTE').length,
      reconexiones: dets.filter((d) => d.ESTADO === 'HECHO' && d.tipo === 'RECONEXION').length },
    calidad: { conWa: pct(base.filter((c) => telefonosDe(c.ID_CLIENTE).resumen === 'CON_WHATSAPP').length), conGps: pct(base.filter((c) => gpsDe(c)).length),
      corregidos: base.filter((c) => Object.keys(c.corregido || {}).length).length, total: base.length },
    series: { porMes, porZona, porEstado, porDia, efectividad: efectividad(D, cfg, f) },
  };
}

/**
 * EFECTIVIDAD DE AVISOS por nivel: de los clientes avisados entre un informe y el siguiente,
 * cuántos salieron o bajaron su deuda en el siguiente. Necesita al menos dos informes.
 */
export function efectividad(D, cfg, f = {}) {
  const aps = informesAplicados(D), niveles = { 1: { nivel: 1, avisados: 0, mejoraron: 0 }, 2: { nivel: 2, avisados: 0, mejoraron: 0 }, 3: { nivel: 3, avisados: 0, mejoraron: 0 } };
  for (let k = 1; k < aps.length; k++) {
    const A = aps[k - 1], B = aps[k], hasta = dia(B.F_APLICADO || B.PERIODO + '-28'), desde = dia(A.F_APLICADO || A.PERIODO + '-01');
    const fa = new Map(filtrar(filasInforme(D, A.ID_INFORME, cfg), f).map((x) => [x.id, x])), fb = new Map(filasInforme(D, B.ID_INFORME, cfg).map((x) => [x.id, x]));
    for (const [id, a] of fa) {
      const avisos = (D.mensajes[id] || []).filter((m) => m.ESTADO === 'ENVIADO' && num(m.AVISO_NIVEL) > 0 && dia(m.F_RESULTADO) >= desde && dia(m.F_RESULTADO) <= hasta);
      if (!avisos.length) continue;
      const n = Math.min(3, Math.max(...avisos.map((m) => num(m.AVISO_NIVEL)))), b = fb.get(id);
      niveles[n].avisados++;
      if (!b || b.monto < a.monto - 0.005) niveles[n].mejoraron++;
    }
  }
  return Object.values(niveles).map((x) => Object.assign(x, { pct: x.avisados ? Math.round(x.mejoraron / x.avisados * 100) : null }));
}

/** REPORTE DE COBRANZA: tarjetas, zona × estado y acciones del mes. */
export function reporteCobranza(D, cfg, hoy, f = {}) {
  const P = panel(D, cfg, hoy, f), aps = informesAplicados(D), sel = P.informe;
  const filas = sel ? filtrar(filasInforme(D, sel.ID_INFORME, cfg), f) : [];
  const zonas = [...new Set(filas.map((x) => x.zona))].sort();
  const tabla = zonas.map((z) => ({ zona: z, celdas: ESTADOS.map((e) => { const l = filas.filter((x) => x.zona === z && x.estado === e); return { n: l.length, monto: l.reduce((s, x) => s + x.monto, 0) }; }),
    total: filas.filter((x) => x.zona === z).reduce((s, x) => s + x.monto, 0), n: filas.filter((x) => x.zona === z).length }));
  const mes = hoy.slice(0, 7), enMes = (x) => dia(x).slice(0, 7) === mes;
  const ges = D.gestiones.filter((g) => enMes(g.FECHA)), acciones = {};
  ges.forEach((g) => { acciones[g.TIPO] = (acciones[g.TIPO] || 0) + 1; });
  return { P, tabla, acciones, avisosMes: mensajes(D).filter((m) => m.ESTADO === 'ENVIADO' && enMes(m.F_RESULTADO)).length, informes: aps.length };
}
