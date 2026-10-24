// PANTALLA ENVÍOS (fase 4): WhatsApp semiautomático, sin API.
// La app arma cada mensaje (reglas de la macro), abre WhatsApp con el texto escrito y usted pulsa
// Enviar. Al volver, marca cómo fue: así se registra el aviso y se diagnostica el número.
// Pestañas: Tanda · Verificar números · Confirmaciones de pago · Hoy · Plantillas.
import { D, esc, soles, txtFecha, txtTel, hoyISO, claseEstado, aplicarLocal, telefonosDe, abrirExterno } from './datos.js';
import { candidatosTanda, candidatosConfirmacion, motivoHorario, armarMensaje, variablesDesconocidas, VARIABLES, ultimoInforme } from './avisos.js';
import { ic } from './iconos.js';
import { ayuda, celebrar } from './ayuda.js';

let PESTANA = 'tanda';
const FILTROS = { zona: '', estado: '', nivel: '' };
let TANDA = null;          // { id, lista, i, enviados, sinWa, fallidos, abierto }
let VERIF = null;          // { lista, i, si, no }

const ESTADOS = ['Por vencer', 'Moroso 1 mes', 'Moroso 2 meses', 'Moroso 3+ meses', 'Para corte'];
const NIVELES = [['', 'Todos los avisos'], ['0', '1.er aviso'], ['1', '2.º aviso'], ['2', 'Aviso de corte (3.º)']];
const WA = { SI: ['WhatsApp ✓', 'e-activo'], NO: ['sin WhatsApp', 'e-moroso'], POR_VERIFICAR: ['por verificar', 'e-porvencer'] };

async function hacer(ui, tipo, datos) { await ui.encolar(tipo, datos); await aplicarLocal(tipo, datos); }
const abrirWa = (numero, texto) => abrirExterno('https://wa.me/' + String(numero).replace(/\D/g, '') + (texto ? '?text=' + encodeURIComponent(texto) : ''));
const enviadosHoy = () => Object.values(D.mensajes).flat().filter((m) => m.ESTADO === 'ENVIADO' && (m.USUARIO === 'yo' || m.USUARIO === D._s?.usuario) && String(m.F_RESULTADO).slice(0, 10) === hoyISO()).length;

/** Durante el mes en paralelo con la macro (fase 7) se recuerda no enviar desde las dos. */
const enParalelo = () => { const i = String(D.config.PARALELO_INICIO || '').slice(0, 10); return i && (Date.parse(hoyISO()) - Date.parse(i)) / 864e5 < 31; };

export function vEnvios(ui, tab) {
  if (tab) PESTANA = tab;
  const v = ui.vista(), cfg = D.config, limite = Number(cfg.LIMITE_DIA || 30), hoyN = enviadosHoy(), horario = motivoHorario(cfg, new Date());
  const tec = ui.esTecnico(), perfil = ui.perfil ? ui.perfil() : null;
  const tabs = [['tanda', 'chat', 'Tanda'], ['verificar', 'check', 'Verificar'], ['confirmar', 'enviado', 'Confirmar pago'], ['hoy', 'reloj', 'Hoy'], ...(tec ? [] : [['plantillas', 'editar', 'Plantillas']])];
  if (!tabs.some(([k]) => k === PESTANA)) PESTANA = 'tanda';
  const pct = Math.min(100, Math.round(hoyN / Math.max(1, limite) * 100));
  v.innerHTML = `<div class="titulo-fila"><h2>Envíos</h2>${ayuda('envios')}</div>
    <div class="estado-envio"><span class="anillo" style="--p:${pct}"><b>${hoyN}</b><small>de ${limite}</small></span>
      <div><b>Enviados hoy desde su celular</b><small>${perfil && perfil.zonas && perfil.zonas.length ? 'Sus zonas: ' + esc(perfil.zonas.join(', ')) : tec ? 'Clientes de sus órdenes' : 'Todas las zonas'}</small>
        ${horario ? `<span class="chip e-moroso">${esc(horario)}</span>` : '<span class="chip e-activo">Horario permitido</span>'}</div></div>
    ${D.informes.some((i) => i.ESTADO === 'APLICADO') ? '' : `<p class="aviso">${ic('alerta')}<span>Primero importe el informe de la Empresa X.</span></p>`}
    ${enParalelo() ? `<p class="aviso">${ic('alerta')}<span>Mes en paralelo: envíe los avisos <b>solo desde la app</b>, no desde la macro.</span></p>` : ''}
    <div class="segmentos iconos" role="tablist">${tabs.map(([k, i, t]) => `<button class="${PESTANA === k ? 'sel' : ''}" data-tab="${k}" role="tab" aria-selected="${PESTANA === k}">${ic(i)}<span>${t}</span></button>`).join('')}</div>
    <div id="tabEnv"></div>`;
  v.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { PESTANA = b.dataset.tab; vEnvios(ui); }; });
  const caja = v.querySelector('#tabEnv');
  ({ tanda: tabTanda, verificar: tabVerificar, confirmar: tabConfirmar, hoy: tabHoy, plantillas: tabPlantillas }[PESTANA] || tabTanda)(ui, caja, { limite, hoyN, horario });
}

