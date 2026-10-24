// MOTOR DE AVISOS (fase 4) — funciones puras, portadas de la macro (modMensajes, modEnvio, modReporte).
// - armarMensaje: reemplaza las variables de la plantilla (saludo y despedida alternados por cliente).
// - plantillaPara: 1.er aviso = plantilla del estado; 2.º = SEGUNDO_AVISO; 3.º o más = AVISO_CORTE.
// - motivoNoEnvio: "" si se le puede enviar; si no, el motivo (mismas reglas que la macro).
// - horario: día sin envíos y franja horaria permitida.
// Se usa en el celular (pantalla Envíos) y en las pruebas locales (Node).

export const VARIABLES = ['{Saludo}', '{Nombre}', '{PrimerNombre}', '{Empresa}', '{Servicio}', '{Meses}', '{Periodos}', '{Monto}', '{Plan}',
  '{FechaVencimiento}', '{FechaLimite}', '{DiasAtraso}', '{MetodosPago}', '{CelConstancia}', '{Zona}', '{Despedida}'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

const dia = (iso) => { const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const iso = (dt) => dt.toISOString().slice(0, 10);
export const fechaTexto = (i) => { const s = String(i || ''); return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; };
const soles = (x) => 'S/ ' + (Math.round((Number(x) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const claveTexto = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** "JUAN PEREZ" → "Juan Perez" */
export const nombrePropio = (s) => String(s || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

/** Último día de pago del mes del informe: 'AAAA-MM' + DIA_ULTIMO_PAGO → 'AAAA-MM-DD' */
export function fechaVencimiento(periodo, diaPago = 4) {
  const [a, m] = String(periodo).split('-').map(Number);
  return iso(new Date(Date.UTC(a, m - 1, Number(diaPago) || 4)));
}

/** Fecha límite que se comunica: si el aviso sale después del vencimiento, hoy + DIAS_PLAZO (nunca domingo). */
export function fechaLimite(periodo, hoy, diaPago = 4, diasPlazo = 3) {
  let f = dia(fechaVencimiento(periodo, diaPago));
  const h = dia(hoy), conPlazo = new Date(h.getTime() + (Number(diasPlazo) || 3) * 864e5);
  if (conPlazo > f) f = conPlazo;
  if (f.getUTCDay() === 0) f = new Date(f.getTime() + 864e5);
  return iso(f);
}

/** Texto de los periodos adeudados: "setiembre y octubre 2026", "enero a octubre 2026". (PeriodosTexto) */
export function periodosTexto(meses, periodo) {
  meses = Number(meses) || 0;
  if (meses <= 0) return '';
  const [a, m] = String(periodo).split('-').map(Number);
  const ini = new Date(Date.UTC(a, m - 1 - (meses - 1), 1)), ai = ini.getUTCFullYear(), mi = ini.getUTCMonth();
  const nm = (k) => MESES[k];
  if (meses === 1) return `${nm(m - 1)} ${a}`;
  if (meses === 2 && ai === a) return `${nm(mi)} y ${nm(m - 1)} ${a}`;
  if (meses === 3 && ai === a) return `${nm(mi)}, ${nm(mi + 1)} y ${nm(m - 1)} ${a}`;
  if (ai === a) return `${nm(mi)} a ${nm(m - 1)} ${a}`;
  return `${nm(mi)} ${ai} a ${nm(m - 1)} ${a}`;
}

/** Opción fija de una lista "a|b|c" según la semilla (así la vista previa es lo que se envía). */
function variante(lista, semilla) {
  const p = String(lista || '').split('|').map((x) => x.trim()).filter(Boolean);
  return p.length ? p[Math.abs(semilla) % p.length] : '';
}

/** Número del cliente para variar saludo y despedida ("CLI-0042" → 42). */
export const semillaDe = (idCliente) => Number(String(idCliente).replace(/\D/g, '')) || 0;

/**
 * Arma el mensaje. c = { idCliente, nombre, servicio, meses, monto, plan, zona, diasAtraso }
 * cfg = configuración (EMPRESA, SALUDOS, DESPEDIDAS, METODOS_PAGO, CEL_CONSTANCIA, DIA_ULTIMO_PAGO, DIAS_PLAZO, SERVICIO_*)
 */
export function armarMensaje(texto, c, cfg, periodo, hoy) {
  const semilla = semillaDe(c.idCliente), nombre = nombrePropio(c.nombre), meses = Number(c.meses) || 0;
  const servicio = c.servicio === 'DUO' ? (cfg.SERVICIO_DUO || 'Dúo') : /TV/.test(c.servicio || '') ? (cfg.SERVICIO_TV || 'TV Cable') : (c.servicio || cfg.SERVICIO_DEFECTO || 'TV Cable');
  const valores = {
    '{Saludo}': variante(cfg.SALUDOS || 'Hola', semilla),
    '{Despedida}': variante(cfg.DESPEDIDAS || 'Gracias.', Math.floor(semilla / 2)),
    '{PrimerNombre}': nombre.split(' ')[0] || '',
    '{Nombre}': nombre,
    '{Empresa}': cfg.EMPRESA || '',
    '{Servicio}': servicio,
    '{Meses}': meses + (meses === 1 ? ' mes' : ' meses'),
    '{Periodos}': periodosTexto(meses, periodo),
    '{Monto}': soles(c.monto),
    '{Plan}': soles(c.plan),
    '{FechaVencimiento}': fechaTexto(fechaVencimiento(periodo, cfg.DIA_ULTIMO_PAGO)),
    '{FechaLimite}': fechaTexto(fechaLimite(periodo, hoy, cfg.DIA_ULTIMO_PAGO, cfg.DIAS_PLAZO)),
    '{DiasAtraso}': String(c.diasAtraso === undefined ? '' : c.diasAtraso),
    '{MetodosPago}': String(cfg.METODOS_PAGO || '').replace(/\\n/g, '\n'),
    '{CelConstancia}': cfg.CEL_CONSTANCIA || '',
    '{Zona}': c.zona || '',
  };
  let t = String(texto || '').replace(/\\n/g, '\n');
  for (const [k, v] of Object.entries(valores)) t = t.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'gi'), v);
  return t.replace(/\r\n/g, '\n').trim();
}

/** Variables mal escritas en una plantilla (ej. {nombre completo}). */
export function variablesDesconocidas(texto) {
  const ok = VARIABLES.map((v) => v.toLowerCase());
  return [...new Set((String(texto).match(/\{[^}]*\}/g) || []).filter((v) => !ok.includes(v.toLowerCase())))];
}

/**
 * Plantilla del aviso según el paso (PlantillaPaso). plantillas = [{ NOMBRE, ESTADOS, TEXTO, ACTIVA }]
 * Devuelve el NOMBRE o '' si no hay plantilla para el estado.
 */
export function plantillaPara(estado, avisosPrevios, plantillas) {
  const activas = plantillas.filter((p) => p.ACTIVA !== 'No' && p.TEXTO);
  const base = (activas.find((p) => String(p.ESTADOS || '').split(';').some((e) => claveTexto(e) === claveTexto(estado))) || {}).NOMBRE || '';
  if (!base) return '';
  const paso = avisosPrevios === 1 ? 'SEGUNDO_AVISO' : avisosPrevios >= 2 ? 'AVISO_CORTE' : base;
  return activas.some((p) => p.NOMBRE === paso) ? paso : base;
}

/** "" si hoy y a esta hora se puede enviar; si no, el motivo. ahora = Date (hora local de Lima). */
export function motivoHorario(cfg, ahora) {
  const hoyNombre = DIAS[ahora.getDay()];
  if (claveTexto(cfg.DIAS_SIN_ENVIO || 'DOMINGO').includes(hoyNombre)) return `Hoy es ${hoyNombre.toLowerCase()}: día sin envíos (Configuración > Días sin envío).`;
  const hm = (s, d) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : d; };
  const ini = hm(cfg.HORA_INICIO, 540), fin = hm(cfg.HORA_FIN, 1140), t = ahora.getHours() * 60 + ahora.getMinutes();
  if (t < ini || t >= fin) return `Fuera del horario permitido (${cfg.HORA_INICIO || '09:00'} a ${cfg.HORA_FIN || '19:00'}).`;
  return '';
}

/**
 * ¿Se le puede avisar? Devuelve { motivo: '' | texto, telefono, plantilla, avisosPrevios }.
 * x = {
 *   cliente: { ESTADO_INFORME, NO_ENVIAR_HASTA, MONTO_VERIFICADO },
 *   estado:  { ESTADO, MONTO, MONTO_REVISAR },
 *   telefonos: [{ ID_TEL, NUMERO, WHATSAPP, ACTIVO, NUMERO_EQUIVOCADO, ORDEN }] (ordenados, principal primero),
 *   noEnviar: bool, ultimaGestion: { TIPO } | null,
 *   enviados: [{ F_RESULTADO, NUMERO }] ENVIADO del cliente, enviosPorNumero: { '+51…': 'AAAA-MM-DD' } de otros clientes,
 *   plantillas, cfg, hoy: 'AAAA-MM-DD', vistos: Set de números ya tomados en este recorrido
 * }
 */
export function evaluarAviso(x) {
  const { cliente, estado = {}, cfg, hoy } = x;
  const fuera = (motivo) => ({ motivo, telefono: null, plantilla: '', avisosPrevios: 0 });
  if (x.noEnviar) return fuera('NO ENVIAR (pidió no recibir avisos)');
  if (cliente.ESTADO_INFORME === 'AL_DIA_SALIO' || estado.ESTADO === 'Al día' || !(Number(estado.MONTO) > 0)) return fuera('Al día (sin deuda en el informe)');
  const utiles = (x.telefonos || []).filter((t) => t.ACTIVO !== 'No' && t.NUMERO_EQUIVOCADO !== 'Sí');
  if (!utiles.length) return fuera('Sin teléfono válido');
  const g = x.ultimaGestion && x.ultimaGestion.TIPO;
  if (g === 'PAGO_POR_CONFIRMAR') return fuera('Dijo que pagó (por confirmar)');
  if (g === 'NUMERO_EQUIVOCADO' && !utiles.length) return fuera('Número equivocado');
  if (g === 'PROMESA_PAGO' && x.ultimaGestion.FECHA_COMPROMISO && String(x.ultimaGestion.FECHA_COMPROMISO).slice(0, 10) >= hoy) {
    return fuera('Promesa de pago vigente hasta el ' + fechaTexto(x.ultimaGestion.FECHA_COMPROMISO));
  }
  const hasta = String(cliente.NO_ENVIAR_HASTA || '').slice(0, 10);
  if (hasta && hasta > hoy) return fuera('Avisos en pausa hasta el ' + fechaTexto(hasta));
  if (estado.MONTO_REVISAR === 'REVISAR' && cliente.MONTO_VERIFICADO !== 'SI') return fuera('Monto por revisar (márquelo como verificado en la ficha)');
  // avisos dentro del ciclo
  const ciclo = Number(cfg.DIAS_CICLO || 45), maxAv = Math.max(1, Number(cfg.MAX_AVISOS || 3)), diasNR = Number(cfg.DIAS_NO_REENVIAR === undefined ? 7 : cfg.DIAS_NO_REENVIAR);
  const h = dia(hoy).getTime(), dias = (f) => Math.round((h - dia(f).getTime()) / 864e5);
  const enCiclo = (x.enviados || []).filter((m) => dias(m.F_RESULTADO) <= ciclo);
  const previos = enCiclo.length;
  if (previos >= maxAv) return fuera(`Ya recibió ${previos} avisos (máximo ${maxAv}): corresponde el corte`);
  const ultimo = (x.enviados || []).map((m) => String(m.F_RESULTADO).slice(0, 10)).sort().pop();
  if (ultimo && dias(ultimo) < diasNR) return fuera('Ya avisado el ' + fechaTexto(ultimo));
  const plantilla = plantillaPara(estado.ESTADO, previos, x.plantillas || []);
  if (!plantilla) return fuera('Sin plantilla para el estado ' + (estado.ESTADO || '(sin estado)'));
  // teléfono: con WhatsApp comprobado (o por verificar si EXIGIR_VERIFICACION = NO)
  const exigir = !/^N/i.test(String(cfg.EXIGIR_VERIFICACION || 'SI'));
  const conWa = utiles.filter((t) => t.WHATSAPP === 'SI'), porVer = utiles.filter((t) => !t.WHATSAPP || t.WHATSAPP === 'POR_VERIFICAR');
  const tel = conWa[0] || (!exigir ? porVer[0] : null);
  if (!tel) return fuera(porVer.length ? 'Falta verificar el WhatsApp (use Verificar números)' : 'Ningún teléfono con WhatsApp (avisar en persona)');
  // número compartido (familia)
  const compartido = !/^N/i.test(String(cfg.PERMITIR_NUMERO_COMPARTIDO || 'SI'));
  if (!compartido) {
    const otro = (x.enviosPorNumero || {})[tel.NUMERO];
    if (otro && dias(otro) < diasNR) return fuera('Número ya contactado el ' + fechaTexto(otro));
    if (x.vistos && x.vistos.has(tel.NUMERO)) return fuera('Número compartido con otro cliente que ya recibe aviso');
  }
  if (x.vistos) x.vistos.add(tel.NUMERO);
  return { motivo: '', telefono: tel, plantilla, avisosPrevios: previos };
}

/** Clientes ordenados para la tanda: primero los de contacto guardado (PRIORIZAR_GUARDADOS), luego por zona. */
export function ordenarTanda(lista, cfg) {
  const prior = !/^N/i.test(String(cfg.PRIORIZAR_GUARDADOS || 'SI'));
  return lista.slice().sort((a, b) => (prior ? (b.guardado ? 1 : 0) - (a.guardado ? 1 : 0) : 0) || String(a.zona).localeCompare(String(b.zona)) || String(a.nombre).localeCompare(String(b.nombre)));
}

// ---------------------------------------------------------------- tanda a partir de los datos del celular
/** Último informe aplicado { ID_INFORME, PERIODO, F_APLICADO } o null. Dd = objeto D de datos.js */
export const ultimoInforme = (Dd) => (Dd.informes || []).filter((i) => i.ESTADO === 'APLICADO').sort((a, b) => String(b.ID_INFORME).localeCompare(String(a.ID_INFORME)))[0] || null;
const esAviso = (m) => m.ESTADO === 'ENVIADO' && m.AVISO_NIVEL !== '' && m.AVISO_NIVEL !== null && m.AVISO_NIVEL !== undefined && Number(m.AVISO_NIVEL) > 0;
function enNoEnviarD(Dd, c) {
  return (Dd.noEnviar || []).some((n) => (n.TIPO === 'DNI' && c.DNI && String(n.VALOR) === String(c.DNI)) || (n.TIPO === 'CLIENTE' && n.VALOR === c.ID_CLIENTE));
}

/**
 * Lista de la tanda: { elegibles: [...], excluidos: [...], periodo }.
 * filtros = { zona: '' | 'KIATARI', estado: '' | 'Moroso 1 mes' …, nivel: '' | '0' | '1' | '2' }
 */
export function candidatosTanda(Dd, cfg, hoy, filtros = {}) {
  const inf = ultimoInforme(Dd), periodo = inf ? inf.PERIODO : hoy.slice(0, 7);
  const porNumero = {};
  Object.entries(Dd.mensajes || {}).forEach(([id, ms]) => ms.filter(esAviso).forEach((m) => {
    const f = String(m.F_RESULTADO).slice(0, 10);
    if (!porNumero[m.NUMERO] || porNumero[m.NUMERO].f < f) porNumero[m.NUMERO] = { f, id };
  }));
  const vistos = new Set(), elegibles = [], excluidos = [];
  for (const c of Dd.clientes || []) {
    const e = (Dd.estados || {})[c.ID_CLIENTE] || {};
    if (filtros.zona && c.ZONA !== filtros.zona) continue;
    if (filtros.estado && e.ESTADO !== filtros.estado) continue;
    const enviados = ((Dd.mensajes || {})[c.ID_CLIENTE] || []).filter(esAviso);
    const gestiones = (Dd.gestiones || []).filter((g) => g.ID_CLIENTE === c.ID_CLIENTE).sort((a, b) => String(b.FECHA).localeCompare(String(a.FECHA)));
    const otros = {};
    Object.entries(porNumero).forEach(([n, v]) => { if (v.id !== c.ID_CLIENTE) otros[n] = v.f; });
    const r = evaluarAviso({ cliente: c, estado: e, telefonos: ((Dd.telefonos || {})[c.ID_CLIENTE] || []).slice().sort((a, b) => Number(a.ORDEN) - Number(b.ORDEN)),
      noEnviar: enNoEnviarD(Dd, c), ultimaGestion: gestiones[0] || null, enviados, enviosPorNumero: otros, plantillas: Dd.plantillas || [], cfg, hoy, vistos });
    if (filtros.nivel !== undefined && filtros.nivel !== '' && String(r.avisosPrevios) !== String(filtros.nivel) && !r.motivo) continue;
    const base = { idCliente: c.ID_CLIENTE, nombre: c.NOMBRES || c.ID_CLIENTE, zona: c.ZONA || '', guardado: c.CONTACTO_GUARDADO === 'SI', monto: Number(e.MONTO) || 0, estado: e.ESTADO || '' };
    if (r.motivo) { excluidos.push(Object.assign(base, { motivo: r.motivo })); continue; }
    const p = (Dd.plantillas || []).find((x) => x.NOMBRE === r.plantilla) || {};
    const texto = armarMensaje(p.TEXTO, { idCliente: c.ID_CLIENTE, nombre: c.NOMBRES, servicio: c.SERVICIO, meses: e.MESES, monto: e.MONTO, plan: e.PLAN, zona: c.ZONA }, cfg, periodo, hoy);
    elegibles.push(Object.assign(base, { telefono: r.telefono, plantilla: r.plantilla, avisoNivel: r.avisosPrevios + 1, texto }));
  }
  return { elegibles: ordenarTanda(elegibles, cfg), excluidos, periodo };
}

/**
 * Confirmaciones de pago (P8): clientes que salieron del último informe o bajaron su deuda frente al anterior,
 * a los que todavía no se les mandó CONFIRMACION_PAGO después de ese informe. La persona decide cada envío.
 */
export function candidatosConfirmacion(Dd, cfg, hoy) {
  const aplicados = (Dd.informes || []).filter((i) => i.ESTADO === 'APLICADO').sort((a, b) => String(b.ID_INFORME).localeCompare(String(a.ID_INFORME)));
  if (aplicados.length < 2) return [];
  const [ult, ant] = aplicados, desde = String(ult.F_APLICADO || '').slice(0, 10);
  const deuda = (idInf) => { const d = {}; Object.entries(Dd.lineas || {}).forEach(([id, ls]) => ls.filter((l) => l.ID_INFORME === idInf).forEach((l) => { d[id] = (d[id] || 0) + Number(l.MONTO); })); return d; };
  const dUlt = deuda(ult.ID_INFORME), dAnt = deuda(ant.ID_INFORME);
  const p = (Dd.plantillas || []).find((x) => x.NOMBRE === 'CONFIRMACION_PAGO' && x.ACTIVA !== 'No');
  if (!p) return [];
  const out = [];
  for (const c of Dd.clientes || []) {
    const id = c.ID_CLIENTE, antes = dAnt[id], ahora = dUlt[id] || 0;
    if (antes === undefined || ahora >= antes) continue;
    const ya = ((Dd.mensajes || {})[id] || []).some((m) => m.PLANTILLA === 'CONFIRMACION_PAGO' && ['ENVIADO', 'PREPARADO'].includes(m.ESTADO) && String(m.F_RESULTADO).slice(0, 10) >= desde);
    if (ya || enNoEnviarD(Dd, c)) continue;
    const tels = ((Dd.telefonos || {})[id] || []).filter((t) => t.ACTIVO !== 'No' && t.NUMERO_EQUIVOCADO !== 'Sí').sort((a, b) => Number(a.ORDEN) - Number(b.ORDEN));
    const tel = tels.find((t) => t.WHATSAPP === 'SI') || tels.find((t) => t.WHATSAPP !== 'NO') || null;
    out.push({ idCliente: id, nombre: c.NOMBRES || id, zona: c.ZONA || '', antes, ahora, salio: !dUlt[id], telefono: tel,
      texto: armarMensaje(p.TEXTO, { idCliente: id, nombre: c.NOMBRES, servicio: c.SERVICIO, meses: 0, monto: ahora, zona: c.ZONA }, cfg, ult.PERIODO, hoy) });
  }
  return out.sort((a, b) => (b.salio - a.salio) || String(a.zona).localeCompare(String(b.zona)));
}
