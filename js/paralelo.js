// FASE 7: UN MES EN PARALELO CON LA MACRO (solo administrador)
// - Cuadre: se sube "MACRO PARA MENSAJE v2.xlsm" (solo se LEE en el celular/PC, no se sube a ningún lado)
//   y se compara cliente por cliente con la app, después de importar el mismo informe en las dos.
// - Marcha en paralelo: lista de control con lo que falta para dejar la macro solo como consulta.
// Regla de oro del mes: los avisos salen SOLO desde la app (si salen de las dos, el cliente recibe doble).
import { D, esc, soles, txtFecha, hoyISO } from './datos.js';
import { ic } from './iconos.js';
import { ayuda, celebrar } from './ayuda.js';
import { leerExcel } from './importar.js';
import { leerMacro } from './macro.js';
import { cuadrarConMacro, CAMPOS_CUADRE } from './cuadre.js';
import { imprimir, descargarCSV } from './vistareportes.js';
import { informesAplicados } from './reportes.js';

const DIAS_PARALELO = 30;
const dia = (f) => String(f || '').slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(dia(b) + 'T12:00:00') - Date.parse(dia(a) + 'T12:00:00')) / 864e5);
async function guardarConfig(ui, valores) { await ui.encolar('GUARDAR_CONFIG', { valores }); Object.assign(D.config, valores); }
const ultimoCuadre = () => { try { return JSON.parse(D.config.CUADRE_ULTIMO || 'null'); } catch (e) { return null; } };

