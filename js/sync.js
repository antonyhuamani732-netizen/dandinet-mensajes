// SINCRONIZACIÓN Y COLA DE ENVÍO (tomado de PROYECTO_APP)
// Todo lo que se registra en el celular va primero a la COLA (IndexedDB). Si hay señal
// se envía de inmediato; si no, queda "por enviar" y se envía solo al volver la conexión.
// Cada operación tiene un idSolicitud único: reenviarla nunca la duplica.
// Formato de una operación: { idSolicitud, tipo, datos: {...}, fDispositivo, offline }
import { CONFIG } from './config.js';
import { llamar } from './api.js';
import { kvGet, kvSet, kvDel, kvClaves, colaPut, colaTodos, colaVaciar, colaBorrar } from './db.js';
import { aplicar, ahoraISO } from './datos.js';

let _enCurso = null;
let _ultimoInicio = 0;
const oyentes = new Set();
export const alCambiar = (fn) => oyentes.add(fn);
const avisar = (info) => oyentes.forEach((fn) => { try { fn(info); } catch (e) { /* vista */ } });

/** Guarda una operación en la cola y, si hay señal, la envía. */
export async function encolar(tipo, datos = {}) {
  const op = { idSolicitud: crypto.randomUUID(), tipo, datos, fDispositivo: ahoraISO(), estadoLocal: 'pendiente', offline: !navigator.onLine };
  await colaPut(op);
  avisar({ tipo: 'cola' });
  if (navigator.onLine) sincronizarTodo().catch(() => {});
  return op;
}

export async function pendientesDeEnvio() {
  return (await colaTodos()).filter((o) => o.estadoLocal === 'pendiente' || o.estadoLocal === 'enviado' || o.estadoLocal === 'error');
}

/** El sistema pasó a otro libro (de PRUEBAS al definitivo): se borra lo del anterior para no mezclar. */
async function limpiarPorCambioDeLibro(nuevo) {
  await colaVaciar();
  for (const k of await kvClaves()) if (/^(cache_)/.test(String(k))) await kvDel(k);
  await kvSet('libroId', nuevo);
  avisar({ tipo: 'libro' });
}

/** Envía la cola y luego descarga datos frescos. Evita ejecuciones simultáneas. */
export function sincronizarTodo() {
  if (_enCurso) return _enCurso;
  _ultimoInicio = Date.now();
  _enCurso = (async () => {
    avisar({ tipo: 'inicio' });
    try {
      await enviarCola();
      const s = await llamar('sincronizar');
      const antes = await kvGet('libroId');
      if (s.libro && antes && antes !== s.libro) await limpiarPorCambioDeLibro(s.libro);
      if (s.libro) await kvSet('libroId', s.libro);
      await kvSet('datos', s);
      await kvSet('ultimaSync', ahoraISO());
      aplicar(s);
      // lo ya procesado hace más de 7 días se retira del historial local
      const limite = Date.now() - 7 * 864e5;
      for (const o of await colaTodos()) if ((o.estadoLocal === 'ok' || o.estadoLocal === 'rechazado') && Date.parse(o.fDispositivo) < limite) await colaBorrar(o.idSolicitud);
      avisar({ tipo: 'fin', ok: true });
    } catch (e) {
      avisar({ tipo: 'fin', ok: false, error: e });
      throw e;
    } finally {
      _enCurso = null;
    }
  })();
  return _enCurso;
}

async function enviarCola() {
  const pend = (await pendientesDeEnvio()).sort((a, b) => String(a.fDispositivo).localeCompare(String(b.fDispositivo)));
  for (let i = 0; i < pend.length; i += CONFIG.LOTE_ENVIO) {
    const lote = pend.slice(i, i + CONFIG.LOTE_ENVIO);
    const envio = lote.map((o) => ({ idSolicitud: o.idSolicitud, tipo: o.tipo, datos: o.datos, fDispositivo: o.fDispositivo, offline: o.offline }));
    let r;
    try {
      r = await llamar('enviarCola', { operaciones: envio, libro: (await kvGet('libroId')) || '' });
    } catch (e) {
      if (e.codigo === 'RED') { for (const o of lote) { o.offline = true; await colaPut(o); } }
      else if (e.codigo !== 'AUTH') {
        for (const o of lote) { o.estadoLocal = 'error'; o.intentos = (o.intentos || 0) + 1; o.resultado = { mensaje: e.message }; await colaPut(o); }
      }
      throw e;
    }
    if (r.libroCambiado) { await limpiarPorCambioDeLibro(r.libro); return; }
    for (const res of r.resultados) {
      const o = lote.find((x) => x.idSolicitud === res.idSolicitud);
      if (!o) continue;
      o.resultado = res;
      o.estadoLocal = res.estado === 'PROCESADO' ? 'ok' : res.estado === 'RECHAZADO' ? 'rechazado' : 'enviado';
      await colaPut(o);
    }
    avisar({ tipo: 'cola' });
  }
}

/** Sincronización automática: al abrir, al volver la señal y cada N minutos. */
export function iniciarAutoSync() {
  window.addEventListener('online', () => { avisar({ tipo: 'red' }); sincronizarTodo().catch(() => {}); });
  window.addEventListener('offline', () => avisar({ tipo: 'red' }));
  setInterval(() => { if (navigator.onLine && document.visibilityState === 'visible') sincronizarTodo().catch(() => {}); },
    CONFIG.SYNC_CADA_MIN * 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine && Date.now() - _ultimoInicio > 60000) sincronizarTodo().catch(() => {});
  });
}
