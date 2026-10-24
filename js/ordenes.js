// ÓRDENES DE TRABAJO, VISITAS, RUTA Y EQUIPO (fase 5)
// - Órdenes: lista con filtros; "Nueva orden" elige tipo, quién va, fecha y clientes (con sus pendientes).
// - Visita: resultado con botones grandes, nota, foto (se achica en el celular) y GPS del lugar.
// - Ruta: mapa con las visitas numeradas desde donde está el técnico; abre la ruta en Google Maps.
// - Equipo (administrador): zonas de cada usuario = a quiénes envía avisos y atiende.
import { D, esc, txtFecha, hoyISO, ahoraISO, txtTel, claseEstado, aplicarLocal, telefonosDe, alertasDe, gpsDe, distanciaM, quejaAbiertaD, buscarClientes } from './datos.js';
import { ic } from './iconos.js';
import { ayuda, celebrar, globo } from './ayuda.js';
import { cargarLeaflet, miUbicacion } from './mapa.js';

export const TIPOS_ORDEN = {
  VISITA_COBRO: ['Visita de cobro', 'cobrar', 'Avisar en persona a quien no tiene WhatsApp'],
  REVISION: ['Revisión técnica', 'router', 'Sin servicio, señal lenta, equipo'],
  CORTE: ['Corte', 'cortar', 'Cliente para corte (ya avisado)'],
  RECONEXION: ['Reconexión', 'wifi', 'Volver a dar el servicio'],
  DATOS: ['Actualizar datos', 'ubicacion', 'Teléfono, referencia o ubicación'],
  OTRO: ['Otro', 'documento', ''],
};
const RES = { HECHO: ['✓ Hecho', 'verde'], NO_HECHO: ['✗ No se pudo', ''], NO_ESTABA: ['🏠 No estaba', ''] };
const NOMBRE_ESTADO = { PENDIENTE: 'Por hacer', EN_CURSO: 'En curso', CERRADA: 'Terminada', ANULADA: 'Anulada', HECHO: 'Hecho', NO_HECHO: 'No se pudo', NO_ESTABA: 'No estaba' };
const CAT_QUEJA = { SIN_SERVICIO: 'Sin servicio', SENAL_LENTA: 'Señal lenta', EQUIPO: 'Equipo', NUMERO_EQUIVOCADO: 'Número equivocado', RECLAMO_COBRO: 'Reclamo de cobro',
  SOLICITA_CORTE: 'Pide corte', SOLICITA_BAJA: 'Pide baja', OTRO: 'Otro' };
const nombreUsuario = (email) => { const u = D.usuarios.find((x) => String(x.EMAIL).toLowerCase() === String(email).toLowerCase()); return u ? u.NOMBRE : String(email || '').split('@')[0]; };
const visitasDeOt = (id) => D.ordenesDet.filter((d) => d.ID_OT === id).sort((a, b) => Number(a.ORDEN_RUTA || 0) - Number(b.ORDEN_RUTA || 0));
const local = (id) => String(id).startsWith('LOCAL');
async function hacer(ui, tipo, datos) { await ui.encolar(tipo, datos); await aplicarLocal(tipo, datos); }