// ============================================================================
// MARCHA EN PARALELO
// ============================================================================
export function vParalelo(ui) {
  const hoy = hoyISO(), inicio = dia(D.config.PARALELO_INICIO), cq = ultimoCuadre();
  const n = inicio ? diasEntre(inicio, hoy) + 1 : 0;
  const ms = Object.values(D.mensajes).flat().filter((m) => m.ESTADO === 'ENVIADO' && m.USUARIO !== 'MACRO' && (!inicio || dia(m.F_RESULTADO) >= inicio));
  const visitas = D.ordenesDet.filter((d) => d.ESTADO !== 'PENDIENTE' && (!inicio || dia(d.F_EJEC) >= inicio));
  const tecnicos = D.usuarios.filter((u) => u.ROL === 'TECNICO' && u.ACTIVO !== 'No' && u.ZONAS);
  const informes = informesAplicados(D).filter((i) => !inicio || dia(i.F_APLICADO) >= inicio);
  const resp = dia(D.config.UltimoRespaldo);
  const checks = [
    [!!inicio, 'Empezar el mes en paralelo', inicio ? `desde el ${txtFecha(inicio)}` : 'toque "Empezar hoy"'],
    [informes.length >= 1, 'Importar en la app el informe del mes', informes.length ? `${informes.map((i) => i.PERIODO).join(', ')} importado` : 'importe el informe nuevo (el mismo que en la macro)', '#/importar'],
    [!!(cq && cq.cuadra && (!inicio || cq.fecha >= inicio)), 'Cuadre con la macro sin diferencias de deuda', cq ? `último: ${txtFecha(cq.fecha)} · ${cq.graves} diferencia(s) de deuda/estado · ${cq.sinExplicar} sin explicar` : 'suba la macro en "Cuadre con la macro"', '#/cuadre'],
    [ms.length >= 30, 'Avisos enviados desde la app (al menos 30)', `${ms.length} enviados${inicio ? ' en el paralelo' : ''}`, '#/envios'],
    [tecnicos.length >= 1, 'Técnicos con sus zonas', tecnicos.length ? tecnicos.map((u) => u.NOMBRE).join(', ') : 'agréguelos en Equipo y zonas', '#/equipo'],
    [visitas.length >= 1, 'Visitas registradas en campo', `${visitas.length} registrada(s)`, '#/ordenes'],
    [!!resp && diasEntre(resp, hoy) <= 2, 'Respaldo diario funcionando', resp ? `último: ${txtFecha(resp)}` : 'sin dato: revise los activadores (instalarTriggers)'],
    [n >= DIAS_PARALELO, `Completar ${DIAS_PARALELO} días`, inicio ? `día ${Math.max(0, n)} de ${DIAS_PARALELO}` : '—'],
  ];
  const listos = checks.filter((c) => c[0]).length, todo = listos === checks.length;
  ui.vista().innerHTML = `<div class="titulo-fila"><h2>Marcha en paralelo</h2>${ayuda('paralelo')}</div>
    <p class="aviso">${ic('alerta')}<span><b>Regla del mes:</b> los avisos por WhatsApp salen <b>solo desde la app</b>. La macro se usa solo para importar el informe y comparar (si se envía desde las dos, el cliente recibe doble).</span></p>
    <section class="heroe"><span>${inicio ? 'En paralelo desde el ' + esc(txtFecha(inicio)) : 'Todavía no empieza'}</span><b>${listos} de ${checks.length}</b>
      <small>${todo ? 'Todo listo: la macro puede quedar solo para consulta.' : 'pasos cumplidos para dejar la macro solo para consulta'}</small>
      <span class="medidor"><i style="width:${Math.round(listos / checks.length * 100)}%"></i></span></section>
    <ul class="lista compacta checklist">${checks.map(([ok, t, sub, href]) => `<li class="${ok ? 'hecho' : ''}"><span class="marca-ck">${ok ? '✓' : ''}</span>
      <div><b>${esc(t)}</b><small>${esc(sub)}</small></div>${href && !ok ? `<a class="mini" href="${href}">Ir</a>` : ''}</li>`).join('')}</ul>
    <div class="botones">${inicio ? '<button class="btn secundario" id="reiniciar">Volver a empezar</button>' : `<button class="btn verde" id="empezar">${ic('check')}Empezar hoy</button>`}
      <a class="btn" href="#/cuadre">${ic('grafico')}Cuadre con la macro</a></div>
    ${todo ? `<section class="grafico"><h3>Cómo dejar la macro solo para consulta</h3><ol class="pasos">
      <li>Haga una copia de <b>MACRO PARA MENSAJE v2.xlsm</b> en la carpeta _RESPALDO.</li>
      <li>Clic derecho en el archivo → Propiedades → marque <b>Solo lectura</b> → Aceptar.</li>
      <li>Desde ahí, todo se trabaja en la app. La macro queda para consultar el historial antiguo.</li></ol></section>` : ''}`;
  const em = ui.vista().querySelector('#empezar');
  if (em) em.onclick = async () => { await guardarConfig(ui, { PARALELO_INICIO: hoyISO() }); celebrar('Mes en paralelo iniciado', `Hasta el ${txtFecha(new Date(Date.now() + 29 * 864e5).toISOString())}`); vParalelo(ui); };
  const re = ui.vista().querySelector('#reiniciar');
  if (re) re.onclick = async () => {
    if (!(await ui.confirmar('El conteo de días vuelve a empezar desde hoy.', { titulo: 'Volver a empezar el paralelo', si: 'Empezar de nuevo' }))) return;
    await guardarConfig(ui, { PARALELO_INICIO: hoyISO() }); vParalelo(ui);
  };
}

