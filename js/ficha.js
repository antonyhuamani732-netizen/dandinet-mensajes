// FICHA DEL CLIENTE 360°, PENDIENTES POR ATENDER Y SEGUIMIENTO (fase 3, con los ajustes del dueño)
// - Llamar / WhatsApp: primero se elige el número; al volver, la app pregunta cómo fue
//   (¿tiene WhatsApp?, ¿contestó?) y permite dejarlo como principal: así se diagnostica cada número.
// - "Editar datos": una sola ventana con todos los datos corregibles (🔒 = el Excel no lo cambia),
//   con mapa (OpenStreetMap) y "Estoy aquí" para la ubicación.
// - Reportes: sin servicio, número equivocado, reclamo, pedido de corte o baja… quedan pendientes
//   por atender (pantalla Pendientes, con reporte imprimible).
// - Marcas con botones (contacto guardado, NO ENVIAR, pausar avisos, observación).
// Todo pasa por la cola: funciona sin señal y el servidor vuelve a validar el rol.
import { llamar } from './api.js';
import {
  D, esc, soles, txtFecha, hoyISO, txtTel, claseEstado, aplicarLocal, telefonosDe, gestionesDe, enNoEnviar, abrirExterno, alertasDe, visitasDe,
} from './datos.js';
import { ic } from './iconos.js';
import { elegirEnMapa, miUbicacion } from './mapa.js';
import { ayuda, globo, cerrarGlobo, celebrar } from './ayuda.js';
import { modalNuevaOrden, TIPOS_ORDEN } from './ordenes.js';

export const TIPOS_GESTION = [['NO_CONTESTA', 'No contesta'], ['PROMESA_PAGO', 'Promesa de pago'], ['PAGO_POR_CONFIRMAR', 'Pagó (por confirmar)'],
  ['NUMERO_EQUIVOCADO', 'Número equivocado'], ['RECLAMO', 'Reclamo de cobro'], ['SOLICITA_CORTE', 'Solicita corte'], ['SOLICITA_BAJA', 'Solicita baja'], ['OTRO', 'Otro']];
const NOMBRE_GESTION = Object.fromEntries([...TIPOS_GESTION, ['VISITA', 'Visita']]);
export const CATEGORIAS = [['SIN_SERVICIO', 'Sin servicio', 'ALTA'], ['SENAL_LENTA', 'Señal lenta', 'MEDIA'], ['EQUIPO', 'Equipo / router', 'MEDIA'],
  ['NUMERO_EQUIVOCADO', 'Número equivocado', 'MEDIA'], ['RECLAMO_COBRO', 'Reclamo de cobro', 'ALTA'], ['SOLICITA_CORTE', 'Solicita corte', 'ALTA'],
  ['SOLICITA_BAJA', 'Solicita baja', 'ALTA'], ['OTRO', 'Otro', 'BAJA']];
const NOMBRE_CAT = Object.fromEntries(CATEGORIAS.map(([k, t]) => [k, t]));
const ESTADOS_QUEJA = [['ABIERTA', 'Abierta (pendiente)'], ['EN_ORDEN', 'En orden (técnico)'], ['DERIVADA_EMPRESA_X', 'Derivada a la Empresa X'], ['RESUELTA', 'Resuelta'], ['CERRADA', 'Cerrada']];
const NOMBRE_EQ = Object.fromEntries(ESTADOS_QUEJA);
const CHIP_EQ = { ABIERTA: 'e-moroso', EN_ORDEN: 'e-porvencer', DERIVADA_EMPRESA_X: 'e-susp', RESUELTA: 'e-activo', CERRADA: 'e-baja' };
const CHIP_PRIO = { ALTA: 'e-moroso', MEDIA: 'e-porvencer', BAJA: 'e-pend' };
export const quejaAbierta = (q) => ['ABIERTA', 'EN_ORDEN', 'DERIVADA_EMPRESA_X'].includes(q.ESTADO);
const CAMPOS = { NOMBRES: ['Nombre', 'NOMBRES'], ZONA: ['Zona', 'ZONA'], DIRECCION: ['Dirección', 'DIRECCION'], REFERENCIA: ['Referencia', 'REFERENCIA'], GPS: ['Ubicación GPS', 'GPS_EXCEL'] };
const CAMPOS_TECNICO = ['REFERENCIA', 'GPS'];
const WA = { SI: ['WhatsApp ✓', 'e-activo'], NO: ['sin WhatsApp', 'e-moroso'], POR_VERIFICAR: ['WhatsApp por verificar', 'e-porvencer'] };
const ESTADO_MSG = { ENVIADO: 'e-activo', SIN_WHATSAPP: 'e-moroso', FALLIDO: 'e-moroso', NO_ENTREGADO: 'e-susp', PREPARADO: 'e-porvencer', ANULADO: 'e-baja' };

