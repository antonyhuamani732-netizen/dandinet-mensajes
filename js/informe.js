// LECTOR DEL INFORME DE LA EMPRESA X (Excel de pendientes) — funciones puras.
// Portado de la macro "MACRO PARA MENSAJE v2" (modImportar, modTelefonos, modDirectorio,
// modTecnico, modReporte) con las MISMAS reglas, para que el resultado cuadre con ella.
//
// Entrada: { nombreArchivo, hojas: [{ nombre, filas: [[celda, ...], ...] }] }
//   (las filas salen de SheetJS: XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }),
//    con cellDates: true para que las fechas lleguen como Date)
// Salida: { periodo:'AAAA-MM', hayMes, filas:[...], total, totalOriginal, duplicadas, hojas, avisos:[...] }
// Se usa en el navegador (pantalla Importar) y en las pruebas locales (Node).

// ---------------------------------------------------------------- texto
export const unEspacio = (s) => String(s === null || s === undefined ? '' : s).replace(/\s+/g, ' ').trim();
export const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Clave para comparar textos: mayúsculas, sin tildes ni signos, un espacio. (ClaveTexto de la macro) */
export const claveTexto = (s) => unEspacio(sinAcentos(s).toUpperCase().replace(/[^A-Z0-9Ñ ]/g, ' '));
const soloDigitos = (s) => String(s || '').replace(/\D/g, '');
const hayLetras = (s) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(String(s || ''));
const esFecha = (v) => Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());