// ============================================================================
// CUADRE CON LA MACRO
// ============================================================================
let RESULTADO = null;
export function vCuadre(ui) {
  const cq = ultimoCuadre();
  ui.vista().innerHTML = `<div class="titulo-fila"><h2>Cuadre con la macro</h2>${ayuda('cuadre')}</div>
    <ol class="pasos"><li>Importe el <b>mismo informe</b> en la macro y en la app.</li><li>Guarde y cierre la macro.</li><li>Elija aquí el archivo <b>MACRO PARA MENSAJE v2.xlsm</b>.</li></ol>
    <label class="btn verde" for="archMacro">${ic('descargar')}Elegir la macro</label><input type="file" id="archMacro" accept=".xlsm,.xlsx" hidden>
    <p class="sub">El archivo se lee aquí mismo: no se sube a ningún lado ni se modifica.</p>
    ${cq && !RESULTADO ? `<p class="sub">Último cuadre: ${esc(txtFecha(cq.fecha))} · ${cq.cuadra ? '✓ cuadró' : '✗ con diferencias'} (${cq.graves} de deuda/estado, ${cq.sinExplicar} sin explicar).</p>` : ''}
    <div id="resCuadre">${RESULTADO ? pintar(RESULTADO) : ''}</div>`;
  const caja = ui.vista().querySelector('#resCuadre');
  ui.vista().querySelector('#archMacro').onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    caja.innerHTML = `<p class="sub">${ic('sync', 'girando')} Leyendo la macro y comparando…</p>`;
    try {
      const m = leerMacro(await leerExcel(f, ['CLIENTES', 'NUMEROS', 'HISTORIAL_ENVIOS', 'NO_ENVIAR', 'PLANTILLAS', 'CONFIG']));
      RESULTADO = cuadrarConMacro(D, m);
      const r = RESULTADO.resumen;
      await guardarConfig(ui, { CUADRE_ULTIMO: JSON.stringify({ fecha: hoyISO(), cuadra: RESULTADO.cuadra, graves: r.graves, sinExplicar: r.sinExplicar,
        diferencias: r.diferencias, totalApp: r.totalApp, totalMacro: r.totalMacro }) });
      celebrar(RESULTADO.cuadra ? '¡Cuadra con la macro!' : 'Hay diferencias', `${r.diferencias} diferencia(s), ${r.sinExplicar} sin explicar`, RESULTADO.cuadra ? 'ok' : 'aviso');
      vCuadre(ui);
    } catch (err) { caja.innerHTML = `<p class="aviso error">${ic('alerta')}<span>${esc(err.message)}</span></p>`; }
  };
  const p = ui.vista().querySelector('#cPdf'); if (p) p.onclick = () => imprimir('Cuadre con la macro', `Al ${txtFecha(hoyISO())}`, pintar(RESULTADO));
  const x = ui.vista().querySelector('#cCsv');
  if (x) x.onclick = () => descargarCSV(`cuadre_${hoyISO()}.csv`, [['Cliente', 'Dato', 'App', 'Macro', 'Explicación']]
    .concat(RESULTADO.diferencias.map((d) => [d.nombre, CAMPOS_CUADRE[d.campo], d.app, d.macro, d.explicada || 'revisar'])));
}

function pintar(R) {
  const r = R.resumen;
  const grupos = Object.keys(CAMPOS_CUADRE).map((k) => [k, R.diferencias.filter((d) => d.campo === k)]).filter(([, l]) => l.length);
  return `<section class="heroe ${R.cuadra ? 'ok' : ''}"><span>${R.cuadra ? '✓ La deuda cuadra con la macro' : '✗ La deuda no cuadra: revisar'}</span>
      <b>${soles(r.totalApp)}</b><small>app: ${r.clientesApp} clientes · macro: ${r.clientesMacro} clientes, ${soles(r.totalMacro)}</small></section>
    <section class="cifras cuatro"><div><span>Diferencias</span><b>${r.diferencias}</b></div><div class="${r.sinExplicar ? 'peligro' : 'ok'}"><span>Sin explicar</span><b>${r.sinExplicar}</b></div>
      <div class="${r.graves ? 'peligro' : 'ok'}"><span>De deuda o estado</span><b>${r.graves}</b></div><div class="ok"><span>Explicadas</span><b>${r.diferencias - r.sinExplicar}</b></div></section>
    <div class="botones"><button class="btn" id="cPdf">${ic('documento')}Imprimir / PDF</button><button class="btn" id="cCsv">${ic('descargar')}Excel</button></div>
    ${grupos.map(([k, l]) => `<details class="plegable" ${l.some((d) => !d.explicada) ? 'open' : ''}><summary>${esc(CAMPOS_CUADRE[k])} (${l.length})</summary>
      <div class="tabla-desliza"><table class="tabla"><thead><tr><th>Cliente</th><th>App</th><th>Macro</th><th></th></tr></thead><tbody>
      ${l.map((d) => `<tr><td>${d.id ? `<a href="#/cliente/${esc(d.id)}">${esc(d.nombre)}</a>` : esc(d.nombre)}</td><td>${esc(d.app)}</td><td>${esc(d.macro)}</td>
        <td>${d.explicada ? `<small>✓ ${esc(d.explicada)}</small>` : '<span class="chip e-moroso">revisar</span>'}</td></tr>`).join('')}</tbody></table></div></details>`).join('')
      || '<p class="vacio">Sin diferencias.</p>'}`;
}