// ============================================================================
// LISTA DE ÓRDENES
// ============================================================================
const FILTRO = { estado: 'abiertas', tecnico: '' };
export function vOrdenes(ui) {
  const tec = ui.esTecnico();
  const abierta = (o) => ['PENDIENTE', 'EN_CURSO'].includes(o.ESTADO);
  const todas = D.ordenes.slice().sort((a, b) => abierta(b) - abierta(a) || String(a.F_PROGRAMADA).localeCompare(String(b.F_PROGRAMADA)) || String(b.F_CREACION).localeCompare(String(a.F_CREACION)));
  const lista = todas.filter((o) => (FILTRO.estado === 'todas' || (FILTRO.estado === 'abiertas' ? abierta(o) : !abierta(o)))
    && (!FILTRO.tecnico || String(o.TECNICO).toLowerCase() === FILTRO.tecnico));
  const porHacer = D.ordenesDet.filter((d) => d.ESTADO === 'PENDIENTE' && abierta(D.ordenes.find((o) => o.ID_OT === d.ID_OT) || {})).length;
  const tecnicos = [...new Set(D.ordenes.map((o) => String(o.TECNICO).toLowerCase()))].filter(Boolean);
  ui.vista().innerHTML = `<div class="titulo-fila"><h2>${tec ? 'Mis órdenes' : 'Órdenes'}</h2>${ayuda('ordenes')}</div>
    <div class="botones"><button class="btn verde" id="nueva">${ic('agregar')}Nueva orden</button><a class="btn" href="#/ruta">${ic('ruta')}Ruta (${porHacer})</a></div>
    <div class="segmentos" role="tablist">${[['abiertas', 'Por hacer'], ['cerradas', 'Terminadas'], ['todas', 'Todas']].map(([k, t]) =>
      `<button class="${FILTRO.estado === k ? 'sel' : ''}" data-f="${k}" role="tab" aria-selected="${FILTRO.estado === k}">${t}</button>`).join('')}</div>
    ${!tec && tecnicos.length > 1 ? `<label class="filtros">Quién<select id="fTec"><option value="">Todos</option>${tecnicos.map((t) => `<option value="${esc(t)}" ${FILTRO.tecnico === t ? 'selected' : ''}>${esc(nombreUsuario(t))}</option>`).join('')}</select></label>` : ''}
    <ul class="tarjetas-lista">${lista.map((o) => {
      const v = visitasDeOt(o.ID_OT), hechas = v.filter((d) => d.ESTADO !== 'PENDIENTE').length, [nom, ico] = TIPOS_ORDEN[o.TIPO] || [o.TIPO, 'documento'];
      const atrasada = abierta(o) && String(o.F_PROGRAMADA).slice(0, 10) < hoyISO();
      return `<li><a class="tarjeta-ot" href="#/orden/${esc(o.ID_OT)}"><span class="ico-ot">${ic(ico)}</span>
        <span class="txt"><b>${esc(nom)}</b><small>${esc(o.ZONA || '')}${!tec ? ' · ' + esc(nombreUsuario(o.TECNICO)) : ''} · ${esc(txtFecha(o.F_PROGRAMADA))}${atrasada ? ' · <span class="rojo">atrasada</span>' : ''}</small>
        <span class="progreso-mini"><i style="width:${v.length ? Math.round(hechas / v.length * 100) : 0}%"></i></span></span>
        <span class="der"><span class="chip ${claseEstado(o.ESTADO)}">${esc(NOMBRE_ESTADO[o.ESTADO] || o.ESTADO)}</span><small>${hechas}/${v.length}</small></span></a></li>`;
    }).join('') || `<li class="vacio-grande">${ic('check')}<span>${FILTRO.estado === 'abiertas' ? 'No hay visitas por hacer.' : 'No hay órdenes.'}</span></li>`}</ul>`;
  ui.vista().querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { FILTRO.estado = b.dataset.f; vOrdenes(ui); }; });
  const ft = ui.vista().querySelector('#fTec'); if (ft) ft.onchange = () => { FILTRO.tecnico = ft.value; vOrdenes(ui); };
  ui.vista().querySelector('#nueva').onclick = () => modalNuevaOrden(ui, {}, () => vOrdenes(ui));
}