/** Texto de una celda (números enteros sin ".0"). */
export function txt(v) {
  if (v === null || v === undefined) return '';
  if (esFecha(v)) return fechaIso(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

/** Número de una celda ("1,234.50", "30", 30) o null si no es número. (ANumero) */
export function aNumero(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v === null || v === undefined ? '' : v).trim().replace(/^S\/\s*/i, '');
  if (!s) return null;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');      // 1,234.50
  else s = s.replace(',', '.');                                             // 12,5
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

const fechaIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Fecha de instalación: Date, "22/08/2026 18:44", "2026-08-22" o número de serie de Excel → 'AAAA-MM-DD' o ''. */
export function aFecha(v) {
  if (esFecha(v)) return fechaIso(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) return fechaIso(new Date(Math.round((v - 25569) * 864e5) + new Date().getTimezoneOffset() * 6e4));
  const s = txt(v); let m;
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

// ---------------------------------------------------------------- teléfonos (modTelefonos)
/** 9 dígitos del celular peruano o '' si el formato no es válido. */
export function normalizarNumero(token) {
  let d = soloDigitos(token);
  if (d.length === 13 && d.startsWith('0051')) d = d.slice(4);
  if (d.length === 11 && d.startsWith('51')) d = d.slice(2);
  return d.length === 9 && d[0] === '9' ? d : '';
}
export const internacional = (nueve) => (nueve && nueve.length === 9 ? '+51' + nueve : '');

/** Separa una celda de teléfonos en válidos e inválidos (varios por coma, ; / - o salto de línea). */
export function extraerTelefonos(valor) {
  const validos = [], invalidos = [];
  const agregar = (arr, x) => { if (!arr.includes(x)) arr.push(x); };
  if (valor === null || valor === undefined || valor === '' || esFecha(valor)) return { validos, invalidos };
  let s = typeof valor === 'number' ? String(Math.round(valor)) : String(valor).trim();
  if (!s || (s.includes('/') && s.includes(':'))) return { validos, invalidos };   // una fecha escrita como texto
  for (const parte of s.split(/[\r\n,;/-]+/)) {
    const d = soloDigitos(parte);
    if (!d) continue;
    const n = normalizarNumero(d);
    if (n) { agregar(validos, n); continue; }
    if (d.length > 9 && d.length % 9 === 0) {                                     // varios números pegados
      const trozos = d.match(/.{9}/g);
      if (trozos.every((t) => normalizarNumero(t))) { trozos.forEach((t) => agregar(validos, t)); continue; }
    }
    agregar(invalidos, d);
  }
  return { validos, invalidos };
}

/** Celulares escritos dentro de un texto libre (por ejemplo la dirección): "900 111 222". */
export function telefonosEnTexto(s) {
  const out = [];
  for (const m of String(s || '').matchAll(/\d(?:[\d]| (?=\d))*/g)) {
    const n = normalizarNumero(m[0].replace(/ /g, ''));
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

// ---------------------------------------------------------------- nombre y servicio
/** "JUAN PEREZ - TV CABLE DANIEL" → { nombre: 'JUAN PEREZ', servicio: 'TV CABLE' } (LimpiarNombre) */
export function limpiarNombre(texto) {
  let s = unEspacio(texto);
  const u = sinAcentos(s).toUpperCase();
  let servicio = '';
  const p = u.indexOf('TV CABLE');
  const mDuo = /(^|[^A-ZÑ])DUO($|[^A-ZÑ])/.exec(u);
  const q = mDuo ? mDuo.index + mDuo[1].length : -1;
  if (q >= 0) servicio = 'DUO'; else if (p >= 0) servicio = 'TV CABLE';
  let corte = p;
  if (q >= 0 && (p < 0 || q < p)) corte = q;
  if (corte >= 0) s = s.slice(0, corte);
  s = s.replace(/[\s\-(_.,0-9]+$/, '');
  return { nombre: s.trim(), servicio };
}

// ---------------------------------------------------------------- dirección, referencia y GPS
const RE_GPS = /(-?\d{1,2}\.\d{4,})\s*[,;]?\s+(-?\d{1,3}\.\d{4,})|(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})/;

/** Coordenadas escritas en la dirección ("-11.6630, -74.2852") → 'lat,lng' o ''. Solo rango de Perú. */
export function extraerGps(s) {
  const m = RE_GPS.exec(String(s || ''));
  if (!m) return '';
  const lat = Number(m[1] || m[3]), lng = Number(m[2] || m[4]);
  return lat < 0 && lat > -19 && lng < -68 && lng > -82 ? `${lat},${lng}` : '';
}

/** Quita celulares, coordenadas, comas sobrantes y texto repetido. (DireccionLimpia de modTecnico) */
export function direccionLimpia(raw) {
  let s = unEspacio(raw);
  if (!s) return '';
  s = unEspacio(s.replace(/(\+?\s?51[\s-]?)?9\d{2}[\s-]?\d{3}[\s-]?\d{3}/g, ' '));
  s = unEspacio(s.replace(new RegExp(RE_GPS.source, 'g'), ' '));
  while (s.includes(', ,')) s = s.replace(', ,', ',');
  while (s.includes(',,')) s = s.replace(',,', ',');
  s = s.replace(/ ,/g, ',').replace(/[\s,;.-]+$/, '').replace(/^[\s,;.-]+/, '');
  if (!hayLetras(s)) return '';
  const h = Math.floor(s.length / 2);                                             // el informe a veces repite la dirección
  if (s.length % 2 === 0 && h > 5 && s.slice(0, h) === s.slice(h)) s = s.slice(0, h);
  else if (s.length % 2 === 1 && h > 5 && s[h] === ' ' && s.slice(0, h) === s.slice(h + 1)) s = s.slice(0, h);
  return s;
}

/** "ALTO KIATARI REF: FRENTE AL GRIFO" → { direccion: 'ALTO KIATARI', referencia: 'FRENTE AL GRIFO' } (SepararDireccion) */
export function separarDireccion(raw, zona) {
  const s = direccionLimpia(raw);
  let direccion = '', referencia = '';
  if (!s) return { direccion, referencia };
  const re = /\s*[(\-,;:]?\s*\b(REFERENCIAS?|REFERENC\.?|REF)\b\s*[.:\-)]*\s*/i;
  const m = re.exec(s);
  if (m) {
    direccion = s.slice(0, m.index).trim();
    referencia = s.slice(m.index + m[0].length).trim();
  } else {
    const m2 = /^(.{0,60}?\b(MZ|MZA|MANZANA|LT|LOTE|JR|JIRON|AV|AVENIDA|CALLE|PSJE|PASAJE)\b[.\s]*[A-Z0-9ÑÁÉÍÓÚ°-]{1,5}(\s+(LT|LOTE|N°|NRO|S\/N)[.\s]*[A-Z0-9°-]{0,5})?)\s+(.+)$/i.exec(s);
    if (m2) { direccion = m2[1].trim(); referencia = m2[5].trim(); } else referencia = s;
  }
  direccion = direccion.replace(/[\s,;.\-:]+$/, '');
  // el sector (alto, bajo, boca...) nunca debe perderse
  if (!direccion && unEspacio(zona) && !referencia.toUpperCase().includes(unEspacio(zona).toUpperCase())) direccion = unEspacio(zona);
  return { direccion, referencia };
}

// ---------------------------------------------------------------- encabezados (FilaEncabezado)
const COLS = ['nombre', 'dni', 'zona', 'direccion', 'telefono', 'fecha', 'plan', 'meses', 'monto', 'pppoe'];

/** Busca la fila de encabezados entre las 15 primeras. Devuelve { fila, mapa } o null. */
export function filaEncabezado(filas) {
  for (let f = 0; f < Math.min(filas.length, 15); f++) {
    const m = {};
    (filas[f] || []).forEach((celda, c) => {
      const h = claveTexto(txt(celda));
      if (!h) return;
      const pon = (k) => { if (m[k] === undefined) m[k] = c; };
      if (h.includes('TELEF') || h.includes('CELULAR') || h.includes('WHATSAPP')) pon('telefono');
      else if (h.includes('FECHA')) pon('fecha');
      else if (h === 'DN' || h.includes('DNI') || h.includes('DOCUMENTO')) pon('dni');
      else if (h.includes('DIRECCION')) pon('direccion');
      else if (h.includes('PPPOE') || h.includes('USUARIO')) pon('pppoe');
      else if (h.includes('CIUDAD') || h.includes('LUGAR') || h.includes('ZONA') || h.includes('MUNICIPIO')) pon('zona');
      else if (h.includes('PENDIENTE') || h.includes('MESES')) pon('meses');
      else if (h.includes('MONTO') || h.includes('TOTAL') || h.includes('DEUDA')) pon('monto');
      else if (h.includes('PLAN') || h.includes('PRECIO')) pon('plan');
      else if (h.includes('NOMBRE') || h.includes('CLIENTE')) pon('nombre');
    });
    if (m.nombre !== undefined && (m.telefono !== undefined || m.monto !== undefined)) return { fila: f, mapa: m };
  }
  return null;
}

// ---------------------------------------------------------------- mes del informe
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
/** "PENDIENTES DE PAGO HASTA OCTUBRE 2026.xlsx" → { periodo: '2026-10', hayMes: true } */
export function periodoDesdeNombre(nombre, hoy = new Date()) {
  const u = claveTexto(nombre);
  let mes = 0;
  MESES.forEach((m, i) => { if (u.includes(m)) mes = i + 1; });
  if (u.includes('SEPTIEMBRE')) mes = 9;
  const a = /20\d\d/.exec(u);
  const hayMes = mes > 0;
  const anio = a ? Number(a[0]) : hoy.getFullYear();
  if (!mes) mes = hoy.getMonth() + 1;
  return { periodo: `${anio}-${String(mes).padStart(2, '0')}`, hayMes };
}

// ---------------------------------------------------------------- monto por revisar
/** OK / Ajuste / REVISAR / Sin dato (misma regla que la macro). */
export function revisarMonto(plan, meses, monto) {
  if (monto === null) return 'REVISAR';
  if (plan === null || meses === null) return 'Sin dato';
  const esp = plan * meses;
  if (Math.abs(monto - esp) < 0.005) return 'OK';
  if (esp > 0 && (monto > esp * 1.5 || monto < esp * 0.5)) return 'REVISAR';
  return 'Ajuste';
}

// ---------------------------------------------------------------- lectura completa
/**
 * Lee todas las hojas. Cada fila válida queda así:
 * { hoja, fila, nombreExcel, nombres, servicio, dni, sector, direccionExcel, direccion, referencia, gps,
 *   telefonos:[9 dígitos], telInvalidos:[], fInstalacion, plan, meses, monto, revision, obs, original:{...} }
 */
export function leerInforme({ nombreArchivo, hojas }, hoy = new Date()) {
  const avisos = [], filas = [], firmas = new Set();
  let totalOriginal = 0, total = 0, duplicadas = 0, hojasLeidas = 0;
  for (const h of hojas) {
    const datos = h.filas || [];
    const enc = filaEncabezado(datos);
    if (!enc) { if (datos.some((r) => r && r.some((c) => txt(c)))) avisos.push(`Hoja "${h.nombre}" omitida: no se reconocen los encabezados.`); continue; }
    hojasLeidas++;
    const m = enc.mapa, usadas = new Set(Object.values(m)), cab = datos[enc.fila] || [];
    const celda = (r, k) => (m[k] === undefined ? '' : r[m[k]]);
    for (let f = enc.fila + 1; f < datos.length; f++) {
      const r = datos[f] || [];
      if (!COLS.some((k) => m[k] !== undefined && txt(celda(r, k)))) continue;      // fila vacía
      // columnas sin encabezado conocido (por ejemplo observaciones): no se pierden
      const otros = [];
      r.forEach((v, c) => {
        if (usadas.has(c)) return;
        const t = unEspacio(txt(v));
        if (t) otros.push(txt(cab[c]) ? `${unEspacio(txt(cab[c]))}: ${t}` : t);
      });
      const monto = aNumero(celda(r, 'monto')), meses = aNumero(celda(r, 'meses')), plan = aNumero(celda(r, 'plan'));
      if (monto !== null) totalOriginal += monto;
      const { nombre, servicio } = limpiarNombre(txt(celda(r, 'nombre')));
      let dni = soloDigitos(txt(celda(r, 'dni')));
      if (dni.length === 6 || dni.length === 7) dni = dni.padStart(8, '0');          // DNI que perdió ceros a la izquierda
      const nombres = nombre || '(SIN NOMBRE)';
      const firma = `${dni.length >= 8 ? dni : 'N:' + claveTexto(nombres)}|${servicio}|${claveTexto(nombres)}|${monto}|${meses}`;
      if (firmas.has(firma)) { duplicadas++; avisos.push(`Hoja "${h.nombre}" fila ${f + 1}: fila repetida, se cuenta una sola vez.`); continue; }
      firmas.add(firma);
      const sector = unEspacio(txt(celda(r, 'zona'))) || unEspacio(h.nombre);
      const dirExcel = txt(celda(r, 'direccion'));
      const tel = extraerTelefonos(celda(r, 'telefono'));
      const obs = [];
      for (const n of telefonosEnTexto(dirExcel)) if (!tel.validos.includes(n)) { tel.validos.push(n); obs.push('Teléfono tomado de la dirección'); }
      if (!nombre) obs.push('Sin nombre');
      if (meses === null) obs.push(`Meses pendientes no numérico (${txt(celda(r, 'meses'))})`);
      if (monto === null) obs.push(`Monto no numérico (${txt(celda(r, 'monto'))})`);
      const revision = revisarMonto(plan, meses, monto);
      if (revision === 'REVISAR' && plan !== null && meses !== null) obs.push(`Monto esperado ${(plan * meses).toFixed(2)} (plan x meses)`);
      if (tel.invalidos.length) obs.push('Número descartado: ' + tel.invalidos.join(', '));
      const { direccion, referencia } = separarDireccion(dirExcel, sector);
      const fila = {
        hoja: unEspacio(h.nombre), fila: f + 1, nombreExcel: unEspacio(txt(celda(r, 'nombre'))), nombres, servicio, dni,
        zona: unEspacio(h.nombre).toUpperCase(), sector, direccionExcel: unEspacio(dirExcel), direccion, referencia, gps: extraerGps(dirExcel),
        telefonos: tel.validos, telInvalidos: tel.invalidos, fInstalacion: aFecha(celda(r, 'fecha')),
        plan, meses: meses === null ? 0 : meses, monto: monto === null ? 0 : monto, revision,
        obs: [...obs, ...otros].join('; '), obsExcel: otros.join(' | '),
        original: Object.fromEntries(COLS.filter((k) => m[k] !== undefined).map((k) => [k, txt(celda(r, k))])),
      };
      total += fila.monto;
      filas.push(fila);
    }
  }
  const { periodo, hayMes } = periodoDesdeNombre(nombreArchivo, hoy);
  if (!hayMes) avisos.push('El nombre del archivo no dice el mes del informe (ej. "HASTA OCTUBRE 2026"): se tomó el mes actual. Revíselo antes de aplicar.');
  const r2 = (x) => Math.round(x * 100) / 100;
  return { periodo, hayMes, hojas: hojasLeidas, filas, total: r2(total), totalOriginal: r2(totalOriginal), duplicadas, avisos };
}