let LISTA = [];                       // ids de la última búsqueda (para "Siguiente")
export const recordarLista = (ids) => { LISTA = ids.slice(); };
let PESTANA = 'resumen';
const dias = (iso) => Math.max(0, Math.round((Date.parse(hoyISO() + 'T12:00:00') - Date.parse(String(iso).slice(0, 10) + 'T12:00:00')) / 864e5));
const sumarDias = (n) => { const d = new Date(hoyISO() + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

/** Envía una operación a la cola y la refleja al instante en el celular. */
async function hacer(ui, tipo, datos, ok) {
  await ui.encolar(tipo, datos);
  await aplicarLocal(tipo, datos);
  if (ok !== false) ui.aviso(navigator.onLine ? (ok || 'Guardado.') : 'Guardado: se enviará al volver la señal.');
}

// ============================================================================
// FICHA
// ============================================================================
export function vCliente(id, ui) {
  const c = D.porId[id];
  if (!c) { ui.vista().innerHTML = `<p class="aviso error">${ic('alerta')}<span>Cliente no encontrado (¿falta sincronizar?).</span></p>`; return; }
  const tec = ui.esTecnico(), e = D.estados[id] || {}, T = telefonosDe(id);
  const pos = LISTA.indexOf(id), sig = pos >= 0 && pos < LISTA.length - 1 ? LISTA[pos + 1] : '';
  const candado = (campo) => (campo in c.corregido ? ` <span class="candado" title="Corregido: el Excel decía «${esc(c.corregido[campo] || '(vacío)')}»">🔒</span>` : '');
  const quejas = D.quejas.filter((q) => q.ID_CLIENTE === id), abiertas = quejas.filter(quejaAbierta), al = alertasDe(id);
  const pestanas = [['resumen', 'Datos'], ['historia', 'Historia'], ['pendientes', `Pendientes${abiertas.length ? ' (' + abiertas.length + ')' : ''}`], ...(tec ? [] : [['cambios', 'Cambios']])];
  if (!pestanas.some(([p]) => p === PESTANA)) PESTANA = 'resumen';
  const deuda = Number(e.MONTO) > 0 && c.ESTADO_INFORME !== 'AL_DIA_SALIO';

  ui.vista().innerHTML = `<section class="ficha">
    <div class="cabeza-cli"><div><h2>${esc(c.NOMBRES || id)}${candado('NOMBRES')}</h2>
      <p class="sub">${esc(c.ZONA || '')}${c.SERVICIO ? ' · ' + esc(c.SERVICIO) : ''}${!tec && c.DNI ? ' · DNI ' + esc(c.DNI) : ''}</p></div>
      ${sig ? `<a class="mini" href="#/cliente/${esc(sig)}" aria-label="Siguiente cliente">Siguiente ${ic('flecha')}</a>` : ''}</div>
    ${e.MONTO !== undefined || c.ESTADO_INFORME === 'AL_DIA_SALIO' ? `<div class="deuda-mini ${deuda ? 'roja' : 'verde'}">
      <span class="chip ${claseEstado(c.ESTADO_INFORME === 'AL_DIA_SALIO' ? 'Al día' : e.ESTADO)}">${esc(c.ESTADO_INFORME === 'AL_DIA_SALIO' ? 'Al día (salió del informe)' : e.ESTADO || '—')}</span>
      <b>${deuda ? soles(e.MONTO) : 'Sin deuda'}</b>${deuda ? `<small>${esc(e.MESES || 0)} mes(es)</small>` : ''}
      <button type="button" class="ayuda" id="infoDeuda" aria-label="Detalle de la deuda">${ic('info')}</button></div>` : ''}
    ${al.length ? `<div class="alertas">${al.map((a) => `<button type="button" class="chip ${a.cls} chip-btn" data-alerta="${a.k}">${esc(a.txt)}</button>`).join('')}</div>` : ''}
    <div class="acciones-ficha">
      <button class="accion" id="aLlamar">${ic('telefono')}<span>Llamar</span></button>
      <button class="accion" id="aWa">${ic('chat')}<span>WhatsApp</span></button>
      <button class="accion" id="aGestion">${ic('check')}<span>Gestión</span></button>
      <button class="accion" id="aReportar">${ic('alerta')}<span>Reportar</span></button>
      <button class="accion" id="aVisita">${ic('casa')}<span>Visita</span></button>
      <button class="accion" id="aMas">${ic('mas')}<span>Más</span></button>
    </div>
    <div class="segmentos" role="tablist">${pestanas.map(([p, t]) => `<button class="${PESTANA === p ? 'sel' : ''}" role="tab" aria-selected="${PESTANA === p}" data-tab="${p}">${t}</button>`).join('')}</div>
    <div id="tab"></div></section>`;

  const v = ui.vista(), tab = v.querySelector('#tab');
  const recargar = () => vCliente(id, ui);

  // ---- DATOS: teléfonos (llamar / escribir desde cada número) y ubicación
  function pintarResumen() {
    const activos = T.todos.filter((t) => t.ACTIVO !== 'No'), quitados = T.todos.filter((t) => t.ACTIVO === 'No');
    const filaTel = (t) => {
      const [wt, wc] = WA[t.WHATSAPP] || WA.POR_VERIFICAR, loc = String(t.ID_TEL).startsWith('LOCAL'), equiv = t.NUMERO_EQUIVOCADO === 'Sí';
      return `<li class="tel ${equiv ? 'apagado' : ''}"><div><b>${t === T.utiles[0] ? '⭐ ' : ''}${esc(txtTel(t.NUMERO))}</b>
        <small><span class="chip ${wc}">${wt}</span>${equiv ? ' <span class="chip e-moroso">no es del cliente</span>' : ''}${loc ? ' · por enviar' : ''}</small></div>
        <div class="acciones-tel">${equiv ? '' : `<button class="redondo" data-llamar="${esc(t.ID_TEL)}" aria-label="Llamar a ${esc(txtTel(t.NUMERO))}">${ic('telefono')}</button>
          <button class="redondo verde" data-wa="${esc(t.ID_TEL)}" aria-label="WhatsApp a ${esc(txtTel(t.NUMERO))}">${ic('chat')}</button>`}
          ${loc ? '' : `<button class="redondo" data-tel="${esc(t.ID_TEL)}" aria-label="Cambiar ${esc(txtTel(t.NUMERO))}">${ic('editar')}</button>`}</div></li>`;
    };
    const p = (c.GPS_EXCEL || '').trim();
    tab.innerHTML = `<div class="titulo-fila sub-titulo"><b>Teléfonos</b>${ayuda('telefonos')}<button class="mini" id="agregarTel">${ic('agregar')}Agregar</button></div>
      <ul class="lista compacta">${activos.map(filaTel).join('') || '<li class="vacio">Sin teléfonos. Agregue uno.</li>'}</ul>
      ${quitados.length ? `<details class="plegable"><summary>${quitados.length} número(s) quitado(s)</summary><ul class="lista compacta">${quitados.map((t) => `<li class="tel apagado"><div><b>${esc(txtTel(t.NUMERO))}</b></div>
        <div class="acciones-tel"><button class="mini" data-activar="${esc(t.ID_TEL)}">Reactivar</button></div></li>`).join('')}</ul></details>` : ''}
      <div class="titulo-fila sub-titulo"><b>Ubicación</b><button class="mini" id="editarUb">${ic('editar')}Editar</button></div>
      <dl class="compacta"><dt>Dirección</dt><dd>${esc(c.DIRECCION || '—')}${candado('DIRECCION')}</dd>
        <dt>Referencia</dt><dd>${esc(c.REFERENCIA || '—')}${candado('REFERENCIA')}</dd>
        <dt>GPS</dt><dd>${p ? esc(p) + candado('GPS_EXCEL') : '<span class="tenue">sin ubicación</span>'}</dd></dl>
      <div class="botones tres"><button class="btn" id="enMapa">${ic('mapa')}Mapa</button><button class="btn" id="aqui">${ic('ubicacion')}Estoy aquí</button>
        ${p ? `<a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p)}" target="_blank" rel="noopener">${ic('flecha')}Ir</a>` : ''}</div>
      ${c.OBS ? `<p class="nota">${ic('editar')} ${esc(c.OBS)}</p>` : ''}`;
    tab.querySelector('#agregarTel').onclick = () => modalTelefono(ui, id, recargar);
    tab.querySelector('#editarUb').onclick = () => modalEditar(ui, id, recargar);
    tab.querySelectorAll('[data-llamar]').forEach((b) => { b.onclick = () => contactar(ui, id, 'llamar', recargar, b.dataset.llamar); });
    tab.querySelectorAll('[data-wa]').forEach((b) => { b.onclick = () => contactar(ui, id, 'whatsapp', recargar, b.dataset.wa); });
    tab.querySelectorAll('[data-tel]').forEach((b) => { b.onclick = () => modalTelefonoEditar(ui, id, b.dataset.tel, recargar); });
    tab.querySelectorAll('[data-activar]').forEach((b) => { b.onclick = () => hacer(ui, 'TELEFONO_EDITAR', { idTel: b.dataset.activar, activo: true }, 'Teléfono reactivado.').then(recargar); });
    tab.querySelector('#enMapa').onclick = async () => {
      const val = await elegirEnMapa(ui, c.GPS_EXCEL, 'Ubicación de ' + (c.NOMBRES || id));
      if (val) { await hacer(ui, 'CORREGIR', { idCliente: id, campo: 'GPS', valor: val, motivo: 'Marcado en el mapa' }, 'Ubicación guardada 🔒'); recargar(); }
    };
    tab.querySelector('#aqui').onclick = async () => {
      try {
        ui.aviso('Buscando su ubicación…');
        const u = await miUbicacion();
        if (!(await ui.confirmar(`Guardar ${u.valor} (precisión ±${u.precision} m) como la ubicación del cliente.`, { titulo: '📍 Estoy aquí', si: 'Guardar' }))) return;
        await hacer(ui, 'CORREGIR', { idCliente: id, campo: 'GPS', valor: u.valor, motivo: 'Ubicación tomada en el lugar' }, 'Ubicación guardada 🔒'); recargar();
      } catch (err) { ui.aviso(err.message, 'error'); }
    };
  }

  // ---- HISTORIA: avisos, gestiones, visitas e informes en una sola línea de tiempo
  function pintarHistoria() {
    const items = [];
    (D.mensajes[id] || []).forEach((m) => items.push([m.F_RESULTADO, 'chat', `${m.PLANTILLA || 'Mensaje'}${Number(m.AVISO_NIVEL) ? ' · ' + m.AVISO_NIVEL + '.º aviso' : ''}`,
      `${txtTel(m.NUMERO)}${m.USUARIO === 'MACRO' ? ' · desde la macro' : ''}`, `<span class="chip ${ESTADO_MSG[m.ESTADO] || 'e-pend'}">${esc(m.ESTADO)}</span>`]));
    gestionesDe(id).forEach((g) => items.push([g.FECHA, g.TIPO === 'VISITA' ? 'casa' : 'check', `${NOMBRE_GESTION[g.TIPO] || g.TIPO}${g.FECHA_COMPROMISO ? ' · paga el ' + txtFecha(g.FECHA_COMPROMISO) : ''}`,
      `${g.USUARIO === 'MACRO' ? 'desde la macro' : g.USUARIO === 'yo' ? 'usted' : String(g.USUARIO).split('@')[0]}${g.OBS ? ' · ' + g.OBS : ''}`, '']));
    const lin = D.lineas[id] || [];
    D.informes.filter((i) => i.ESTADO === 'APLICADO').forEach((inf) => {
      const ls = lin.filter((l) => l.ID_INFORME === inf.ID_INFORME), monto = ls.reduce((s, l) => s + Number(l.MONTO), 0);
      items.push([inf.F_APLICADO || inf.PERIODO + '-01', 'documento', `Informe ${inf.PERIODO}`, ls.length ? `${Math.max(...ls.map((l) => Number(l.MESES)))} mes(es) · ${ls.map((l) => l.SERVICIO).join(' + ')}` : 'no figuró (al día)',
        ls.length ? `<b>${soles(monto)}</b>` : '<span class="chip e-activo">Al día</span>']);
    });
    items.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    tab.innerHTML = `<div class="botones"><button class="btn secundario" id="nuevaGes">${ic('agregar')}Registrar gestión</button></div>
      <ol class="linea-tiempo">${items.map(([f, i, t, sub, der]) => `<li><span class="punto-lt">${ic(i)}</span><div><b>${esc(t)}</b><small>${esc(txtFecha(f))} ${esc(String(f || '').slice(11, 16))}${sub ? ' · ' + esc(sub) : ''}</small></div>${der ? `<div class="der">${der}</div>` : ''}</li>`).join('')
        || '<li class="vacio">Sin historia todavía.</li>'}</ol>`;
    tab.querySelector('#nuevaGes').onclick = () => modalGestion(ui, id, recargar);
  }

  // ---- PENDIENTES: reportes y visitas del cliente
  function pintarPendientes() {
    const ots = D.ordenesDet.filter((d) => d.ID_CLIENTE === id).map((d) => Object.assign({}, D.ordenes.find((o) => o.ID_OT === d.ID_OT) || {}, { det: d }));
    tab.innerHTML = `<div class="botones"><button class="btn secundario" id="nuevoRep">${ic('alerta')}Reportar problema</button><button class="btn secundario" id="nuevaVis">${ic('casa')}Crear visita</button></div>
      <ul class="lista compacta">${quejas.slice().sort((a, b) => quejaAbierta(b) - quejaAbierta(a) || String(b.F_APERTURA).localeCompare(String(a.F_APERTURA))).map((q) => filaQueja(q, false)).join('') || '<li class="vacio">Sin reportes.</li>'}</ul>
      ${ots.length ? `<div class="titulo-fila sub-titulo"><b>Visitas</b></div><ul class="lista compacta">${ots.map((o) => `<li><a href="#/orden/${esc(o.ID_OT)}"><div><b>${esc((TIPOS_ORDEN[o.TIPO] || [o.TIPO])[0])} · ${esc(txtFecha(o.F_PROGRAMADA))}</b>
        <small>${esc(o.det.RESULTADO || o.TITULO || '')}</small></div><div class="der"><span class="chip ${claseEstado(o.det.ESTADO)}">${esc(o.det.ESTADO)}</span></div></a></li>`).join('')}</ul>` : ''}`;
    tab.querySelector('#nuevoRep').onclick = () => modalReportar(ui, id, recargar);
    tab.querySelector('#nuevaVis').onclick = () => modalNuevaOrden(ui, { clientes: [id] }, recargar);
    tab.querySelectorAll('[data-atender]').forEach((b) => { b.onclick = () => modalAtender(ui, b.dataset.atender, recargar); });
    tab.querySelectorAll('[data-visitaq]').forEach((b) => { b.onclick = () => modalNuevaOrden(ui, { clientes: [id], idQueja: b.dataset.visitaq, tipo: tipoParaQueja(b.dataset.visitaq) }, recargar); });
  }

  async function pintarCambios() {
    if (!navigator.onLine) { tab.innerHTML = '<p class="aviso">Necesita señal para ver el historial de cambios.</p>'; return; }
    tab.innerHTML = `<p class="sub">${ic('sync', 'girando')} Cargando historial…</p>`;
    try {
      const h = await llamar('historialCliente', { idCliente: id });
      const nombre = { NOMBRES: 'Nombre', ZONA: 'Zona', DIRECCION: 'Dirección', REFERENCIA: 'Referencia', GPS: 'GPS', GPS_EXCEL: 'GPS', SECTOR: 'Sector', SERVICIO: 'Servicio',
        PLAN: 'Plan', F_INSTALACION: 'Instalación', TELEFONO: 'Teléfono', DEUDA: 'Deuda', INFORME: 'Informe', CLIENTE: 'Cliente' };
      tab.innerHTML = `<details class="plegable" open><summary>Correcciones hechas en la app (${h.correcciones.length})</summary><ul class="lista compacta">${h.correcciones.map((x) => `<li class="${x.activa ? '' : 'apagado'}"><div><b>${esc(nombre[x.campo] || x.campo)}: ${esc(x.valor)}</b>
          <small>${esc(txtFecha(x.fecha))} · ${esc(x.usuario)}${x.motivo ? ' · ' + esc(x.motivo) : ''}${x.activa ? ' · vigente 🔒' : ' · reemplazada'}</small></div></li>`).join('') || '<li class="vacio">Ninguna.</li>'}</ul></details>
        <details class="plegable"><summary>Cambios que trajo el Excel (${h.cambios.length})</summary><ul class="lista compacta">${h.cambios.map((x) => `<li><div><b>${esc(x.periodo)} · ${esc(nombre[x.campo] || x.campo)}</b>
          <small>${esc(x.antes || '(vacío)')} → ${esc(x.despues || '(vacío)')}${x.tipo === 'CONFLICTO' ? ' · se mantuvo lo corregido 🔒' : ''}</small></div></li>`).join('') || '<li class="vacio">Ninguno.</li>'}</ul></details>
        <details class="plegable"><summary>Bitácora (${h.bitacora.length})</summary><ul class="lista compacta">${h.bitacora.map((x) => `<li><div><b>${esc(x.accion)}</b><small>${esc(txtFecha(x.fecha))} ${esc(String(x.fecha).slice(11, 16))} · ${esc(x.usuario)} · ${esc(x.detalle)}</small></div></li>`).join('') || '<li class="vacio">Sin registros.</li>'}</ul></details>`;
    } catch (err) { tab.innerHTML = `<p class="aviso error">${esc(err.message)}</p>`; }
  }

  ({ resumen: pintarResumen, historia: pintarHistoria, pendientes: pintarPendientes, cambios: pintarCambios }[PESTANA] || pintarResumen)();
  v.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { PESTANA = b.dataset.tab; recargar(); }; });
  v.querySelector('#aLlamar').onclick = () => contactar(ui, id, 'llamar', recargar);
  v.querySelector('#aWa').onclick = () => contactar(ui, id, 'whatsapp', recargar);
  v.querySelector('#aGestion').onclick = () => modalGestion(ui, id, recargar);
  v.querySelector('#aReportar').onclick = () => modalReportar(ui, id, recargar);
  v.querySelector('#aVisita').onclick = () => modalNuevaOrden(ui, { clientes: [id], tipo: al.some((a) => a.k === 'reconectar') ? 'RECONEXION' : al.some((a) => a.k === 'corte') ? 'CORTE' : abiertas.length ? 'REVISION' : 'VISITA_COBRO' }, recargar);
  v.querySelector('#aMas').onclick = () => modalMas(ui, id, recargar);

  // detalle de la deuda (globo) en vez de texto fijo
  const infoD = v.querySelector('#infoDeuda');
  if (infoD) infoD.onclick = (ev) => {
    ev.stopPropagation();
    const g = globo(infoD, `<b>${ic('cobrar')} Deuda según el informe</b><ul>
      <li>${esc(e.MESES || 0)} mes(es)${e.PLAN ? ' · plan ' + soles(e.PLAN) : ''}</li>
      <li>${Number(e.AVISO_NIVEL) ? `${esc(e.AVISO_NIVEL)}.º aviso enviado el ${esc(txtFecha(e.ULT_AVISO))}` : 'Sin avisos en este ciclo'}</li>
      ${e.MONTO_REVISAR === 'REVISAR' ? '<li>⚠ El monto no coincide con plan × meses.</li>' : ''}</ul>
      ${e.MONTO_REVISAR === 'REVISAR' && !tec ? '<button class="mini verde" id="montoOk">Monto verificado</button>' : ''}`);
    const mo = g.querySelector('#montoOk');
    if (mo) mo.onclick = async () => {
      cerrarGlobo();
      if (!(await ui.confirmar(`El informe dice ${soles(e.MONTO)} por ${e.MESES} mes(es) de ${soles(e.PLAN)}. ¿Confirmó con la Empresa X que el monto es correcto?`, { titulo: 'Monto verificado', si: 'Sí, es correcto' }))) return;
      await hacer(ui, 'MARCAS', { idCliente: id, montoVerificado: true }, 'Monto verificado.'); recargar();
    };
  };
  // cada etiqueta explica qué significa y ofrece la acción que corresponde
  v.querySelectorAll('[data-alerta]').forEach((b) => { b.onclick = (ev) => {
    ev.stopPropagation();
    const a = al.find((x) => x.k === b.dataset.alerta);
    const acc = { corte: ['Crear orden de corte', () => modalNuevaOrden(ui, { clientes: [id], tipo: 'CORTE' }, recargar)],
      pendiente: ['Ver pendientes', () => { PESTANA = 'pendientes'; recargar(); }],
      visita: ['Ver la orden', () => { const d = visitasDe(id)[0]; if (d) location.hash = '#/orden/' + d.ID_OT; }],
      sinwa: ['Crear visita de cobro', () => modalNuevaOrden(ui, { clientes: [id], tipo: 'VISITA_COBRO' }, recargar)],
      sintel: ['Agregar teléfono', () => modalTelefono(ui, id, recargar)],
      reconectar: ['Crear orden de reconexión', () => modalNuevaOrden(ui, { clientes: [id], tipo: 'RECONEXION' }, recargar)],
      pausa: tec ? null : ['Cambiar pausa', () => modalMarcas(ui, id, recargar)],
      noenviar: tec ? null : ['Cambiar en Marcas', () => modalMarcas(ui, id, recargar)] }[a.k];
    const g = globo(b, `<b>${esc(a.txt)}</b><p>${esc(a.ayuda)}</p>${acc ? `<button class="mini verde" id="accAlerta">${esc(acc[0])}</button>` : ''}`);
    const x = g.querySelector('#accAlerta'); if (x) x.onclick = () => { cerrarGlobo(); acc[1](); };
  }; });
}

/** Tipo de orden sugerido para un pendiente. */
function tipoParaQueja(idQueja) {
  const q = D.quejas.find((x) => x.ID_QUEJA === idQueja) || {};
  return { SOLICITA_CORTE: 'CORTE', SOLICITA_BAJA: 'CORTE', NUMERO_EQUIVOCADO: 'DATOS', RECLAMO_COBRO: 'VISITA_COBRO' }[q.CATEGORIA] || 'REVISION';
}

/** ⋯ Más: lo que no se usa a cada rato, fuera de la vista principal. */
function modalMas(ui, id, alTerminar) {
  const tec = ui.esTecnico(), c = D.porId[id] || {};
  const m = ui.modal(`<h3>${esc(c.NOMBRES || id)}</h3>
    <div class="lista-acciones">
      <button data-x="editar">${ic('editar')}<span>Editar datos<small>Nombre, zona, dirección, referencia, GPS</small></span></button>
      <button data-x="tel">${ic('telefono')}<span>Agregar teléfono</span></button>
      ${tec ? '' : `<button data-x="marcas">${ic('bandera')}<span>Marcas y pausa de avisos<small>Contacto guardado, NO ENVIAR, pausa, observación</small></span></button>`}
      <button data-x="visita">${ic('casa')}<span>Crear visita / orden</span></button>
    </div><button class="btn secundario" data-x="cerrar">Cerrar</button>`);
  m.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => {
    const x = b.dataset.x;
    ui.cerrarModal();
    if (x === 'editar') modalEditar(ui, id, alTerminar);
    if (x === 'tel') modalTelefono(ui, id, alTerminar);
    if (x === 'marcas') modalMarcas(ui, id, alTerminar);
    if (x === 'visita') modalNuevaOrden(ui, { clientes: [id] }, alTerminar);
  }; });
}

/** Marcas del cliente (solo administrador), en su propia ventana. */
function modalMarcas(ui, id, alTerminar) {
  const c = D.porId[id] || {}, noEnv = enNoEnviar(id), hasta = String(c.NO_ENVIAR_HASTA || '').slice(0, 10), pausado = hasta && hasta >= hoyISO();
  const m = ui.modal(`<h3>Marcas</h3><p class="sub">${esc(c.NOMBRES || id)}</p>
    <div class="interruptores">
      <button class="interruptor ${c.CONTACTO_GUARDADO === 'SI' ? 'on' : ''}" id="mGuardado" aria-pressed="${c.CONTACTO_GUARDADO === 'SI'}">
        <span class="ico">⭐</span><span><b>Contacto guardado</b><small>${c.CONTACTO_GUARDADO === 'SI' ? 'Sí: tengo su número guardado' : 'Tocar si lo guardó (se le avisa primero)'}</small></span></button>
      <button class="interruptor peligro ${noEnv ? 'on' : ''}" id="mNoEnviar" aria-pressed="${noEnv}">
        <span class="ico">🚫</span><span><b>NO ENVIAR avisos</b><small>${noEnv ? 'Activo: pidió no recibir mensajes' : 'Tocar si respondió BAJA'}</small></span></button>
      <div class="interruptor ${pausado ? 'on' : ''}"><span class="ico">⏸</span><span><b>Pausar avisos</b>
        <small>${pausado ? 'Hasta el ' + esc(txtFecha(hasta)) : 'No recibe avisos hasta una fecha'}</small>
        <span class="chips">${pausado ? '<button class="mini" data-pausa="">Quitar pausa</button>' : '<button class="mini" data-pausa="7">7 días</button><button class="mini" data-pausa="15">15 días</button><button class="mini" data-pausa="fecha">Elegir fecha</button>'}</span></span></div>
      <button class="interruptor" id="mObs"><span class="ico">📝</span><span><b>Observación</b><small>${esc(c.OBS || 'Tocar para escribir una nota del cliente')}</small></span></button>
    </div><button class="btn secundario" id="mCerrar">Cerrar</button>`);
  const fin = () => { ui.cerrarModal(); alTerminar(); };
  m.querySelector('#mCerrar').onclick = ui.cerrarModal;
  m.querySelector('#mGuardado').onclick = async () => { await hacer(ui, 'MARCAS', { idCliente: id, contactoGuardado: c.CONTACTO_GUARDADO !== 'SI' }); fin(); };
  m.querySelector('#mNoEnviar').onclick = async () => {
    ui.cerrarModal();
    if (!noEnv && !(await ui.confirmar('El cliente no recibirá ningún aviso de cobranza hasta que se quite esta marca.', { titulo: 'NO ENVIAR avisos', si: 'Activar' }))) return;
    await hacer(ui, 'NO_ENVIAR', { idCliente: id, activo: !noEnv, motivo: !noEnv ? 'Pidió no recibir avisos' : '' }); alTerminar();
  };
  m.querySelectorAll('[data-pausa]').forEach((b) => { b.onclick = async () => {
    let f = b.dataset.pausa;
    ui.cerrarModal();
    if (f === 'fecha') { f = await pedirFecha(ui, 'Pausar avisos hasta', sumarDias(7)); if (!f) return; }
    else if (f) f = sumarDias(Number(f));
    await hacer(ui, 'MARCAS', { idCliente: id, noEnviarHasta: f }, f ? 'Avisos en pausa hasta el ' + txtFecha(f) + '.' : 'Pausa quitada.'); alTerminar();
  }; });
  m.querySelector('#mObs').onclick = () => {
    const mo = ui.modal(`<h3 id="dlgT">Observación del cliente</h3><label>Nota<textarea id="oTxt" rows="4">${esc(c.OBS || '')}</textarea></label>
      <div class="acciones"><button class="btn" id="oNo">Cancelar</button><button class="btn verde" id="oSi">Guardar</button></div>`);
    mo.querySelector('#oNo').onclick = ui.cerrarModal;
    mo.querySelector('#oSi').onclick = async () => { const val = mo.querySelector('#oTxt').value.trim(); ui.cerrarModal(); if (val !== String(c.OBS || '')) { await hacer(ui, 'MARCAS', { idCliente: id, obs: val }); alTerminar(); } };
    mo.querySelector('#oTxt').focus();
  };
}

function filaQueja(q, conCliente) {
  const c = D.porId[q.ID_CLIENTE] || {}, abierta = quejaAbierta(q), loc = String(q.ID_QUEJA).startsWith('LOCAL');
  return `<li class="tel"><div><b>${esc(NOMBRE_CAT[q.CATEGORIA] || q.CATEGORIA)}${conCliente ? ' · ' + esc(c.NOMBRES || q.ID_CLIENTE) : ''}</b>
    <small><span class="chip ${CHIP_EQ[q.ESTADO] || 'e-pend'}">${esc(NOMBRE_EQ[q.ESTADO] || q.ESTADO)}</span> <span class="chip ${CHIP_PRIO[q.PRIORIDAD] || 'e-pend'}">${esc(q.PRIORIDAD || '')}</span>
    ${abierta ? `hace ${dias(q.F_APERTURA)} día(s)` : esc(txtFecha(q.F_APERTURA))}${conCliente ? ' · ' + esc(c.ZONA || '') : ''}${q.DESCRIPCION ? ' · ' + esc(q.DESCRIPCION) : ''}${q.SOLUCION ? ' · ✔ ' + esc(q.SOLUCION) : ''}</small></div>
    <div class="acciones-tel">${conCliente ? `<a class="redondo" href="#/cliente/${esc(q.ID_CLIENTE)}" aria-label="Ficha">${ic('usuario')}</a>` : ''}${loc ? '<small>por enviar</small>'
      : `${q.ESTADO === 'ABIERTA' ? `<button class="redondo" data-visitaq="${esc(q.ID_QUEJA)}" aria-label="Crear visita">${ic('casa')}</button>` : ''}
        <button class="mini ${abierta ? 'verde' : ''}" data-atender="${esc(q.ID_QUEJA)}">${abierta ? 'Atender' : 'Reabrir'}</button>`}</div></li>`;
}

// ============================================================================
// LLAMAR / WHATSAPP: elegir número y diagnosticarlo
// ============================================================================
function contactar(ui, id, modo, alTerminar, idTel) {
  const c = D.porId[id] || {}, T = telefonosDe(id);
  const lista = T.activos.slice().sort((a, b) => (a.NUMERO_EQUIVOCADO === 'Sí') - (b.NUMERO_EQUIVOCADO === 'Sí'));
  if (!lista.length) { ui.aviso('El cliente no tiene teléfonos. Agregue uno.', 'error'); return modalTelefono(ui, id, alTerminar); }
  const abrir = (t) => {
    const n = String(t.NUMERO).replace('+', '');
    ui.cerrarModal();
    abrirExterno(modo === 'llamar' ? 'tel:+' + n : 'https://wa.me/' + n);
    // al volver a la app: cómo fue (diagnóstico del número)
    setTimeout(() => diagnostico(ui, id, t, modo, alTerminar), 600);
  };
  const elegido = idTel && lista.find((x) => x.ID_TEL === idTel);
  if (elegido) return abrir(elegido);
  if (lista.length === 1) return abrir(lista[0]);
  const m = ui.modal(`<h3 id="dlgT">${modo === 'llamar' ? '¿A qué número llamar?' : '¿A qué número escribir?'}</h3><p class="sub">${esc(c.NOMBRES || id)}</p>
    <ul class="lista compacta">${lista.map((t) => {
      const [wt, wc] = WA[t.WHATSAPP] || WA.POR_VERIFICAR, equiv = t.NUMERO_EQUIVOCADO === 'Sí';
      return `<li class="tel ${equiv ? 'apagado' : ''}"><div><b>${t === T.utiles[0] ? '⭐ ' : ''}${esc(txtTel(t.NUMERO))}</b><small><span class="chip ${wc}">${wt}</span>${equiv ? ' · no es del cliente' : ''}</small></div>
        <div class="acciones-tel"><button class="redondo ${modo === 'llamar' ? '' : 'verde'}" data-num="${esc(t.ID_TEL)}" aria-label="${modo === 'llamar' ? 'Llamar' : 'WhatsApp'}">${modo === 'llamar' ? ic('telefono') : ic('chat')}</button></div></li>`;
    }).join('')}</ul>
    <button class="btn secundario" id="otro">${ic('agregar')}Agregar otro número</button><button class="btn secundario" id="cancelar">Cancelar</button>`);
  m.querySelector('#cancelar').onclick = ui.cerrarModal;
  m.querySelector('#otro').onclick = () => modalTelefono(ui, id, alTerminar);
  m.querySelectorAll('[data-num]').forEach((b) => { b.onclick = () => abrir(lista.find((x) => x.ID_TEL === b.dataset.num)); });
}

function diagnostico(ui, id, t, modo, alTerminar) {
  const T = telefonosDe(id), esPrincipal = t === T.utiles[0], local = String(t.ID_TEL).startsWith('LOCAL');
  const opciones = modo === 'whatsapp'
    ? [['wa-si', '✓ Sí, se abrió el chat (tiene WhatsApp)', 'verde'], ['wa-no', '✗ No tiene WhatsApp', ''], ['nada', 'No pude comprobarlo', 'secundario']]
    : [['contesto', '✓ Contestó', 'verde'], ['no-contesta', 'No contesta / apagado', ''], ['equivocado', 'Número equivocado (no es el cliente)', ''], ['nada', 'No llamé', 'secundario']];
  const m = ui.modal(`<h3 id="dlgT">${modo === 'whatsapp' ? '¿Se abrió el chat?' : '¿Cómo fue la llamada?'}</h3>
    <p class="sub">${esc(txtTel(t.NUMERO))} · ${esc((D.porId[id] || {}).NOMBRES || id)}</p>
    ${opciones.map(([k, txt, cl]) => `<button class="btn grande ${cl}" data-r="${k}">${txt}</button>`).join('')}
    ${!esPrincipal && !local ? '<label class="check"><input type="checkbox" id="dPri"> Dejar este número como principal</label>' : ''}
    <label>Nota (opcional)<input id="dObs" autocomplete="off"></label>`);
  m.querySelectorAll('[data-r]').forEach((b) => { b.onclick = async () => {
    const r = b.dataset.r, pri = !!(m.querySelector('#dPri') && m.querySelector('#dPri').checked), obs = m.querySelector('#dObs').value.trim();
    ui.cerrarModal();
    if (r === 'nada') { if (pri) await hacer(ui, 'TELEFONO_EDITAR', { idTel: t.ID_TEL, principal: true }, 'Número principal cambiado.'); return alTerminar(); }
    if (local) { ui.aviso('El número aún no se envía al servidor: sincronice y vuelva a marcarlo.', 'error'); return alTerminar(); }
    if (r === 'wa-si' || r === 'wa-no') {
      await hacer(ui, 'TELEFONO_EDITAR', Object.assign({ idTel: t.ID_TEL, whatsapp: r === 'wa-si' ? 'SI' : 'NO' }, pri ? { principal: true } : {}),
        r === 'wa-si' ? 'Anotado: tiene WhatsApp.' : 'Anotado: no tiene WhatsApp.');
      if (r === 'wa-no' && !telefonosDe(id).conWa.length) ui.aviso('Ningún número del cliente tiene WhatsApp: hay que avisarle en persona.', 'error');
    } else {
      if (pri) await hacer(ui, 'TELEFONO_EDITAR', { idTel: t.ID_TEL, principal: true }, false);
      if (r === 'no-contesta') await hacer(ui, 'GESTION', { idCliente: id, tipo: 'NO_CONTESTA', obs: (obs || 'Llamada sin respuesta') + ' · ' + txtTel(t.NUMERO) }, 'Gestión: no contesta.');
      if (r === 'equivocado') await hacer(ui, 'GESTION', { idCliente: id, tipo: 'NUMERO_EQUIVOCADO', idTel: t.ID_TEL, obs: obs || 'Al llamar: no es el cliente' }, 'Número equivocado: queda pendiente por atender.');
      if (r === 'contesto') {
        if (await ui.confirmar('¿Quiere registrar qué dijo el cliente (promesa de pago, reclamo…)?', { titulo: 'Contestó', si: 'Registrar gestión', no: 'Ahora no' })) return modalGestion(ui, id, alTerminar);
      }
    }
    alTerminar();
  }; });
}

// ============================================================================
// DIÁLOGOS
// ============================================================================
function modalEditar(ui, id, alTerminar) {
  const c = D.porId[id], tec = ui.esTecnico();
  const campos = Object.keys(CAMPOS).filter((k) => !tec || CAMPOS_TECNICO.includes(k));
  const fila = (k) => {
    const [etq, campo] = CAMPOS[k], corr = campo in c.corregido, largo = k === 'DIRECCION' || k === 'REFERENCIA';
    const excel = corr ? c.corregido[campo] : c[campo];
    return `<div class="campo-edit"><label>${esc(etq)}${corr ? ' 🔒' : ''}
      ${largo ? `<textarea data-k="${k}" rows="2">${esc(c[campo] || '')}</textarea>` : `<input data-k="${k}" value="${esc(c[campo] || '')}" autocomplete="off" ${k === 'GPS' ? 'inputmode="decimal" placeholder="-11.663013,-74.285242"' : ''}>`}</label>
      <small class="tenue">El Excel dice: «${esc(excel || '(vacío)')}»</small>
      ${k === 'GPS' ? `<div class="botones"><button class="mini" id="eMapa">${ic('mapa')}Mapa</button><button class="mini" id="eAqui">${ic('ubicacion')}Estoy aquí</button></div>` : ''}
      ${corr ? `<label class="check"><input type="checkbox" data-excel="${k}"> Volver al dato del Excel</label>` : ''}</div>`;
  };
  const m = ui.modal(`<h3 id="dlgT">Editar datos</h3><p class="sub">${esc(c.NOMBRES || id)} · lo que cambie queda con 🔒 y el Excel no lo pisa.</p>
    ${campos.map(fila).join('')}
    <label>Motivo (opcional)<input id="eMot" placeholder="ej. visita, llamada, el cliente lo dijo" autocomplete="off"></label>
    <div class="acciones"><button class="btn" id="eNo">Cancelar</button><button class="btn verde" id="eSi">Guardar</button></div>`);
  const gps = m.querySelector('[data-k="GPS"]');
  m.querySelector('#eMapa').onclick = async () => { const v = await elegirEnMapa(ui, gps.value || c.GPS_EXCEL); if (v) gps.value = v; };
  m.querySelector('#eAqui').onclick = async () => { try { ui.aviso('Buscando su ubicación…'); gps.value = (await miUbicacion()).valor; } catch (err) { ui.aviso(err.message, 'error'); } };
  m.querySelector('#eNo').onclick = ui.cerrarModal;
  m.querySelector('#eSi').onclick = async () => {
    const motivo = m.querySelector('#eMot').value.trim(), ops = [];
    for (const k of campos) {
      const campo = CAMPOS[k][1], volver = m.querySelector(`[data-excel="${k}"]`), v = m.querySelector(`[data-k="${k}"]`).value.trim().replace(/\s+/g, ' ');
      if (volver && volver.checked) { ops.push(['QUITAR_CORRECCION', { idCliente: id, campo: k }]); continue; }
      if (v === String(c[campo] || '').trim()) continue;
      if (!v) return ui.aviso(`${CAMPOS[k][0]}: no lo deje vacío (o marque "Volver al dato del Excel").`, 'error');
      if (k === 'GPS' && !/^-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/.test(v)) return ui.aviso('GPS: escriba "latitud,longitud", o use Mapa / Estoy aquí.', 'error');
      ops.push(['CORREGIR', { idCliente: id, campo: k, valor: v, motivo }]);
    }
    ui.cerrarModal();
    if (!ops.length) return ui.aviso('No hay cambios.');
    for (const [tipo, d] of ops) await hacer(ui, tipo, d, false);
    ui.aviso(navigator.onLine ? `Guardado (${ops.length} cambio(s)) 🔒` : 'Guardado: se enviará al volver la señal.');
    alTerminar();
  };
}

function modalTelefono(ui, id, alTerminar) {
  const m = ui.modal(`<h3 id="dlgT">Agregar teléfono</h3>
    <label>Celular (9 dígitos)<input id="tNum" inputmode="tel" autocomplete="off" placeholder="9xx xxx xxx"></label>
    <label class="check"><input type="checkbox" id="tPri"> Usarlo como principal</label>
    <div class="acciones"><button class="btn" id="tNo">Cancelar</button><button class="btn verde" id="tSi">Agregar</button></div>`);
  m.querySelector('#tNo').onclick = ui.cerrarModal;
  m.querySelector('#tSi').onclick = async () => {
    let d = m.querySelector('#tNum').value.replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('51')) d = d.slice(2);
    if (!/^9\d{8}$/.test(d)) return ui.aviso('El celular debe tener 9 dígitos y empezar con 9.', 'error');
    if (telefonosDe(id).todos.some((t) => t.NUMERO === '+51' + d && t.ACTIVO !== 'No' && t.NUMERO_EQUIVOCADO !== 'Sí')) return ui.aviso('El cliente ya tiene ese número.', 'error');
    ui.cerrarModal();
    await hacer(ui, 'TELEFONO_AGREGAR', { idCliente: id, numero: d, principal: m.querySelector('#tPri').checked }, 'Teléfono agregado.');
    alTerminar();
  };
  m.querySelector('#tNum').focus();
}

function modalTelefonoEditar(ui, id, idTel, alTerminar) {
  const T = telefonosDe(id), t = T.todos.find((x) => x.ID_TEL === idTel);
  if (!t) return;
  const equiv = t.NUMERO_EQUIVOCADO === 'Sí', principal = t === T.utiles[0];
  const m = ui.modal(`<h3 id="dlgT">${esc(txtTel(t.NUMERO))}</h3><p class="sub">${esc((D.porId[id] || {}).NOMBRES || id)}</p>
    <p>¿Tiene WhatsApp?</p><div class="botones">${['SI', 'NO', 'POR_VERIFICAR'].map((w) => `<button class="mini ${t.WHATSAPP === w || (!t.WHATSAPP && w === 'POR_VERIFICAR') ? 'sel' : ''}" data-wa="${w}">${{ SI: '✓ Sí', NO: '✗ No', POR_VERIFICAR: '? Por verificar' }[w]}</button>`).join('')}</div>
    ${principal ? '<p class="sub">⭐ Es el número principal.</p>' : '<button class="btn" data-x="principal">⭐ Dejar como principal</button>'}
    <button class="btn" data-x="${equiv ? 'correcto' : 'equivocado'}">${equiv ? 'Sí es del cliente (quitar "equivocado")' : 'Es un número equivocado'}</button>
    <button class="btn rojo" data-x="quitar">Quitar este número</button>
    <button class="btn secundario" data-x="cerrar">Cerrar</button>`);
  m.querySelectorAll('[data-wa]').forEach((b) => { b.onclick = async () => { ui.cerrarModal(); await hacer(ui, 'TELEFONO_EDITAR', { idTel, whatsapp: b.dataset.wa }, 'Anotado.'); alTerminar(); }; });
  m.querySelectorAll('[data-x]').forEach((b) => { b.onclick = async () => {
    const x = b.dataset.x;
    ui.cerrarModal();
    if (x === 'cerrar') return;
    if (x === 'quitar' && !(await ui.confirmar('El número deja de usarse para este cliente (queda en el historial y se puede reactivar).', { titulo: 'Quitar teléfono', si: 'Quitar', peligro: true }))) return;
    if (x === 'equivocado') await hacer(ui, 'GESTION', { idCliente: id, tipo: 'NUMERO_EQUIVOCADO', idTel, obs: txtTel(t.NUMERO) + ' no es del cliente' }, 'Número equivocado: queda pendiente por atender.');
    else await hacer(ui, 'TELEFONO_EDITAR', x === 'principal' ? { idTel, principal: true } : x === 'correcto' ? { idTel, equivocado: false } : { idTel, activo: false }, 'Teléfono actualizado.');
    alTerminar();
  }; });
}

function modalGestion(ui, id, alTerminar) {
  const T = telefonosDe(id);
  const m = ui.modal(`<h3 id="dlgT">Registrar gestión</h3>
    <label>¿Qué pasó?<select id="gTipo">${TIPOS_GESTION.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
    <label id="gFechaL" hidden>¿Qué día pagará?<input type="date" id="gFecha" min="${hoyISO()}"></label>
    <label id="gTelL" hidden>¿Qué número estaba equivocado?<select id="gTel">${T.activos.map((t) => `<option value="${esc(t.ID_TEL)}">${esc(txtTel(t.NUMERO))}</option>`).join('')}</select></label>
    <p class="sub" id="gPend" hidden>Quedará como <b>pendiente por atender</b>.</p>
    <label>Observación<textarea id="gObs" rows="2"></textarea></label>
    <div class="acciones"><button class="btn" id="gNo">Cancelar</button><button class="btn verde" id="gSi">Guardar</button></div>`);
  const tipo = m.querySelector('#gTipo');
  const ver = () => {
    m.querySelector('#gFechaL').hidden = tipo.value !== 'PROMESA_PAGO';
    m.querySelector('#gTelL').hidden = tipo.value !== 'NUMERO_EQUIVOCADO' || !T.activos.length;
    m.querySelector('#gPend').hidden = !['NUMERO_EQUIVOCADO', 'RECLAMO', 'SOLICITA_CORTE', 'SOLICITA_BAJA'].includes(tipo.value);
  };
  tipo.onchange = ver; ver();
  m.querySelector('#gNo').onclick = ui.cerrarModal;
  m.querySelector('#gSi').onclick = async () => {
    const d = { idCliente: id, tipo: tipo.value, obs: m.querySelector('#gObs').value.trim() };
    if (d.tipo === 'PROMESA_PAGO') {
      d.fechaCompromiso = m.querySelector('#gFecha').value;
      if (!d.fechaCompromiso || d.fechaCompromiso < hoyISO()) return ui.aviso('Elija el día en que pagará (hoy o después).', 'error');
    }
    if (d.tipo === 'NUMERO_EQUIVOCADO' && T.activos.length) d.idTel = m.querySelector('#gTel').value;
    ui.cerrarModal();
    await hacer(ui, 'GESTION', d, false);
    celebrar('Gestión registrada', (NOMBRE_GESTION[d.tipo] || '') + (navigator.onLine ? '' : ' · se enviará al volver la señal'));
    PESTANA = 'historia'; alTerminar();
  };
}

function modalReportar(ui, id, alTerminar) {
  const m = ui.modal(`<h3 id="dlgT">Reportar un problema</h3><p class="sub">${esc((D.porId[id] || {}).NOMBRES || id)} · queda pendiente por atender</p>
    <label>¿Qué pasa?<select id="rCat">${CATEGORIAS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
    <label>Prioridad<select id="rPrio">${['ALTA', 'MEDIA', 'BAJA'].map((p) => `<option>${p}</option>`).join('')}</select></label>
    <label>¿Cómo se enteró?<select id="rCanal"><option value="LLAMADA">Llamada</option><option value="WHATSAPP">WhatsApp</option><option value="OFICINA">Oficina</option><option value="CAMPO">En campo</option></select></label>
    <label>Detalle<textarea id="rDesc" rows="3" placeholder="ej. no tiene señal desde ayer"></textarea></label>
    <div class="acciones"><button class="btn" id="rNo">Cancelar</button><button class="btn verde" id="rSi">Registrar</button></div>`);
  const cat = m.querySelector('#rCat'), prio = m.querySelector('#rPrio');
  const porDefecto = () => { prio.value = (CATEGORIAS.find(([k]) => k === cat.value) || [])[2] || 'MEDIA'; };
  cat.onchange = porDefecto; porDefecto();
  if (ui.esTecnico()) m.querySelector('#rCanal').value = 'CAMPO';
  m.querySelector('#rNo').onclick = ui.cerrarModal;
  m.querySelector('#rSi').onclick = async () => {
    const d = { idCliente: id, categoria: cat.value, prioridad: prio.value, canal: m.querySelector('#rCanal').value, descripcion: m.querySelector('#rDesc').value.trim() };
    if (D.quejas.some((q) => q.ID_CLIENTE === id && q.CATEGORIA === d.categoria && quejaAbierta(q))) return ui.aviso('El cliente ya tiene un pendiente abierto de ese tipo.', 'error');
    ui.cerrarModal();
    await hacer(ui, 'ABRIR_QUEJA', d, false);
    celebrar('Pendiente registrado', NOMBRE_CAT[d.categoria] || '', 'aviso');
    PESTANA = 'pendientes'; alTerminar();
  };
}

function modalAtender(ui, idQueja, alTerminar) {
  const q = D.quejas.find((x) => x.ID_QUEJA === idQueja);
  if (!q) return;
  const c = D.porId[q.ID_CLIENTE] || {};
  const m = ui.modal(`<h3 id="dlgT">Atender: ${esc(NOMBRE_CAT[q.CATEGORIA] || q.CATEGORIA)}</h3>
    <p class="sub">${esc(c.NOMBRES || q.ID_CLIENTE)} · ${esc(txtFecha(q.F_APERTURA))}${q.DESCRIPCION ? ' · ' + esc(q.DESCRIPCION) : ''}</p>
    <label>Nuevo estado<select id="aEst">${ESTADOS_QUEJA.filter(([k]) => k !== q.ESTADO).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
    <label>¿Qué se hizo?<textarea id="aSol" rows="3" placeholder="obligatorio para resolver o cerrar">${esc(q.SOLUCION || '')}</textarea></label>
    <div class="acciones"><button class="btn" id="aNo">Cancelar</button><button class="btn verde" id="aSi">Guardar</button></div>`);
  const est = m.querySelector('#aEst');
  if (quejaAbierta(q)) est.value = 'RESUELTA';
  m.querySelector('#aNo').onclick = ui.cerrarModal;
  m.querySelector('#aSi').onclick = async () => {
    const d = { idQueja, estado: est.value, solucion: m.querySelector('#aSol').value.trim() };
    if (['RESUELTA', 'CERRADA'].includes(d.estado) && !d.solucion) return ui.aviso('Escriba qué se hizo para cerrarlo.', 'error');
    ui.cerrarModal();
    await hacer(ui, 'ATENDER_QUEJA', d, 'Pendiente actualizado.');
    alTerminar();
  };
}

function pedirFecha(ui, titulo, valor) {
  return new Promise((ok) => {
    const m = ui.modal(`<h3 id="dlgT">${esc(titulo)}</h3><label>Fecha<input type="date" id="pfF" min="${hoyISO()}" value="${esc(valor)}"></label>
      <div class="acciones"><button class="btn" id="pfNo">Cancelar</button><button class="btn verde" id="pfSi">Aceptar</button></div>`);
    m.querySelector('#pfNo').onclick = () => { ui.cerrarModal(); ok(null); };
    m.querySelector('#pfSi').onclick = () => { const v = m.querySelector('#pfF').value; ui.cerrarModal(); ok(v && v >= hoyISO() ? v : null); };
  });
}

// ============================================================================
// PENDIENTES POR ATENDER (reporte)
// ============================================================================
const FILTRO_PEND = { zona: '', cat: '' };
export function vPendientes(ui) {
  const orden = { ALTA: 0, MEDIA: 1, BAJA: 2 };
  const todas = D.quejas.filter(quejaAbierta).sort((a, b) => (orden[a.PRIORIDAD] ?? 3) - (orden[b.PRIORIDAD] ?? 3) || String(a.F_APERTURA).localeCompare(String(b.F_APERTURA)));
  const zonas = [...new Set(todas.map((q) => (D.porId[q.ID_CLIENTE] || {}).ZONA || ''))].filter(Boolean).sort();
  const lista = todas.filter((q) => (!FILTRO_PEND.zona || (D.porId[q.ID_CLIENTE] || {}).ZONA === FILTRO_PEND.zona) && (!FILTRO_PEND.cat || q.CATEGORIA === FILTRO_PEND.cat));
  const porCat = CATEGORIAS.map(([k, t]) => [k, t, todas.filter((q) => q.CATEGORIA === k).length]).filter(([, , n]) => n);
  const cerradasMes = D.quejas.filter((q) => !quejaAbierta(q) && String(q.F_CIERRE).slice(0, 7) === hoyISO().slice(0, 7)).length;
  recordarLista([...new Set(lista.map((q) => q.ID_CLIENTE))]);
  ui.vista().innerHTML = `<div class="titulo-fila"><h2>Pendientes</h2>${ayuda('pendientes')}</div>
    <section class="cifras"><div class="peligro"><span>Abiertos</span><b>${todas.length}</b></div>
      <div class="peligro"><span>Prioridad alta</span><b>${todas.filter((q) => q.PRIORIDAD === 'ALTA').length}</b></div>
      <div class="ok"><span>Resueltos este mes</span><b>${cerradasMes}</b></div></section>
    <div class="chips">${porCat.map(([k, t, n]) => `<button class="mini ${FILTRO_PEND.cat === k ? 'sel' : ''}" data-cat="${k}">${t} (${n})</button>`).join('')}</div>
    ${zonas.length > 1 ? `<label class="filtros">Zona<select id="pZona"><option value="">Todas</option>${zonas.map((z) => `<option ${FILTRO_PEND.zona === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>` : ''}
    <div class="botones"><button class="btn" id="imprimir">${ic('documento')}Imprimir reporte</button></div>
    <ul class="lista compacta">${lista.map((q) => filaQueja(q, true)).join('') || `<li class="vacio-grande">${ic('check')}<span>No hay pendientes.</span></li>`}</ul>`;
  ui.vista().querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { FILTRO_PEND.cat = FILTRO_PEND.cat === b.dataset.cat ? '' : b.dataset.cat; vPendientes(ui); }; });
  const z = ui.vista().querySelector('#pZona'); if (z) z.onchange = () => { FILTRO_PEND.zona = z.value; vPendientes(ui); };
  ui.vista().querySelectorAll('[data-atender]').forEach((b) => { b.onclick = () => modalAtender(ui, b.dataset.atender, () => vPendientes(ui)); });
  ui.vista().querySelectorAll('[data-visitaq]').forEach((b) => { b.onclick = () => {
    const q = D.quejas.find((x) => x.ID_QUEJA === b.dataset.visitaq);
    if (q) modalNuevaOrden(ui, { clientes: [q.ID_CLIENTE], idQueja: q.ID_QUEJA, tipo: tipoParaQueja(q.ID_QUEJA) }, () => vPendientes(ui));
  }; });
  ui.vista().querySelector('#imprimir').onclick = () => imprimirPendientes(lista);
}

/** Reporte imprimible (A4) de los pendientes: para el técnico o para la Empresa X. */
function imprimirPendientes(lista) {
  const conUbic = String(D.config.REPORTE_CON_UBICACION || 'SI').toUpperCase().startsWith('S');
  const filas = lista.map((q, k) => {
    const c = D.porId[q.ID_CLIENTE] || {}, tel = telefonosDe(q.ID_CLIENTE).utiles[0];
    return `<tr><td>${k + 1}</td><td><b>${esc(c.NOMBRES || q.ID_CLIENTE)}</b><br>${esc(c.ZONA || '')}${conUbic && c.REFERENCIA ? '<br><small>Ref.: ' + esc(c.REFERENCIA) + '</small>' : ''}</td>
      ${conUbic ? `<td>${tel ? esc(txtTel(tel.NUMERO)) : '—'}</td>` : ''}<td>${esc(NOMBRE_CAT[q.CATEGORIA] || q.CATEGORIA)}<br><small>${esc(q.DESCRIPCION || '')}</small></td>
      <td>${esc(q.PRIORIDAD)}</td><td>${esc(txtFecha(q.F_APERTURA))}<br><small>${dias(q.F_APERTURA)} día(s)</small></td><td>${esc(NOMBRE_EQ[q.ESTADO] || q.ESTADO)}</td><td class="firma"></td></tr>`;
  }).join('');
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Pendientes por atender ${hoyISO()}</title>
    <style>body{font-family:system-ui,sans-serif;color:#0d253d;margin:24px}h1{font-size:20px;margin:0}p{margin:4px 0 16px;color:#536580}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #c9d3df;padding:6px;vertical-align:top;text-align:left}
    th{background:#0c2447;color:#fff}small{color:#536580}.firma{width:90px}@page{size:A4;margin:12mm}</style></head><body>
    <h1>D@NDINET · Pendientes por atender</h1><p>${esc(txtFecha(hoyISO()))} · ${lista.length} pendiente(s)${FILTRO_PEND.zona ? ' · zona ' + esc(FILTRO_PEND.zona) : ''}${FILTRO_PEND.cat ? ' · ' + esc(NOMBRE_CAT[FILTRO_PEND.cat]) : ''}</p>
    <table><thead><tr><th>#</th><th>Cliente</th>${conUbic ? '<th>Teléfono</th>' : ''}<th>Problema</th><th>Prioridad</th><th>Desde</th><th>Estado</th><th>Atendido / firma</th></tr></thead>
    <tbody>${filas || '<tr><td colspan="8">Sin pendientes</td></tr>'}</tbody></table>
    <script>window.onload = function () { window.print(); };<\/script></body></html>`);
  w.document.close();
}

// ============================================================================
// SEGUIMIENTO (agenda de la macro): a quién hay que volver a ver
// ============================================================================
export function vSeguimiento(ui) {
  const hoy = hoyISO(), diasSeg = Number(D.config.DIAS_SEGUIMIENTO || 5);
  const enDeuda = (id) => (D.porId[id] || {}).ESTADO_INFORME !== 'AL_DIA_SALIO' && Number((D.estados[id] || {}).MONTO) > 0;
  const restarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const grupos = { vencidas: [], proximas: [], hasta: [], sinRespuesta: [], pago: [] };
  for (const c of D.clientes) {
    const id = c.ID_CLIENTE, ult = gestionesDe(id)[0], e = D.estados[id] || {};
    const fUlt = ult ? String(ult.FECHA).slice(0, 10) : '';
    if (ult && ult.TIPO === 'PROMESA_PAGO' && enDeuda(id)) {
      const fc = String(ult.FECHA_COMPROMISO).slice(0, 10);
      if (fc < hoy) grupos.vencidas.push([c, `prometió pagar el ${txtFecha(fc)}`]);
      else if (fc <= restarDias(hoy, -2)) grupos.proximas.push([c, `paga el ${txtFecha(fc)}`]);
    }
    if (c.NO_ENVIAR_HASTA && String(c.NO_ENVIAR_HASTA).slice(0, 10) <= hoy && enDeuda(id)) grupos.hasta.push([c, `la pausa de avisos terminó el ${txtFecha(c.NO_ENVIAR_HASTA)}`]);
    const ua = String(e.ULT_AVISO || '').slice(0, 10);
    if (ua && ua <= restarDias(hoy, diasSeg) && enDeuda(id) && (!fUlt || fUlt < ua)) grupos.sinRespuesta.push([c, `avisado el ${txtFecha(ua)} y sigue debiendo`]);
    if (ult && ult.TIPO === 'PAGO_POR_CONFIRMAR' && c.ESTADO_INFORME !== 'AL_DIA_SALIO') grupos.pago.push([c, `dijo que pagó el ${txtFecha(fUlt)}: se confirma con el próximo informe`]);
  }
  const seccion = (clave, titulo, explica) => {
    const l = grupos[clave];
    return `<details class="plegable" ${l.length ? 'open' : ''}><summary>${titulo} (${l.length})</summary><p class="sub">${explica}</p><ul class="lista">${l.map(([c, motivo]) => `<li><a href="#/cliente/${esc(c.ID_CLIENTE)}">
      <div><b>${esc(c.NOMBRES)}</b><small>${esc(c.ZONA || '')} · ${esc(motivo)}</small></div>
      <div class="der"><small>${soles((D.estados[c.ID_CLIENTE] || {}).MONTO)}</small></div></a></li>`).join('') || '<li class="vacio">Nadie.</li>'}</ul></details>`;
  };
  recordarLista([...new Set(Object.values(grupos).flat().map(([c]) => c.ID_CLIENTE))]);
  const pend = D.quejas.filter(quejaAbierta).length;
  ui.vista().innerHTML = `<div class="titulo-fila"><h2>Seguimiento</h2>${ayuda('seguimiento')}</div>
    ${pend ? `<a class="cta" href="#/pendientes">${ic('alerta')}<span class="txt"><b>${pend} pendiente(s) por atender</b><small>Reclamos, números equivocados, pedidos de corte o baja</small></span>${ic('flecha', 'fin')}</a>` : ''}
    ${seccion('vencidas', 'Promesas de pago vencidas', 'Prometieron pagar y siguen en el informe.')}
    ${seccion('proximas', 'Promesas para hoy y los próximos 2 días', 'Para recordarles a tiempo.')}
    ${seccion('sinRespuesta', `Avisados sin pago (más de ${diasSeg} días)`, 'Se les avisó y no hubo gestión después.')}
    ${seccion('hasta', 'Pausa de avisos terminada', 'Ya se les puede volver a avisar.')}
    ${seccion('pago', 'Dicen que pagaron', 'No reciben avisos; el próximo informe lo confirma.')}`;
}