// ============================================================================
// DETALLE DE UNA ORDEN
// ============================================================================
export function vOrden(id, ui) {
  const o = D.ordenes.find((x) => x.ID_OT === id);
  if (!o) { ui.vista().innerHTML = `<p class="aviso error">${ic('alerta')}<span>Orden no encontrada (¿falta sincronizar?).</span></p><a class="btn" href="#/ordenes">Volver</a>`; return; }
  const tec = ui.esTecnico(), v = visitasDeOt(id), [nom, ico] = TIPOS_ORDEN[o.TIPO] || [o.TIPO, 'documento'];
  const abierta = ['PENDIENTE', 'EN_CURSO'].includes(o.ESTADO), mia = String(o.TECNICO).toLowerCase() === String((ui.perfil() || {}).email).toLowerCase();
  ui.vista().innerHTML = `<section class="cabeza-ot"><span class="ico-ot grande">${ic(ico)}</span><div><h2>${esc(nom)}</h2>
      <p class="sub">${esc(o.ID_OT)} · ${esc(txtFecha(o.F_PROGRAMADA))} · ${esc(nombreUsuario(o.TECNICO))}</p></div>
      <span class="chip ${claseEstado(o.ESTADO)}">${esc(NOMBRE_ESTADO[o.ESTADO] || o.ESTADO)}</span></section>
    ${o.TITULO ? `<p class="nota">${esc(o.TITULO)}</p>` : ''}
    <div class="botones">${abierta ? `<a class="btn" href="#/ruta/${esc(id)}">${ic('ruta')}Ver ruta</a>` : ''}
      ${!tec && abierta && !local(id) ? `<button class="btn secundario" id="reasignar">${ic('equipo')}Reasignar</button><button class="btn secundario" id="anular">${ic('anular')}Anular</button>` : ''}</div>
    <ol class="visitas">${v.map((d) => filaVisita(d, abierta && (mia || !tec))).join('') || '<li class="vacio">Sin visitas.</li>'}</ol>
    <a class="btn secundario" href="#/ordenes">${ic('atras')}Volver</a>`;
  const recargar = () => vOrden(id, ui);
  ui.vista().querySelectorAll('[data-visita]').forEach((b) => { b.onclick = () => modalVisita(ui, b.dataset.visita, recargar); });
  ui.vista().querySelectorAll('[data-quejainfo]').forEach((b) => { b.onclick = () => {
    const q = D.quejas.find((x) => x.ID_QUEJA === b.dataset.quejainfo) || {};
    globo(b, `<b>${esc(CAT_QUEJA[q.CATEGORIA] || 'Pendiente')}</b><p>${esc(q.DESCRIPCION || 'Sin detalle')}</p><small>${esc(txtFecha(q.F_APERTURA))} · prioridad ${esc(q.PRIORIDAD || '')}</small>`);
  }; });
  const re = ui.vista().querySelector('#reasignar');
  if (re) re.onclick = () => {
    const m = ui.modal(`<h3>Reasignar ${esc(id)}</h3><label>¿Quién va?<select id="rT">${opcionesEquipo(o.TECNICO)}</select></label>
      <label>Fecha<input type="date" id="rF" value="${esc(String(o.F_PROGRAMADA).slice(0, 10))}"></label>
      <div class="acciones"><button class="btn" id="rNo">Cancelar</button><button class="btn verde" id="rSi">Guardar</button></div>`);
    m.querySelector('#rNo').onclick = ui.cerrarModal;
    m.querySelector('#rSi').onclick = async () => {
      const t = m.querySelector('#rT').value, f = m.querySelector('#rF').value;
      ui.cerrarModal();
      await hacer(ui, 'ACTUALIZAR_ORDEN', { idOt: id, tecnico: t !== o.TECNICO ? t : undefined, fProgramada: f !== String(o.F_PROGRAMADA).slice(0, 10) ? f : undefined });
      ui.aviso('Orden actualizada.'); recargar();
    };
  };
  const an = ui.vista().querySelector('#anular');
  if (an) an.onclick = () => {
    const m = ui.modal(`<h3>Anular ${esc(id)}</h3><p class="sub">Los pendientes de esta orden vuelven a "por atender".</p>
      <label>¿Por qué?<input id="aM" autocomplete="off" placeholder="ej. el cliente ya tiene señal"></label>
      <div class="acciones"><button class="btn" id="aNo">Volver</button><button class="btn rojo" id="aSi">Anular</button></div>`);
    m.querySelector('#aNo').onclick = ui.cerrarModal;
    m.querySelector('#aSi').onclick = async () => {
      const motivo = m.querySelector('#aM').value.trim();
      if (!motivo) return ui.aviso('Escriba el motivo.', 'error');
      ui.cerrarModal(); await hacer(ui, 'ACTUALIZAR_ORDEN', { idOt: id, anular: true, motivo }); ui.aviso('Orden anulada.'); recargar();
    };
  };
}

function filaVisita(d, puedeCerrar) {
  const c = D.porId[d.ID_CLIENTE] || {}, tel = telefonosDe(d.ID_CLIENTE).utiles[0], p = gpsDe(c), q = d.ID_QUEJA && D.quejas.find((x) => x.ID_QUEJA === d.ID_QUEJA);
  const hecha = d.ESTADO !== 'PENDIENTE';
  return `<li class="visita ${hecha ? 'hecha' : ''}"><div class="v-cab"><a href="#/cliente/${esc(d.ID_CLIENTE)}"><b>${esc(c.NOMBRES || d.ID_CLIENTE)}</b></a>
      <span class="chip ${claseEstado(d.ESTADO)}">${esc(NOMBRE_ESTADO[d.ESTADO] || d.ESTADO)}</span></div>
    <small>${esc(c.ZONA || '')}${c.REFERENCIA ? ' · ' + esc(c.REFERENCIA) : ''}</small>
    ${q ? `<button class="chip e-moroso chip-btn" data-quejainfo="${esc(q.ID_QUEJA)}">${ic('alerta')}${esc(CAT_QUEJA[q.CATEGORIA] || q.CATEGORIA)}</button>` : ''}
    ${d.OBS ? `<small class="nota">${esc(d.OBS)}</small>` : ''}
    ${hecha ? `<small>${esc(txtFecha(d.F_EJEC))}${d.RESULTADO ? ' · ' + esc(d.RESULTADO) : ''}${d.FOTO && d.FOTO !== 'por enviar' ? ` · <a href="https://drive.google.com/file/d/${esc(d.FOTO)}/view" target="_blank" rel="noopener">${ic('camara')}foto</a>` : d.FOTO ? ' · foto por enviar' : ''}</small>`
      : `<div class="v-acc">${tel ? `<a class="mini" href="#/cliente/${esc(d.ID_CLIENTE)}">${ic('telefono')}${esc(txtTel(tel.NUMERO))}</a>` : ''}
        ${p ? `<a class="mini" href="https://www.google.com/maps/dir/?api=1&destination=${p.join(',')}" target="_blank" rel="noopener">${ic('flecha')}Cómo llegar</a>` : '<span class="mini apagado">sin ubicación</span>'}
        ${puedeCerrar ? `<button class="mini verde" data-visita="${esc(d.ID_DET)}">${ic('check')}Registrar visita</button>` : ''}</div>`}</li>`;
}

