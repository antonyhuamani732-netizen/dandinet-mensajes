// LECTOR DE "MACRO PARA MENSAJE v2.xlsm" para la PRIMERA CARGA (fase 2) — funciones puras.
// Toma lo que la macro ya sabe y que no debe perderse (docs/ESPECIFICACION.md, sección 3.7):
//   CLIENTES (columnas amarillas: teléfonos y su WhatsApp, dirección, referencia, marcas, gestión),
//   NUMEROS (qué número tiene WhatsApp), HISTORIAL_ENVIOS, NO_ENVIAR, PLANTILLAS y CONFIG.
// Entrada: { hojas: [{ nombre, filas }] } (SheetJS, header: 1). En la macro los encabezados están en la fila 4.
import { claveTexto, txt, normalizarNumero, aNumero } from './informe.js';

const FILA_ENC = 3;     // fila 4 de la hoja (base 0)

/** Filas de una hoja como objetos { 'CLAVE TEXTO DEL ENCABEZADO': valor }. */
function tabla(hojas, nombre) {
  const h = hojas.find((x) => claveTexto(x.nombre) === claveTexto(nombre));
  if (!h || !h.filas || h.filas.length <= FILA_ENC) return null;
  const enc = h.filas[FILA_ENC].map((e) => claveTexto(txt(e)));
  return h.filas.slice(FILA_ENC + 1)
    .filter((r) => r && r.some((v) => txt(v)))
    .map((r) => Object.fromEntries(enc.map((e, i) => [e, r[i] === undefined ? '' : r[i]]).filter(([e]) => e)));
}

/** Valor por el comienzo del encabezado ("WHATSAPP TELEFONO 1" → 'WHATSAPP TELEFONO 1'). */
const de = (fila, inicio) => { const k = Object.keys(fila).find((e) => e.startsWith(claveTexto(inicio))); return k ? fila[k] : ''; };
const fechaIso = (v) => (v instanceof Date && !isNaN(v) ? new Date(v.getTime() - v.getTimezoneOffset() * 6e4).toISOString().slice(0, 19) : '');
const wa = (v) => (/^CON/i.test(txt(v)) ? 'SI' : /^SIN/i.test(txt(v)) ? 'NO' : '');
const si = (v) => /^S[IÍ]$/i.test(txt(v));

/** Estados viejos de la macro → actuales (modBase.EstadoNuevo). */
const ESTADO_NUEVO = { 'MOROSO 1 30': 'Moroso 1 mes', 'MOROSO 31 60': 'Moroso 2 meses', 'MOROSO 60': 'Moroso 3+ meses' };

export function leerMacro({ hojas }) {
  const avisos = [];
  const C = tabla(hojas, 'CLIENTES');
  if (!C) throw new Error('El archivo no tiene la hoja CLIENTES de la macro (¿es "MACRO PARA MENSAJE v2.xlsm"?).');

  const clientes = C.map((f) => ({
    dni: txt(de(f, 'Clave')).replace(/\D/g, ''),
    nombre: txt(de(f, 'Cliente')),
    telefonos: [1, 2, 3].map((k) => ({ numero: normalizarNumero(txt(de(f, 'Telefono ' + k))), whatsapp: wa(de(f, 'WhatsApp telefono ' + k)) }))
      .filter((t) => t.numero),
    direccion: txt(de(f, 'Direccion')), referencia: txt(de(f, 'Referencia')),
    contactoGuardado: si(de(f, 'Contacto guardado')), noEnviar: si(de(f, 'No enviar')),
    noEnviarHasta: fechaIso(de(f, 'No enviar hasta')).slice(0, 10),
    gestion: txt(de(f, 'Estado de gestion')), nota: txt(de(f, 'Observacion de gestion')),
    fGestion: fechaIso(de(f, 'Ultima gestion')), montoVerificado: si(de(f, 'Monto verificado')),
    // fase 7 (cuadre con la app): lo que la macro calcula para cada cliente
    zona: txt(de(f, 'Zona')).toUpperCase(), servicio: txt(de(f, 'Servicio')),
    estado: ESTADO_NUEVO[claveTexto(txt(de(f, 'Estado')))] || txt(de(f, 'Estado')),
    meses: aNumero(de(f, 'Meses adeudados')), monto: aNumero(de(f, 'Monto total')), plan: aNumero(de(f, 'Plan')),
    resultadoEnvio: txt(de(f, 'Resultado del envio')), ultimoEnvio: fechaIso(de(f, 'Ultimo envio')).slice(0, 10),
  })).filter((c) => c.dni || c.nombre);

  const numeros = (tabla(hojas, 'NUMEROS') || []).map((f) => ({
    numero: normalizarNumero(txt(de(f, 'Numero'))), whatsapp: wa(de(f, 'WhatsApp')), fecha: fechaIso(de(f, 'Fecha')), origen: txt(de(f, 'Origen')),
  })).filter((n) => n.numero && n.whatsapp);

  const historial = (tabla(hojas, 'HISTORIAL_ENVIOS') || []).map((f) => {
    const est = txt(de(f, 'Estado del cliente'));
    return {
      fecha: fechaIso(de(f, 'Fecha')), dni: txt(de(f, 'Clave')).replace(/\D/g, ''), nombre: txt(de(f, 'Cliente')),
      numero: normalizarNumero(txt(de(f, 'Numero'))), plantilla: txt(de(f, 'Plantilla')),
      estadoCliente: ESTADO_NUEVO[claveTexto(est)] || est, meses: aNumero(de(f, 'Meses')), monto: aNumero(de(f, 'Monto')),
      modo: txt(de(f, 'Modo')), resultado: txt(de(f, 'Resultado')), detalle: txt(de(f, 'Detalle')), archivo: txt(de(f, 'Archivo')),
      nota: txt(de(f, 'Gestion')), celular: txt(de(f, 'Envio')),
    };
  }).filter((h) => h.fecha);

  const noEnviar = (tabla(hojas, 'NO_ENVIAR') || []).map((f) => ({
    nombre: txt(de(f, 'Nombre')), dni: txt(de(f, 'DNI')).replace(/\D/g, ''), telefono: normalizarNumero(txt(de(f, 'Telefono'))),
    motivo: txt(de(f, 'Motivo')), fecha: fechaIso(de(f, 'Fecha')),
  })).filter((n) => n.nombre || n.dni || n.telefono);

  const plantillas = (tabla(hojas, 'PLANTILLAS') || []).map((f) => ({
    nombre: txt(de(f, 'Clave')), estados: txt(de(f, 'Estados')), texto: String(de(f, 'Texto') || ''), cuando: txt(de(f, 'Cuando')),
  })).filter((p) => p.nombre && p.texto);

  const config = {};
  for (const f of tabla(hojas, 'CONFIG') || []) {
    const k = txt(de(f, 'Clave'));
    if (k && !k.startsWith('--')) config[k] = typeof de(f, 'Valor') === 'number' ? String(de(f, 'Valor')) : txt(de(f, 'Valor')).replace(/\r?\n/g, '\\n');
  }
  if (!numeros.length) avisos.push('La hoja NUMEROS está vacía.');
  return { clientes, numeros, historial, noEnviar, plantillas, config, avisos };
}
