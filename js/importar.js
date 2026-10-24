// PANTALLA "IMPORTAR INFORME" (fase 2) — solo administrador y con señal.
// 1) Lee el Excel de la Empresa X en el celular o la PC (SheetJS) con las reglas de la macro.
// 2) El servidor compara con lo que hay y devuelve la vista previa (nada cambia todavía).
// 3) El administrador resuelve las dudas y aplica. También: descartar, deshacer el último informe
//    y la primera carga desde la macro.
import { llamar } from './api.js';
import { D, esc, soles, txtFecha } from './datos.js';
import { leerInforme } from './informe.js';
import { leerMacro } from './macro.js';
import { ic } from './iconos.js';

// SheetJS (lector de Excel) se descarga solo cuando se necesita. Versión fija.
// SheetJS 0.20.3 (Apache 2.0), copiado del sitio oficial cdn.sheetjs.com: va dentro de la app para no depender de otro sitio
const SHEETJS = '../vendor/xlsx-0.20.3.js';
let _xlsx = null;
async function cargarSheetJS() {
  if (!_xlsx) _xlsx = await import(SHEETJS);
  return _xlsx;
}

/** Lee un archivo Excel y devuelve { hojas: [{ nombre, filas }], bytes }. Solo las hojas pedidas si se indica. */
export async function leerExcel(archivo, soloHojas) {
  const XLSX = await cargarSheetJS();
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const libro = XLSX.read(bytes, { type: 'array', cellDates: true, sheets: soloHojas });
  const hojas = libro.SheetNames.filter((n) => !soloHojas || soloHojas.includes(n))
    .map((nombre) => ({ nombre, filas: XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: true, defval: '' }) }));
  return { hojas, bytes };
}

function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const NOMBRE_CAMPO = { NOMBRES: 'Nombre', ZONA: 'Zona', SECTOR: 'Sector', DIRECCION: 'Dirección', REFERENCIA: 'Referencia', GPS_EXCEL: 'GPS',
  SERVICIO: 'Servicio', PLAN: 'Plan', F_INSTALACION: 'Instalación', TELEFONO: 'Teléfono', DEUDA: 'Deuda' };
const CHIP_INFORME = { BORRADOR: 'e-porvencer', APLICADO: 'e-activo', DESCARTADO: 'e-baja', DESHECHO: 'e-cortado' };

/**
 * ui: { vista, aviso, confirmar, sincronizar } (los da app.js)
 */