// ============================================================================
// REGISTRAR UNA VISITA (resultado + nota + foto + GPS)
// ============================================================================
export function modalVisita(ui, idDet, alTerminar) {
  const d = D.ordenesDet.find((x) => x.ID_DET === idDet);
  if (!d) return;
  if (local(idDet)) return ui.aviso('La orden aún no llega al servidor: sincronice y vuelva a intentarlo.', 'error');
  const c = D.porId[d.ID_CLIENTE] || {};
  let res = '', foto = '', gps = '';
  const m = ui.modal(`<h3>Visita a ${esc(c.NOMBRES || d.ID_CLIENTE)}</h3><p class="sub">${esc(c.ZONA || '')}${c.REFERENCIA ? ' · ' + esc(c.REFERENCIA) : ''}</p>
    <p class="etq-paso">1. ¿Cómo fue?</p>
    <div class="opciones-grandes">${Object.entries(RES).map(([k, [t]]) => `<button class="opcion" data-res="${k}">${t}</button>`).join('')}</div>
    <p class="etq-paso">2. Nota <small id="vObl"></small></p>
    <textarea id="vObs" rows="2" placeholder="ej. se cambió el conector · casa cerrada · pidió volver el lunes"></textarea>
    <p class="etq-paso">3. Foto y ubicación (opcional)</p>
    <div class="botones"><label class="btn" for="vFoto">${ic('camara')}Tomar foto</label><input type="file" id="vFoto" accept="image/*" capture="environment" hidden>
      <button class="btn" id="vGps">${ic('ubicacion')}Ubicación</button></div>
    <div id="vPrev" class="foto-prev-v" hidden></div><p class="sub" id="vGpsTxt">${ic('ubicacion')} Buscando su ubicación…</p>
    <div class="acciones"><button class="btn" id="vNo">Cancelar</button><button class="btn verde" id="vSi" disabled>Guardar visita</button></div>`);
  const q = (s) => m.querySelector(s);
  const pedirGps = () => miUbicacion().then((u) => { gps = u.valor; q('#vGpsTxt').innerHTML = `${ic('check')} Ubicación tomada (±${u.precision} m)`; })
    .catch(() => { q('#vGpsTxt').textContent = 'Sin ubicación (puede guardar igual).'; });
  pedirGps();
  q('#vGps').onclick = pedirGps;
  m.querySelectorAll('[data-res]').forEach((b) => { b.onclick = () => {
    res = b.dataset.res;
    m.querySelectorAll('[data-res]').forEach((x) => x.classList.toggle('sel', x === b));
    q('#vObl').textContent = res === 'HECHO' ? '(opcional)' : '(obligatoria: ¿por qué?)';
    q('#vSi').disabled = false;
  }; });
  q('#vFoto').onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      foto = await comprimirFoto(f);
      q('#vPrev').hidden = false;
      q('#vPrev').innerHTML = `<img src="${foto}" alt="Foto de la visita"><button class="mini" id="vQuitar">Quitar</button>`;
      q('#vQuitar').onclick = () => { foto = ''; q('#vPrev').hidden = true; };
    } catch (err) { ui.aviso(err.message, 'error'); }
  };
  q('#vNo').onclick = ui.cerrarModal;
  q('#vSi').onclick = async () => {
    const obs = q('#vObs').value.trim();
    if (res !== 'HECHO' && !obs) { q('#vObs').focus(); return ui.aviso('Escriba por qué no se pudo.', 'error'); }
    ui.cerrarModal();
    await hacer(ui, 'CERRAR_VISITA', { idDet, resultado: res, obs, gps, foto, fecha: ahoraISO() });
    celebrar(res === 'HECHO' ? '¡Visita hecha!' : 'Visita registrada', (c.NOMBRES || '') + (navigator.onLine ? '' : ' · se enviará al volver la señal'), res === 'HECHO' ? 'ok' : 'aviso');
    alTerminar && alTerminar();
  };
}