// ============================================================================
// TANDA
// ============================================================================
function tabTanda(ui, caja, ctx) {
  if (TANDA) return pintarTanda(ui, caja, ctx);
  const zonas = [...new Set(D.clientes.map((c) => c.ZONA).filter(Boolean))].sort();
  const T = candidatosTanda(D, D.config, hoyISO(), FILTROS);
  const grupos = {};
  T.excluidos.forEach((x) => { const k = x.motivo.replace(/ el \d\d\/\d\d\/\d{4}.*$/, '').replace(/ hasta el .*$/, '').replace(/Ya recibió \d+ avisos/, 'Ya recibió el máximo de avisos'); (grupos[k] = grupos[k] || []).push(x); });
  const restan = Math.max(0, ctx.limite - ctx.hoyN);
  caja.innerHTML = `<div class="titulo-fila sub-titulo"><b>Tanda de avisos</b>${ayuda('tanda')}</div><div class="filtros-envio">
      <label>Zona<select id="fZona"><option value="">Todas</option>${zonas.map((z) => `<option ${FILTROS.zona === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
      <label>Estado<select id="fEstado"><option value="">Todos con deuda</option>${ESTADOS.map((e) => `<option ${FILTROS.estado === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
      <label>Aviso<select id="fNivel">${NIVELES.map(([k, t]) => `<option value="${k}" ${FILTROS.nivel === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <section class="cifras"><div class="ok"><span>Para enviar</span><b>${T.elegibles.length}</b></div><div><span>No se envía</span><b>${T.excluidos.length}</b></div>
      <div class="${restan ? '' : 'peligro'}"><span>Quedan hoy</span><b>${restan}</b></div></section>
    <button class="btn grande verde" id="empezar" ${!T.elegibles.length || !restan || ctx.horario ? 'disabled' : ''}>${ic('chat')}Empezar tanda (${Math.min(T.elegibles.length, restan)})</button>
    ${ctx.horario ? `<p class="aviso error">${ic('alerta')}<span>${esc(ctx.horario)}</span></p>` : ''}
    ${!restan ? `<p class="aviso error">${ic('alerta')}<span>Se alcanzó el límite de ${ctx.limite} mensajes por hoy (cuida el número de WhatsApp).</span></p>` : ''}
    <h3>Primeros de la tanda</h3><ul class="lista compacta">${T.elegibles.slice(0, 8).map((x) => `<li><a href="#/cliente/${esc(x.idCliente)}"><div><b>${esc(x.nombre)}${x.guardado ? ' ⭐' : ''}</b>
      <small>${esc(x.zona)} · ${esc(txtTel(x.telefono.NUMERO))} · ${esc(x.plantilla)} (${x.avisoNivel}.º aviso)</small></div><div class="der"><span class="chip ${claseEstado(x.estado)}">${esc(x.estado)}</span><small>${soles(x.monto)}</small></div></a></li>`).join('') || '<li class="vacio">Nadie para enviar con estos filtros.</li>'}</ul>
    ${T.excluidos.length ? `<details class="plegable"><summary>${ic('info')}Ver por qué no se le envía a ${T.excluidos.length}</summary>
    ${Object.entries(grupos).sort((a, b) => b[1].length - a[1].length).map(([m, l]) => `<details><summary>${esc(m)} (${l.length})</summary><ul class="lista compacta">${l.map((x) =>
      `<li><a href="#/cliente/${esc(x.idCliente)}"><div><b>${esc(x.nombre)}</b><small>${esc(x.zona)} · ${esc(x.motivo)}</small></div></a></li>`).join('')}</ul></details>`).join('')}
    <p class="sub">"Falta verificar" → pestaña <b>Verificar</b>. "Ningún teléfono con WhatsApp" → <a href="#/mapa">Mapa</a> (en persona).</p></details>` : ''}`;
  const cambiar = () => { FILTROS.zona = caja.querySelector('#fZona').value; FILTROS.estado = caja.querySelector('#fEstado').value; FILTROS.nivel = caja.querySelector('#fNivel').value; tabTanda(ui, caja, ctx); };
  ['#fZona', '#fEstado', '#fNivel'].forEach((s) => { caja.querySelector(s).onchange = cambiar; });
  caja.querySelector('#empezar').onclick = () => {
    TANDA = { id: 'TND-' + hoyISO().replace(/-/g, '') + '-' + Date.now().toString(36).slice(-4).toUpperCase(), lista: T.elegibles.slice(0, restan), i: 0, enviados: 0, sinWa: 0, fallidos: 0, abierto: false };
    pintarTanda(ui, caja, ctx);
  };
}

function pintarTanda(ui, caja, ctx) {
  const t = TANDA, x = t.lista[t.i];
  if (!x || enviadosHoy() >= ctx.limite) {
    caja.innerHTML = `<h3>Tanda terminada</h3><section class="cifras"><div class="ok"><span>Enviados</span><b>${t.enviados}</b></div>
      <div class="peligro"><span>Sin WhatsApp</span><b>${t.sinWa}</b></div><div><span>Fallidos</span><b>${t.fallidos}</b></div></section>
      ${enviadosHoy() >= ctx.limite && x ? `<p class="aviso">${ic('alerta')}<span>Se alcanzó el límite diario. Quedaron ${t.lista.length - t.i} para otro día.</span></p>` : ''}
      <button class="btn grande verde" id="otra">Volver a Envíos</button>`;
    caja.querySelector('#otra').onclick = () => { TANDA = null; vEnvios(ui); };
    return;
  }
  const [wt, wc] = WA[x.telefono.WHATSAPP] || WA.POR_VERIFICAR;
  caja.innerHTML = `<div class="progreso-tanda"><b>Mensaje ${t.i + 1} de ${t.lista.length}</b><small>✓ ${t.enviados} · ✗ ${t.sinWa} · fallidos ${t.fallidos}</small>
      <div class="barra"><span style="width:${Math.round(t.i / t.lista.length * 100)}%"></span></div></div>
    <section class="ficha tarjeta-envio"><h3>${esc(x.nombre)}${x.guardado ? ' ⭐' : ''}</h3>
      <p class="sub">${esc(x.zona)} · <span class="chip ${claseEstado(x.estado)}">${esc(x.estado)}</span> · ${soles(x.monto)}</p>
      <p>${ic('telefono')} <b>${esc(txtTel(x.telefono.NUMERO))}</b> <span class="chip ${wc}">${wt}</span> · ${esc(x.plantilla)} (${x.avisoNivel}.º aviso)</p>
      <label>Mensaje (puede corregirlo antes de abrir WhatsApp)<textarea id="txt" rows="10">${esc(x.texto)}</textarea></label>
      ${t.abierto ? `<p class="sub">¿Se envió?</p>
        <button class="btn grande verde" data-r="ENVIADO">✓ Enviado</button>
        <div class="acciones"><button class="btn" data-r="SIN_WHATSAPP">✗ No tiene WhatsApp</button><button class="btn" data-r="FALLIDO">No salió</button></div>
        <button class="btn secundario" id="reabrir">${ic('chat')}Abrir WhatsApp otra vez</button>`
      : `<button class="btn grande verde" id="abrir">${ic('chat')}Abrir WhatsApp</button>`}
      <div class="acciones"><button class="btn secundario" id="saltar">Saltar</button><button class="btn secundario" id="terminar">Terminar tanda</button></div></section>`;
  const abrir = () => { x.texto = caja.querySelector('#txt').value; abrirWa(x.telefono.NUMERO, x.texto); t.abierto = true; pintarTanda(ui, caja, ctx); };
  const ab = caja.querySelector('#abrir'); if (ab) ab.onclick = abrir;
  const re = caja.querySelector('#reabrir'); if (re) re.onclick = abrir;
  caja.querySelector('#saltar').onclick = () => { t.i++; t.abierto = false; pintarTanda(ui, caja, ctx); };
  caja.querySelector('#terminar').onclick = () => { t.lista = t.lista.slice(0, t.i); pintarTanda(ui, caja, ctx); };
  caja.querySelectorAll('[data-r]').forEach((b) => { b.onclick = async () => {
    const r = b.dataset.r;
    await hacer(ui, 'REGISTRAR_ENVIO', { idCliente: x.idCliente, idTel: String(x.telefono.ID_TEL).startsWith('LOCAL') ? '' : x.telefono.ID_TEL, numero: x.telefono.NUMERO,
      plantilla: x.plantilla, avisoNivel: x.avisoNivel, texto: caja.querySelector('#txt').value, resultado: r, idTanda: t.id, fecha: new Date().toISOString() });
    if (r === 'ENVIADO') t.enviados++; else if (r === 'SIN_WHATSAPP') t.sinWa++; else t.fallidos++;
    if (r === 'ENVIADO') celebrar('¡Mensaje enviado!', `${x.nombre} · van ${enviadosHoy()} de ${ctx.limite} hoy`);
    else if (r === 'SIN_WHATSAPP') celebrar('Anotado: no tiene WhatsApp', x.nombre, 'aviso');
    else celebrar('No salió', 'Queda para intentarlo otra vez', 'aviso');
    // sin WhatsApp: si el cliente tiene otro número con WhatsApp, se le ofrece en la misma tanda
    if (r === 'SIN_WHATSAPP') {
      const otro = telefonosDe(x.idCliente).conWa.find((tl) => tl.NUMERO !== x.telefono.NUMERO);
      if (otro && await ui.confirmar(`${txtTel(otro.NUMERO)} sí tiene WhatsApp.`, { titulo: '¿Probar con otro número del cliente?', si: 'Sí, probar', no: 'No' })) {
        t.lista.splice(t.i + 1, 0, Object.assign({}, x, { telefono: otro }));
      } else if (!telefonosDe(x.idCliente).conWa.length) ui.aviso('El cliente no tiene ningún número con WhatsApp: hay que avisarle en persona.', 'error');
    }
    t.i++; t.abierto = false;
    pintarTanda(ui, caja, ctx);
  }; });
}

// ============================================================================
// VERIFICAR NÚMEROS (sin enviar mensajes)
// ============================================================================
function tabVerificar(ui, caja) {
  if (!VERIF) {
    const lista = [];
    for (const c of D.clientes) {
      const deuda = Number((D.estados[c.ID_CLIENTE] || {}).MONTO) > 0;
      telefonosDe(c.ID_CLIENTE).porVer.filter((t) => !String(t.ID_TEL).startsWith('LOCAL')).forEach((t) => lista.push({ c, t, deuda }));
    }
    lista.sort((a, b) => b.deuda - a.deuda || String(a.c.ZONA).localeCompare(String(b.c.ZONA)));
    caja.innerHTML = `<div class="titulo-fila sub-titulo"><b>Verificar números (no envía nada)</b>${ayuda('verificar')}</div>
      <section class="cifras"><div class="${lista.length ? 'peligro' : 'ok'}"><span>Números por verificar</span><b>${lista.length}</b></div>
        <div><span>De clientes con deuda</span><b>${lista.filter((x) => x.deuda).length}</b></div></section>
      <button class="btn grande verde" id="ini" ${lista.length ? '' : 'disabled'}>${ic('check')}Empezar a verificar</button>`;
    const b = caja.querySelector('#ini'); if (b) b.onclick = () => { VERIF = { lista, i: 0, si: 0, no: 0, abierto: false }; tabVerificar(ui, caja); };
    return;
  }
  const s = VERIF, x = s.lista[s.i];
  if (!x) {
    caja.innerHTML = `<h3>Verificación terminada</h3><section class="cifras"><div class="ok"><span>Con WhatsApp</span><b>${s.si}</b></div><div class="peligro"><span>Sin WhatsApp</span><b>${s.no}</b></div></section>
      <button class="btn grande verde" id="fin">Volver</button>`;
    caja.querySelector('#fin').onclick = () => { VERIF = null; tabVerificar(ui, caja); };
    return;
  }
  caja.innerHTML = `<div class="progreso-tanda"><b>Número ${s.i + 1} de ${s.lista.length}</b><small>✓ ${s.si} · ✗ ${s.no}</small>
      <div class="barra"><span style="width:${Math.round(s.i / s.lista.length * 100)}%"></span></div></div>
    <section class="ficha tarjeta-envio"><h3>${esc(x.c.NOMBRES || x.c.ID_CLIENTE)}</h3><p class="sub">${esc(x.c.ZONA || '')}${x.deuda ? ' · con deuda' : ''}</p>
      <p>${ic('telefono')} <b>${esc(txtTel(x.t.NUMERO))}</b></p>
      ${s.abierto ? `<p class="sub">¿Se abrió el chat?</p><div class="acciones"><button class="btn verde" data-w="SI">✓ Tiene WhatsApp</button><button class="btn" data-w="NO">✗ No tiene</button></div>
        <button class="btn secundario" id="abrir">${ic('chat')}Abrir otra vez</button>` : `<button class="btn grande verde" id="abrir">${ic('chat')}Abrir chat (sin enviar)</button>`}
      <div class="acciones"><button class="btn secundario" id="saltar">Saltar</button><button class="btn secundario" id="terminar">Terminar</button></div></section>`;
  caja.querySelector('#abrir').onclick = () => { abrirWa(x.t.NUMERO, ''); s.abierto = true; tabVerificar(ui, caja); };
  caja.querySelector('#saltar').onclick = () => { s.i++; s.abierto = false; tabVerificar(ui, caja); };
  caja.querySelector('#terminar').onclick = () => { s.lista = s.lista.slice(0, s.i); tabVerificar(ui, caja); };
  caja.querySelectorAll('[data-w]').forEach((b) => { b.onclick = async () => {
    await hacer(ui, 'TELEFONO_EDITAR', { idTel: x.t.ID_TEL, whatsapp: b.dataset.w });
    if (b.dataset.w === 'SI') s.si++; else s.no++;
    // el mismo número en otros clientes ya quedó marcado: se saltan
    s.lista = s.lista.filter((y, k) => k <= s.i || y.t.NUMERO !== x.t.NUMERO);
    s.i++; s.abierto = false; tabVerificar(ui, caja);
  }; });
}

// ============================================================================
// CONFIRMACIONES DE PAGO (P8: se envía, pero decide la persona)
// ============================================================================
function tabConfirmar(ui, caja) {
  const lista = candidatosConfirmacion(D, D.config, hoyISO()), inf = ultimoInforme(D);
  caja.innerHTML = `<p class="sub">Clientes que <b>salieron</b> del último informe${inf ? ' (' + esc(inf.PERIODO) + ')' : ''} o <b>bajaron</b> su deuda frente al anterior.
      Revise cada uno y decida si le agradece el pago.</p>
    <ul class="lista compacta">${lista.map((x, k) => `<li class="tel"><div><b>${esc(x.nombre)}</b>
      <small>${esc(x.zona)} · ${x.salio ? 'salió del informe (debía ' + soles(x.antes) + ')' : 'bajó de ' + soles(x.antes) + ' a ' + soles(x.ahora)}${x.telefono ? ' · ' + esc(txtTel(x.telefono.NUMERO)) : ' · sin teléfono'}</small>
      <details><summary>Ver mensaje</summary><p class="mensaje">${esc(x.texto)}</p></details></div>
      <div class="acciones-tel">${x.telefono ? `<button class="mini verde" data-k="${k}">${ic('chat')}Enviar</button>` : ''}<a class="mini" href="#/cliente/${esc(x.idCliente)}">Ficha</a></div></li>`).join('')
      || `<li class="vacio">${D.informes.filter((i) => i.ESTADO === 'APLICADO').length < 2 ? 'Aparecen cuando se aplica el informe del mes siguiente.' : 'No hay confirmaciones pendientes.'}</li>`}</ul>`;
  caja.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => {
    const x = lista[Number(b.dataset.k)];
    abrirWa(x.telefono.NUMERO, x.texto);
    setTimeout(async () => {
      const m = ui.modal(`<h3 id="dlgT">¿Se envió la confirmación?</h3><p class="sub">${esc(x.nombre)} · ${esc(txtTel(x.telefono.NUMERO))}</p>
        <button class="btn grande verde" data-r="ENVIADO">✓ Enviado</button><button class="btn" data-r="SIN_WHATSAPP">✗ No tiene WhatsApp</button><button class="btn secundario" data-r="">No lo envié</button>`);
      m.querySelectorAll('[data-r]').forEach((bb) => { bb.onclick = async () => {
        ui.cerrarModal();
        if (!bb.dataset.r) return;
        await hacer(ui, 'REGISTRAR_ENVIO', { idCliente: x.idCliente, idTel: x.telefono.ID_TEL, numero: x.telefono.NUMERO, plantilla: 'CONFIRMACION_PAGO', avisoNivel: 0, texto: x.texto, resultado: bb.dataset.r, fecha: new Date().toISOString() });
        if (bb.dataset.r === 'ENVIADO') celebrar('¡Confirmación enviada!', x.nombre); else ui.aviso('Anotado: no tiene WhatsApp.');
        tabConfirmar(ui, caja);
      }; });
    }, 600);
  }; });
}

// ============================================================================
// HOY: lo enviado (y marcar lo que no llegó)
// ============================================================================
function tabHoy(ui, caja) {
  const hoy = hoyISO(), ESTADO = { ENVIADO: 'e-activo', SIN_WHATSAPP: 'e-moroso', FALLIDO: 'e-moroso', NO_ENTREGADO: 'e-susp' };
  const ms = Object.values(D.mensajes).flat().filter((m) => String(m.F_RESULTADO).slice(0, 10) === hoy).sort((a, b) => String(b.F_RESULTADO).localeCompare(String(a.F_RESULTADO)));
  caja.innerHTML = `<p class="sub">${ic('info')} Si un mensaje no llegó, toque <b>No llegó</b>: vuelve a la tanda.</p>
    <ul class="lista compacta">${ms.map((m) => { const c = D.porId[m.ID_CLIENTE] || {}; return `<li class="tel"><div><b>${esc(c.NOMBRES || m.ID_CLIENTE)}</b>
      <small><span class="chip ${ESTADO[m.ESTADO] || 'e-pend'}">${esc(m.ESTADO)}</span> ${esc(String(m.F_RESULTADO).slice(11, 16))} · ${esc(m.PLANTILLA)} · ${esc(txtTel(m.NUMERO))}</small></div>
      <div class="acciones-tel">${m.ESTADO === 'ENVIADO' && !String(m.ID_MSG).startsWith('LOCAL') ? `<button class="mini" data-anular="${esc(m.ID_MSG)}">No llegó</button>` : ''}</div></li>`; }).join('') || '<li class="vacio">Hoy no se envió nada.</li>'}</ul>`;
  caja.querySelectorAll('[data-anular]').forEach((b) => { b.onclick = async () => {
    if (!(await ui.confirmar('El mensaje pasa a "no entregado" y deja de contar como aviso.', { titulo: '¿No llegó?', si: 'Marcar no entregado' }))) return;
    await hacer(ui, 'ANULAR_ENVIO', { idMsg: b.dataset.anular, motivo: 'Marcado en la app' }); ui.aviso('Marcado como no entregado.'); tabHoy(ui, caja);
  }; });
}

// ============================================================================
// PLANTILLAS
// ============================================================================
function tabPlantillas(ui, caja) {
  caja.innerHTML = `<p class="sub">Variables: ${VARIABLES.map((x) => `<code>${x}</code>`).join(' ')}</p>
    <ul class="lista compacta">${D.plantillas.map((p) => `<li class="tel"><div><b>${esc(p.NOMBRE)}</b><small>${esc(p.ESTADOS || p.CUANDO || 'uso manual')}</small></div>
      <div class="acciones-tel"><button class="mini" data-p="${esc(p.NOMBRE)}">${ic('editar')}Editar</button></div></li>`).join('')}</ul>
    <button class="btn secundario" id="nueva">${ic('agregar')}Nueva plantilla</button>`;
  caja.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => editarPlantilla(ui, D.plantillas.find((p) => p.NOMBRE === b.dataset.p), () => tabPlantillas(ui, caja)); });
  caja.querySelector('#nueva').onclick = () => editarPlantilla(ui, null, () => tabPlantillas(ui, caja));
}

function editarPlantilla(ui, p, alTerminar) {
  const inf = ultimoInforme(D), ej = D.clientes.find((c) => Number((D.estados[c.ID_CLIENTE] || {}).MONTO) > 0) || {}, ee = D.estados[ej.ID_CLIENTE] || {};
  const m = ui.modal(`<h3 id="dlgT">${p ? 'Plantilla ' + esc(p.NOMBRE) : 'Nueva plantilla'}</h3>
    ${p ? '' : '<label>Nombre (ej. AVISO_MANTENIMIENTO)<input id="pNom" autocomplete="off"></label>'}
    ${p && p.ESTADOS ? `<p class="sub">Se usa para: ${esc(p.ESTADOS)}</p>` : ''}
    <label>Texto<textarea id="pTxt" rows="9">${esc(String(p ? p.TEXTO : '{Saludo} {Nombre}, le escribe {Empresa}.\n\n{Despedida}').replace(/\\n/g, '\n'))}</textarea></label>
    <div class="chips">${VARIABLES.map((x) => `<button class="mini" data-v="${x}">${x}</button>`).join('')}</div>
    <p class="sub" id="pErr"></p><h3>Vista previa${ej.NOMBRES ? ' (' + esc(ej.NOMBRES) + ')' : ''}</h3><p class="mensaje previa" id="pPrev"></p>
    <div class="acciones"><button class="btn" id="pNo">Cancelar</button><button class="btn verde" id="pSi">Guardar</button></div>`);
  const ta = m.querySelector('#pTxt');
  const prev = () => {
    const malas = variablesDesconocidas(ta.value);
    m.querySelector('#pErr').innerHTML = malas.length ? `<span class="error">Variables desconocidas: ${esc(malas.join(', '))}</span>` : `${ta.value.length} caracteres`;
    m.querySelector('#pPrev').textContent = armarMensaje(ta.value, { idCliente: ej.ID_CLIENTE || 'CLI-0001', nombre: ej.NOMBRES || 'Cliente de ejemplo', servicio: ej.SERVICIO, meses: ee.MESES || 2,
      monto: ee.MONTO || 60, plan: ee.PLAN || 30, zona: ej.ZONA || 'ZONA' }, D.config, inf ? inf.PERIODO : hoyISO().slice(0, 7), hoyISO());
  };
  ta.oninput = prev; prev();
  m.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { const i = ta.selectionStart || ta.value.length; ta.value = ta.value.slice(0, i) + b.dataset.v + ta.value.slice(i); ta.focus(); prev(); }; });
  m.querySelector('#pNo').onclick = ui.cerrarModal;
  m.querySelector('#pSi').onclick = async () => {
    const nombre = p ? p.NOMBRE : String(m.querySelector('#pNom').value).trim().toUpperCase().replace(/\s+/g, '_');
    if (!/^[A-Z0-9_]{3,40}$/.test(nombre)) return ui.aviso('Nombre inválido (letras, números y _).', 'error');
    if (variablesDesconocidas(ta.value).length) return ui.aviso('Corrija las variables desconocidas.', 'error');
    if (ta.value.trim().length < 10) return ui.aviso('El texto es muy corto.', 'error');
    ui.cerrarModal();
    await hacer(ui, 'GUARDAR_PLANTILLA', { nombre, texto: ta.value.trim(), estados: p ? undefined : '' });
    ui.aviso('Plantilla guardada.'); alTerminar();
  };
}