export async function vImportar(ui) {
  const v = ui.vista();
  const borrador = D.informes.find((i) => i.ESTADO === 'BORRADOR');
  const ultimo = D.informes.find((i) => i.ESTADO === 'APLICADO');
  const hayAplicado = !!ultimo;
  v.innerHTML = `<section class="form"><h2>Importar informe</h2>
    <p class="sub">El Excel de pendientes de la Empresa X. Primero verá qué cambia; nada se aplica hasta que usted lo confirme.
      Lo que corrigió en la app (🔒) nunca se pisa.</p>
    ${navigator.onLine ? '' : `<p class="aviso error">${ic('alerta')}<span>Necesita señal para importar.</span></p>`}
    ${borrador ? `<p class="aviso">${ic('reloj')}<span>Hay un informe en revisión: <b>${esc(borrador.ARCHIVO)}</b>.</span>
      <button class="mini" id="continuar">Continuar revisión</button></p>` : ''}
    <label>Archivo de pendientes (.xlsx)<input type="file" id="archivo" accept=".xlsx,.xls,.xlsm"></label>
    <div id="lectura"></div><div id="previa"></div>
    <h3>Informes importados</h3>
    <ul class="lista compacta">${D.informes.map((i) => `<li><div><b>${esc(i.PERIODO)} · ${esc(i.ARCHIVO)}</b>
      <small>${esc(i.ID_INFORME)} · ${esc(i.CLIENTES)} filas · ${soles(i.TOTAL)}${i.ESTADO === 'APLICADO' ? ` · ${esc(i.NUEVOS || 0)} nuevos · ${esc(i.SALIERON || 0)} salieron · ${esc(txtFecha(i.F_APLICADO))}` : ''}</small></div>
      <div class="der"><span class="chip ${CHIP_INFORME[i.ESTADO] || 'e-pend'}">${esc(i.ESTADO)}</span>
      ${ultimo && i.ID_INFORME === ultimo.ID_INFORME && i.ID_DESHACER ? `<button class="mini rojo" data-deshacer="${esc(i.ID_INFORME)}">Deshacer</button>` : ''}</div></li>`).join('')
      || '<li class="vacio">Todavía no se importó ningún informe.</li>'}</ul>
    ${hayAplicado && !D.config.CargaMacro ? `<h3>Primera carga desde la macro</h3>
      <p class="sub">Se hace una sola vez: trae de "MACRO PARA MENSAJE v2.xlsm" los números con WhatsApp verificado, el historial de envíos,
        las gestiones, "Contacto guardado", NO_ENVIAR, las plantillas y la configuración.</p>
      <label>Archivo de la macro (.xlsm)<input type="file" id="macro" accept=".xlsm,.xlsx"></label><div id="macroRes"></div>`
      : D.config.CargaMacro ? `<p class="sub">Primera carga desde la macro: ${esc(D.config.CargaMacro)}.</p>` : ''}
  </section>`;

  const lectura = v.querySelector('#lectura'), previa = v.querySelector('#previa');
  if (borrador) v.querySelector('#continuar').onclick = () => conEspera(previa, () => llamar('informeResumen', { idInforme: borrador.ID_INFORME }), (r) => pintarPrevia(ui, previa, r));
  v.querySelectorAll('[data-deshacer]').forEach((b) => { b.onclick = async () => {
    if (!(await ui.confirmar('Se vuelve al informe anterior: los clientes nuevos de este informe se retiran, los que "salieron" vuelven y la capa del Excel se restaura. Las correcciones de la app no se tocan.',
      { titulo: `¿Deshacer ${b.dataset.deshacer}?`, si: 'Deshacer', peligro: true }))) return;
    conEspera(previa, () => llamar('informeDeshacer', { idInforme: b.dataset.deshacer }), async (r) => {
      ui.aviso(`Informe ${r.idInforme} deshecho.`); await ui.sincronizar(); vImportar(ui);
    });
  }; });

  v.querySelector('#archivo').onchange = async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    previa.innerHTML = '';
    lectura.innerHTML = `<p class="sub">${ic('sync', 'girando')} Leyendo ${esc(archivo.name)}…</p>`;
    let lec, bytes;
    try {
      const x = await leerExcel(archivo);
      bytes = x.bytes;
      lec = leerInforme({ nombreArchivo: archivo.name, hojas: x.hojas });
    } catch (err) {
      lectura.innerHTML = `<p class="aviso error">${ic('alerta')}<span>No se pudo leer el archivo: ${esc(err.message)}</span></p>`;
      return;
    }
    const cuadra = Math.abs(lec.total - lec.totalOriginal) < 0.005;
    lectura.innerHTML = `<section class="cifras">
        <div><span>Mes</span><b>${esc(lec.periodo)}</b></div><div><span>Hojas</span><b>${lec.hojas}</b></div><div><span>Clientes</span><b>${lec.filas.length}</b></div>
        <div class="ancho ${cuadra ? 'ok' : 'peligro'}"><span>Total del informe ${cuadra ? '· cuadra con el archivo ✓' : '· NO cuadra con el archivo'}</span><b>${soles(lec.total)}</b></div></section>
      ${lec.hayMes ? '' : `<label>El nombre del archivo no dice el mes. ¿De qué mes es?<input type="month" id="mes" value="${esc(lec.periodo)}"></label>`}
      ${lec.avisos.length ? `<details><summary>${lec.avisos.length} aviso(s) de lectura</summary><ul>${lec.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}
      <button class="btn grande verde" id="revisar" ${lec.filas.length ? '' : 'disabled'}>${ic('ver')}Revisar cambios</button>`;
    lectura.querySelector('#revisar').onclick = () => {
      const mes = lectura.querySelector('#mes');
      if (mes) lec.periodo = mes.value;
      conEspera(previa, () => llamar('informePrevia', Object.assign({ archivo: archivo.name, archivoBase64: base64(bytes) }, lec)),
        (r) => { lectura.innerHTML = ''; pintarPrevia(ui, previa, r); });
    };
  };

  const inMacro = v.querySelector('#macro');
  if (inMacro) inMacro.onchange = async (e) => {
    const archivo = e.target.files[0], caja = v.querySelector('#macroRes');
    if (!archivo) return;
    caja.innerHTML = `<p class="sub">${ic('sync', 'girando')} Leyendo la macro…</p>`;
    let m;
    try {
      const x = await leerExcel(archivo, ['CLIENTES', 'NUMEROS', 'HISTORIAL_ENVIOS', 'NO_ENVIAR', 'PLANTILLAS', 'CONFIG', 'CONTACTOS', 'PAGOS']);
      m = leerMacro(x);
    } catch (err) { caja.innerHTML = `<p class="aviso error">${ic('alerta')}<span>${esc(err.message)}</span></p>`; return; }
    caja.innerHTML = `<ul class="lista compacta">
        <li><div><b>${m.clientes.length} clientes</b><small>teléfonos, WhatsApp, marcas y gestiones</small></div></li>
        <li><div><b>${m.numeros.length} números verificados</b><small>con o sin WhatsApp</small></div></li>
        <li><div><b>${m.historial.length} líneas de historial</b><small>envíos y gestiones</small></div></li>
        <li><div><b>${m.noEnviar.length} en NO_ENVIAR · ${m.plantillas.length} plantillas</b><small>y la configuración</small></div></li></ul>
      <button class="btn grande verde" id="cargarMacro">${ic('descargar')}Cargar a la app</button>`;
    caja.querySelector('#cargarMacro').onclick = async () => {
      if (!(await ui.confirmar('Se hace una sola vez. No borra nada; lo corregido en la app se respeta.', { titulo: 'Primera carga desde la macro', si: 'Cargar' }))) return;
      conEspera(caja, () => llamar('cargaMacro', { macro: m }), async (r) => {
        ui.aviso(`Carga hecha: ${r.clientes} clientes, ${r.mensajes} mensajes, ${r.whatsapp} números con WhatsApp.`);
        await ui.sincronizar(); vImportar(ui);
      });
    };
  };
}

/** Ejecuta una llamada al servidor mostrando "procesando" y los errores en la caja. */
async function conEspera(caja, fn, alTerminar) {
  caja.innerHTML = `<p class="sub">${ic('sync', 'girando')} Procesando en el servidor…</p>`;
  try { await alTerminar(await fn()); } catch (e) { caja.innerHTML = `<p class="aviso error">${ic('alerta')}<span>${esc(e.message)}</span></p>`; }
}

function pintarPrevia(ui, caja, r) {
  const k = r.conteos, conflictos = r.cambios.filter((c) => c.tipo === 'CONFLICTO'), actualiza = r.cambios.filter((c) => c.tipo === 'ACTUALIZA');
  const deuda = r.cambios.filter((c) => c.campo === 'DEUDA');
  const filaCambio = (c) => `<li><div><b>${esc(c.nombre)}</b><small>${esc(NOMBRE_CAMPO[c.campo] || c.campo)}: ${esc(c.antes || '(vacío)')} → ${esc(c.despues || '(vacío)')}
    ${c.tipo === 'CONFLICTO' ? ` · se mantiene lo corregido 🔒 "${esc(c.corregido)}"` : ''}</small></div></li>`;
  caja.innerHTML = `<h3>Vista previa · ${esc(r.periodo)}</h3>
    <p class="sub">${esc(r.archivo)} · ${esc(r.filas)} filas · ${soles(r.total)}${r.informeAnterior ? ` · se compara con ${esc(r.informeAnterior)}` : ' · primer informe'}</p>
    <section class="cifras">
      <div class="ok"><span>Nuevos</span><b>${k.nuevos}</b></div><div><span>Actualizan</span><b>${k.actualiza}</b></div>
      <div class="${k.conflictos ? 'peligro' : ''}"><span>Conflictos</span><b>${k.conflictos}</b></div>
      <div><span>Salieron (al día)</span><b>${k.salieron}</b></div><div class="${k.dudosos ? 'peligro' : ''}"><span>Dudosos</span><b>${k.dudosos}</b></div>
      <div><span>Bajaron deuda</span><b>${k.bajaron}</b></div></section>
    ${r.dudas.length ? `<h3>Casos dudosos (resuélvalos antes de aplicar)</h3><ul class="lista">${r.dudas.map((d) => `<li><div><b>${esc(d.nombre)}</b>
        <small>${d.dni ? 'DNI ' + esc(d.dni) : 'sin DNI'} · ${esc(d.zona)} · ${soles(d.monto)}${d.candidato ? ` · parecido a ${esc(d.candidato.nombre)} (${esc(d.candidato.id)}, ${esc(d.candidato.motivo)})` : ''}</small></div>
        <div class="der">${d.candidato ? `<button class="mini verde" data-linea="${esc(d.idLinea)}" data-decision="${esc(d.candidato.id)}">Es ${esc(d.candidato.id)}</button>` : ''}
        <button class="mini" data-linea="${esc(d.idLinea)}" data-decision="NUEVO">Es nuevo</button></div></li>`).join('')}</ul>` : ''}
    ${conflictos.length ? `<details open><summary>Conflictos: el Excel trae otro dato, pero se mantiene lo corregido (${conflictos.length})</summary><ul class="lista compacta">${conflictos.map(filaCambio).join('')}</ul></details>` : ''}
    ${actualiza.length ? `<details><summary>Datos que se actualizan (${actualiza.length})</summary><ul class="lista compacta">${actualiza.map(filaCambio).join('')}</ul></details>` : ''}
    ${r.nuevos.length ? `<details><summary>Clientes nuevos (${r.nuevos.length})</summary><ul class="lista compacta">${r.nuevos.map((n) => `<li><div><b>${esc(n.nombre)}</b><small>${esc(n.zona)} · ${soles(n.monto)} · ${n.telefonos} teléfono(s)</small></div></li>`).join('')}</ul></details>` : ''}
    ${r.salieron.length ? `<details><summary>Salieron del informe: quedan "Al día" (${r.salieron.length})</summary><ul class="lista compacta">${r.salieron.map((s) => `<li><div><b>${esc(s.nombre)}</b><small>${esc(s.zona)} · debía ${soles(s.deudaAnterior)}</small></div></li>`).join('')}</ul></details>` : ''}
    ${deuda.length ? `<details><summary>Cambios de deuda frente al informe anterior (${deuda.length})</summary><ul class="lista compacta">${deuda.map(filaCambio).join('')}</ul></details>` : ''}
    ${r.masCambios ? `<p class="sub">…y ${r.masCambios} cambio(s) más.</p>` : ''}
    <div class="acciones"><button class="btn" id="descartar">${ic('cerrar')}Descartar</button>
      <button class="btn verde" id="aplicar" ${r.dudas.length ? 'disabled' : ''}>${ic('check')}Aplicar informe</button></div>`;
  caja.querySelectorAll('[data-decision]').forEach((b) => { b.onclick = () => conEspera(caja,
    () => llamar('informeResolver', { idInforme: r.idInforme, idLinea: b.dataset.linea, decision: b.dataset.decision }), (x) => pintarPrevia(ui, caja, x)); });
  caja.querySelector('#descartar').onclick = async () => {
    if (!(await ui.confirmar('El informe no se aplica y nada cambia.', { titulo: 'Descartar informe', si: 'Descartar' }))) return;
    conEspera(caja, () => llamar('informeDescartar', { idInforme: r.idInforme }), async () => { ui.aviso('Informe descartado.'); await ui.sincronizar(); vImportar(ui); });
  };
  caja.querySelector('#aplicar').onclick = async () => {
    if (!(await ui.confirmar(`${k.nuevos} nuevos, ${k.actualiza} actualizaciones, ${k.salieron} pasan a "Al día". Lo corregido en la app se mantiene. Se puede deshacer mientras sea el último informe.`,
      { titulo: `Aplicar el informe de ${r.periodo}`, si: 'Aplicar' }))) return;
    conEspera(caja, () => llamar('informeAplicar', { idInforme: r.idInforme }), async (x) => {
      ui.aviso(`Informe ${x.idInforme} aplicado.`); await ui.sincronizar(); vImportar(ui);
    });
  };
}

