// CUADRE CON LA MACRO (fase 7: un mes en paralelo) — funciones puras, se prueban en la PC.
// Compara cliente por cliente lo que calcula la app con lo que dice "MACRO PARA MENSAJE v2.xlsm"
// (leída con macro.js) después de importar el MISMO informe en las dos.
// Diferencias esperadas (no son errores) se marcan como "explicada": datos corregidos 🔒 en la app,
// teléfonos agregados en la app, avisos enviados desde la app después de la última copia de la macro.
import { claveTexto } from './informe.js';
import { telefonosDe, enNoEnviar } from './datos.js';

const num = (x) => Number(x) || 0;
const n9 = (t) => String(t || '').replace(/\D/g, '').slice(-9);

export const CAMPOS_CUADRE = {
  falta: 'Está en un lado y no en el otro', monto: 'Monto de la deuda', meses: 'Meses de deuda', estado: 'Estado',
  zona: 'Zona', telefonos: 'Teléfonos', whatsapp: 'WhatsApp de un número', noenviar: 'NO ENVIAR', aviso: 'Último aviso',
};

/**
 * D: datos de la app (administrador: tiene DNI). macro: resultado de leerMacro().
 * Devuelve { resumen, diferencias: [{ id, nombre, campo, app, macro, explicada }], porCampo, cuadra }.
 */
export function cuadrarConMacro(D, macro) {
  const porDni = new Map(), porNombre = new Map();
  D.clientes.forEach((c) => { if (c.DNI) porDni.set(String(c.DNI).replace(/\D/g, ''), c); porNombre.set(claveTexto(c.NOMBRES), c); });
  const enDeuda = (c) => c.ESTADO_INFORME !== 'AL_DIA_SALIO' && num((D.estados[c.ID_CLIENTE] || {}).MONTO) > 0;
  const dif = [], vistos = new Set();
  const anota = (c, m, campo, app, mac, explicada = '') => dif.push({ id: c ? c.ID_CLIENTE : '', nombre: c ? c.NOMBRES : m.nombre, campo, app: String(app ?? ''), macro: String(mac ?? ''), explicada });
  let totalMacro = 0, enMacro = 0;

  for (const m of macro.clientes) {
    if (!(num(m.monto) > 0)) continue;                       // la macro también lista clientes al día
    enMacro++; totalMacro += num(m.monto);
    const c = (m.dni && porDni.get(m.dni)) || porNombre.get(claveTexto(m.nombre));
    if (!c || !enDeuda(c)) { anota(c, m, 'falta', c ? 'sin deuda en la app' : 'no está', 'con deuda'); continue; }
    vistos.add(c.ID_CLIENTE);
    const e = D.estados[c.ID_CLIENTE] || {};
    if (Math.abs(num(e.MONTO) - num(m.monto)) > 0.005) anota(c, m, 'monto', num(e.MONTO).toFixed(2), num(m.monto).toFixed(2));
    if (num(e.MESES) !== num(m.meses)) anota(c, m, 'meses', num(e.MESES), num(m.meses));
    if (m.estado && e.ESTADO !== m.estado) anota(c, m, 'estado', e.ESTADO, m.estado);
    if (m.zona && String(c.ZONA || '').toUpperCase() !== m.zona) anota(c, m, 'zona', c.ZONA, m.zona,
      'ZONA' in (c.corregido || {}) ? 'corregida en la app 🔒' : String(c.SECTOR || '').toUpperCase() === m.zona ? 'la macro usa el sector; la app lo guarda aparte' : '');
    // teléfonos: los de la macro deben estar en la app (la app puede tener más)
    const T = telefonosDe(c.ID_CLIENTE), app = new Map(T.todos.filter((t) => t.ACTIVO !== 'No').map((t) => [n9(t.NUMERO), t]));
    const faltan = m.telefonos.filter((t) => !app.has(n9(t.numero)));
    if (faltan.length) anota(c, m, 'telefonos', [...app.keys()].join(' / '), m.telefonos.map((t) => n9(t.numero)).join(' / '),
      T.todos.some((t) => t.ACTIVO === 'No' && faltan.some((f) => n9(f.numero) === n9(t.NUMERO))) ? 'quitado en la app' : '');
    for (const t of m.telefonos) {
      const a = app.get(n9(t.numero));
      if (a && t.whatsapp && (a.WHATSAPP === 'SI' ? 'SI' : a.WHATSAPP === 'NO' ? 'NO' : '') !== t.whatsapp)
        anota(c, m, 'whatsapp', `${n9(t.numero)}: ${a.WHATSAPP || 'por verificar'}`, `${n9(t.numero)}: ${t.whatsapp}`, a.F_VERIF ? 'verificado después en la app' : '');
    }
    if (!!m.noEnviar !== enNoEnviar(c.ID_CLIENTE)) anota(c, m, 'noenviar', enNoEnviar(c.ID_CLIENTE) ? 'Sí' : 'No', m.noEnviar ? 'Sí' : 'No');
    const ua = String(e.ULT_AVISO || '').slice(0, 10);
    if (m.ultimoEnvio && ua !== m.ultimoEnvio) {
      const intento = (D.mensajes[c.ID_CLIENTE] || []).some((x) => String(x.F_RESULTADO).slice(0, 10) === m.ultimoEnvio && x.ESTADO !== 'ENVIADO');
      anota(c, m, 'aviso', ua || '—', m.ultimoEnvio, ua > m.ultimoEnvio ? 'avisado después desde la app' : intento ? 'la macro cuenta un intento que no salió; la app no lo cuenta como aviso' : '');
    }
  }
  const soloApp = D.clientes.filter((c) => enDeuda(c) && !vistos.has(c.ID_CLIENTE));
  soloApp.forEach((c) => anota(c, null, 'falta', 'con deuda', 'no está en la macro'));

  const porCampo = Object.fromEntries(Object.keys(CAMPOS_CUADRE).map((k) => [k, { total: 0, sinExplicar: 0 }]));
  dif.forEach((d) => { porCampo[d.campo].total++; if (!d.explicada) porCampo[d.campo].sinExplicar++; });
  const totalApp = D.clientes.filter(enDeuda).reduce((s, c) => s + num(D.estados[c.ID_CLIENTE].MONTO), 0);
  const graves = ['falta', 'monto', 'meses', 'estado'].reduce((s, k) => s + porCampo[k].sinExplicar, 0);
  return {
    resumen: { clientesApp: D.clientes.filter(enDeuda).length, clientesMacro: enMacro, totalApp, totalMacro,
      diferencias: dif.length, sinExplicar: dif.filter((d) => !d.explicada).length, graves },
    diferencias: dif, porCampo,
    cuadra: graves === 0 && Math.abs(totalApp - totalMacro) < 0.005,
  };
}