/** Achica la foto a 1024 px (JPEG ~100 KB) para que viaje rápido y sin señal. */
export function comprimirFoto(file) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1024 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      ok(cv.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo leer la foto.')); };
    img.src = url;
  });
}

// ============================================================================
// NUEVA ORDEN
// ============================================================================
function opcionesEquipo(sel) {
  const lista = D.usuarios.filter((u) => u.ACTIVO !== 'No').sort((a, b) => (a.ROL === 'TECNICO' ? 0 : 1) - (b.ROL === 'TECNICO' ? 0 : 1));
  if (!lista.length && D._s) lista.push({ EMAIL: D._s.usuario, NOMBRE: 'Yo' });
  return lista.map((u) => `<option value="${esc(u.EMAIL)}" ${String(sel).toLowerCase() === String(u.EMAIL).toLowerCase() ? 'selected' : ''}>${esc(u.NOMBRE)}${u.ROL === 'TECNICO' ? ' (técnico)' : ''}${u.ZONAS ? ' · ' + esc(u.ZONAS) : ''}</option>`).join('');
}

/** preset: { tipo, clientes: [id], idQueja } */
export function modalNuevaOrden(ui, preset = {}, alTerminar) {
  const tec = ui.esTecnico(), sel = new Map();   // idCliente → idQueja
  const quejaDe = (id) => { const qs = D.quejas.filter((q) => q.ID_CLIENTE === id && q.ESTADO === 'ABIERTA'); return (qs.find((q) => q.PRIORIDAD === 'ALTA') || qs[0] || {}).ID_QUEJA || ''; };
  (preset.clientes || []).forEach((id) => sel.set(id, preset.idQueja || quejaDe(id)));
  let tipo = preset.tipo || (preset.idQueja ? 'REVISION' : 'VISITA_COBRO'), filtroC = 'atender', zona = '', texto = '';
  const zonas = [...new Set(D.clientes.map((c) => c.ZONA).filter(Boolean))].sort();
  const m = ui.modal(`<h3>Nueva orden</h3>
    <p class="etq-paso">1. ¿Qué hay que hacer?</p>
    <div class="tipos-ot">${Object.entries(TIPOS_ORDEN).map(([k, [t, i]]) => `<button class="tipo-ot ${k === tipo ? 'sel' : ''}" data-tipo="${k}">${ic(i)}<span>${t}</span></button>`).join('')}</div>
    <p class="etq-paso">2. ¿Quién y cuándo?</p>
    <div class="fila2">${tec ? '<p class="sub">Va usted.</p>' : `<label>Quién va<select id="oT">${opcionesEquipo((ui.perfil() || {}).email)}</select></label>`}
      <label>Fecha<input type="date" id="oF" value="${hoyISO()}" min="${hoyISO()}"></label></div>
    <label>Nota para el técnico (opcional)<input id="oN" autocomplete="off" placeholder="ej. llevar conector, cobrar en efectivo no"></label>
    <p class="etq-paso">3. Clientes <span class="cuenta-sel" id="oCuenta"></span></p>
    <div class="filtros-envio"><label>Zona<select id="oZ"><option value="">Todas</option>${zonas.map((z) => `<option>${esc(z)}</option>`).join('')}</select></label>
      <label>Mostrar<select id="oFil"><option value="atender">Por atender</option><option value="sinwa">Sin WhatsApp</option><option value="pend">Con pendiente</option>
        <option value="corte">Para corte</option><option value="todos">Todos</option></select></label></div>
    <input class="buscador" id="oQ" type="search" placeholder="Buscar nombre, teléfono o referencia" autocomplete="off">
    <ul class="lista compacta selector" id="oLista"></ul>
    <div class="acciones"><button class="btn" id="oNo">Cancelar</button><button class="btn verde" id="oSi">Crear orden</button></div>`);
  const q = (s) => m.querySelector(s);
  const filtros = {
    atender: (id) => alertasDe(id).some((a) => ['sinwa', 'pendiente', 'corte', 'sintel'].includes(a.k)),
    sinwa: (id) => telefonosDe(id).resumen === 'SIN_WHATSAPP' || telefonosDe(id).resumen === 'SIN_TELEFONO',
    pend: (id) => D.quejas.some((x) => x.ID_CLIENTE === id && quejaAbiertaD(x)),
    corte: (id) => (D.estados[id] || {}).ESTADO === 'Para corte',
    todos: () => true,
  };
  const pintar = () => {
    const base = texto ? buscarClientes(texto, 400) : D.clientes;
    const cand = base.filter((c) => (!zona || c.ZONA === zona) && (sel.has(c.ID_CLIENTE) || filtros[filtroC](c.ID_CLIENTE)));
    cand.sort((a, b) => sel.has(b.ID_CLIENTE) - sel.has(a.ID_CLIENTE));
    q('#oLista').innerHTML = cand.slice(0, 80).map((c) => {
      const al = alertasDe(c.ID_CLIENTE).filter((a) => a.k !== 'visita').slice(0, 2);
      return `<li class="tel"><label class="check"><input type="checkbox" data-c="${esc(c.ID_CLIENTE)}" ${sel.has(c.ID_CLIENTE) ? 'checked' : ''}>
        <span><b>${esc(c.NOMBRES || c.ID_CLIENTE)}</b><small>${esc(c.ZONA || '')} ${al.map((a) => `<span class="chip ${a.cls}">${esc(a.txt)}</span>`).join(' ')}</small></span></label></li>`;
    }).join('') || '<li class="vacio">Nadie con esos filtros.</li>';
    q('#oCuenta').textContent = sel.size ? `(${sel.size} elegido${sel.size > 1 ? 's' : ''})` : '';
    m.querySelectorAll('[data-c]').forEach((x) => { x.onchange = () => { if (x.checked) sel.set(x.dataset.c, quejaDe(x.dataset.c)); else sel.delete(x.dataset.c); q('#oCuenta').textContent = sel.size ? `(${sel.size} elegido${sel.size > 1 ? 's' : ''})` : ''; }; });
  };
  m.querySelectorAll('[data-tipo]').forEach((b) => { b.onclick = () => { tipo = b.dataset.tipo; m.querySelectorAll('[data-tipo]').forEach((x) => x.classList.toggle('sel', x === b)); }; });
  q('#oZ').onchange = (e) => { zona = e.target.value; pintar(); };
  q('#oFil').onchange = (e) => { filtroC = e.target.value; pintar(); };
  q('#oQ').oninput = (e) => { texto = e.target.value; pintar(); };
  pintar();
  q('#oNo').onclick = ui.cerrarModal;
  q('#oSi').onclick = async () => {
    if (!sel.size) return ui.aviso('Elija al menos un cliente.', 'error');
    if (sel.size > 60) return ui.aviso('Máximo 60 clientes por orden.', 'error');
    const d = { tipo, fProgramada: q('#oF').value || hoyISO(), titulo: q('#oN').value.trim(), clientes: [...sel].map(([idCliente, idQueja]) => ({ idCliente, idQueja: local(idQueja) ? '' : idQueja })) };
    if (!tec) d.tecnico = q('#oT').value;
    ui.cerrarModal();
    await hacer(ui, 'CREAR_ORDEN', d);
    celebrar('Orden creada', `${sel.size} visita(s) · ${tec ? 'para usted' : nombreUsuario(d.tecnico)}`);
    alTerminar && alTerminar();
  };
}

// ============================================================================
// RUTA: visitas por hacer en el mapa, ordenadas desde donde está el técnico
// ============================================================================
let RUTA_POS = null;
export async function vRuta(ui, idOt) {
  // el técnico solo recibe sus órdenes; el administrador ve las de todos
  const vigente = (o) => o && ['PENDIENTE', 'EN_CURSO'].includes(o.ESTADO) && (!idOt || o.ID_OT === idOt);
  let lista = D.ordenesDet.filter((d) => d.ESTADO === 'PENDIENTE' && vigente(D.ordenes.find((o) => o.ID_OT === d.ID_OT)))
    .map((d) => ({ d, c: D.porId[d.ID_CLIENTE] || {}, p: gpsDe(D.porId[d.ID_CLIENTE]) }));
  // vecino más cercano desde la posición (o el orden de la orden)
  const ordenar = () => {
    const con = lista.filter((x) => x.p), sin = lista.filter((x) => !x.p), out = [];
    let pos = RUTA_POS;
    while (con.length) {
      let k = 0;
      if (pos) { let best = Infinity; con.forEach((x, i) => { const dd = distanciaM(pos, x.p); if (dd < best) { best = dd; k = i; } }); }
      const x = con.splice(k, 1)[0]; x.dist = pos ? distanciaM(pos, x.p) : null; out.push(x); pos = x.p;
    }
    lista = out.concat(sin);
  };
  ordenar();
  const km = (m) => (m == null ? '' : m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km');
  const gmaps = () => {
    const pts = lista.filter((x) => x.p).slice(0, 10).map((x) => x.p.join(','));
    if (!pts.length) return '';
    const dest = pts.pop();
    return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + dest + (pts.length ? '&waypoints=' + encodeURIComponent(pts.join('|')) : '');
  };
  ui.vista().innerHTML = `<div class="titulo-fila"><h2>${idOt ? 'Ruta de ' + esc(idOt) : 'Mi ruta'}</h2>${ayuda('ordenes')}</div>
    <div class="botones"><button class="btn" id="desdeAqui">${ic('ubicacion')}Ordenar desde aquí</button>${gmaps() ? `<a class="btn verde" href="${gmaps()}" target="_blank" rel="noopener">${ic('ruta')}Abrir en Google Maps</a>` : ''}</div>
    <div class="mapa mapa-ruta" id="mapaRuta"></div>
    <ol class="visitas">${lista.map((x, k) => `<li class="visita"><div class="v-cab"><span class="num">${x.p ? k + 1 : '–'}</span><a href="#/cliente/${esc(x.d.ID_CLIENTE)}"><b>${esc(x.c.NOMBRES || x.d.ID_CLIENTE)}</b></a>
        <small>${x.dist != null ? km(x.dist) : x.p ? '' : 'sin ubicación'}</small></div>
      <small>${esc((TIPOS_ORDEN[(D.ordenes.find((o) => o.ID_OT === x.d.ID_OT) || {}).TIPO] || [''])[0])} · ${esc(x.c.ZONA || '')}${x.c.REFERENCIA ? ' · ' + esc(x.c.REFERENCIA) : ''}</small>
      <div class="v-acc">${x.p ? `<a class="mini" href="https://www.google.com/maps/dir/?api=1&destination=${x.p.join(',')}" target="_blank" rel="noopener">${ic('flecha')}Ir</a>` : ''}
        <button class="mini verde" data-visita="${esc(x.d.ID_DET)}">${ic('check')}Registrar</button></div></li>`).join('') || `<li class="vacio-grande">${ic('check')}<span>No hay visitas por hacer.</span></li>`}</ol>`;
  ui.vista().querySelectorAll('[data-visita]').forEach((b) => { b.onclick = () => modalVisita(ui, b.dataset.visita, () => vRuta(ui, idOt)); });
  ui.vista().querySelector('#desdeAqui').onclick = async () => {
    try { ui.aviso('Buscando su ubicación…'); const u = await miUbicacion(); RUTA_POS = u.valor.split(',').map(Number); vRuta(ui, idOt); }
    catch (e) { ui.aviso(e.message, 'error'); }
  };
  // mapa
  const caja = ui.vista().querySelector('#mapaRuta');
  if (!navigator.onLine || !lista.some((x) => x.p)) { caja.hidden = true; return; }
  try {
    const L = await cargarLeaflet();
    if (!document.body.contains(caja)) return;
    const mapa = L.map(caja, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
    const pts = [];
    lista.filter((x) => x.p).forEach((x, k) => {
      pts.push(x.p);
      L.marker(x.p, { icon: L.divIcon({ className: 'pin-num', html: `<span>${k + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }) })
        .addTo(mapa).bindPopup(`<b>${esc(x.c.NOMBRES || '')}</b><br>${esc(x.c.REFERENCIA || x.c.ZONA || '')}<br><a href="#/cliente/${esc(x.d.ID_CLIENTE)}">Ver ficha</a>`);
    });
    if (RUTA_POS) { L.circleMarker(RUTA_POS, { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(mapa).bindPopup('Usted'); pts.unshift(RUTA_POS); }
    L.polyline(pts, { color: getComputedStyle(document.documentElement).getPropertyValue('--c-primario').trim() || '#533afd', weight: 3, opacity: 0.6, dashArray: '6 6' }).addTo(mapa);
    mapa.fitBounds(L.latLngBounds(pts).pad(0.15), { maxZoom: 16 });
    window.addEventListener('hashchange', () => mapa.remove(), { once: true });
  } catch (e) { caja.innerHTML = `<p class="aviso">${esc(e.message)}</p>`; }
}

// ============================================================================
// EQUIPO (administrador): zonas de cada usuario
// ============================================================================
export function vEquipo(ui) {
  const zonas = [...new Set(D.clientes.map((c) => String(c.ZONA || '').toUpperCase()).filter(Boolean))].sort();
  const cuenta = (zs) => D.clientes.filter((c) => zs.includes(String(c.ZONA || '').toUpperCase())).length;
  const libres = zonas.filter((z) => !D.usuarios.some((u) => u.ACTIVO !== 'No' && String(u.ZONAS).split(',').includes(z)));
  ui.vista().innerHTML = `<div class="titulo-fila"><h2>Equipo y zonas</h2>${ayuda('equipo')}</div>
    <ul class="tarjetas-lista">${D.usuarios.map((u) => {
      const zs = String(u.ZONAS || '').split(',').filter(Boolean);
      return `<li><button class="tarjeta-ot" data-u="${esc(u.EMAIL)}"><span class="avatar">${esc(String(u.NOMBRE || '?').slice(0, 2).toUpperCase())}</span>
        <span class="txt"><b>${esc(u.NOMBRE)}</b><small>${esc(u.EMAIL)}</small><small>${zs.length ? zs.map((z) => `<span class="chip e-pend">${esc(z)}</span>`).join(' ') + ` · ${cuenta(zs)} clientes` : u.ROL === 'ADMIN' ? 'Todas las zonas' : 'Sin zonas: solo sus órdenes'}</small></span>
        <span class="der"><span class="chip ${u.ACTIVO === 'No' ? 'e-baja' : u.ROL === 'ADMIN' ? 'e-activo' : 'e-porvencer'}">${u.ACTIVO === 'No' ? 'Inactivo' : u.ROL === 'ADMIN' ? 'Administrador' : 'Técnico'}</span></span></button></li>`;
    }).join('')}</ul>
    ${libres.length ? `<p class="aviso">${ic('alerta')}<span>Zonas sin responsable: ${libres.map(esc).join(', ')}</span></p>` : ''}
    <button class="btn verde" id="nuevo">${ic('agregar')}Agregar usuario</button>`;
  const editar = (u) => {
    const zs = String((u && u.ZONAS) || '').split(',').filter(Boolean);
    const m = ui.modal(`<h3>${u ? esc(u.NOMBRE) : 'Nuevo usuario'}</h3>
      ${u ? `<p class="sub">${esc(u.EMAIL)}</p>` : '<label>Correo de Google<input id="uE" type="email" autocomplete="off" placeholder="nombre@gmail.com"></label>'}
      <label>Nombre<input id="uN" value="${esc(u ? u.NOMBRE : '')}" autocomplete="off"></label>
      <label>Rol<select id="uR"><option value="TECNICO" ${!u || u.ROL === 'TECNICO' ? 'selected' : ''}>Técnico (solo sus zonas y órdenes)</option><option value="ADMIN" ${u && u.ROL === 'ADMIN' ? 'selected' : ''}>Administrador (todo)</option></select></label>
      <p class="etq-paso">Zonas que atiende</p>
      <div class="zonas-sel">${zonas.map((z) => `<label class="mini check"><input type="checkbox" value="${esc(z)}" ${zs.includes(z) ? 'checked' : ''}>${esc(z)}</label>`).join('')}</div>
      <label class="check"><input type="checkbox" id="uA" ${!u || u.ACTIVO !== 'No' ? 'checked' : ''}> Activo (puede entrar)</label>
      <div class="acciones"><button class="btn" id="uNo">Cancelar</button><button class="btn verde" id="uSi">Guardar</button></div>`);
    m.querySelector('#uNo').onclick = ui.cerrarModal;
    m.querySelector('#uSi').onclick = async () => {
      const email = u ? u.EMAIL : m.querySelector('#uE').value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return ui.aviso('Correo inválido.', 'error');
      const d = { email, nombre: m.querySelector('#uN').value.trim() || email, rol: m.querySelector('#uR').value,
        zonas: [...m.querySelectorAll('.zonas-sel input:checked')].map((x) => x.value).join(','), activo: m.querySelector('#uA').checked };
      ui.cerrarModal();
      await hacer(ui, 'GUARDAR_USUARIO', d);
      ui.aviso(u ? 'Usuario guardado.' : 'Usuario agregado. Agréguelo también en Google Cloud → Usuarios de prueba.');
      vEquipo(ui);
    };
  };
  ui.vista().querySelectorAll('[data-u]').forEach((b) => { b.onclick = () => editar(D.usuarios.find((x) => x.EMAIL === b.dataset.u)); });
  ui.vista().querySelector('#nuevo').onclick = () => editar(null);
}
