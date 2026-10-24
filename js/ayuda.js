// AYUDA EN PANTALLA: menos texto fijo, más claridad.
// - ayuda('clave') → botón ⓘ; al tocarlo abre un globo flotante con consejos cortos.
// - celebrar(titulo, sub) → confirmación grande y amable (ej. "¡Enviado!"), se cierra sola.
// - globo(el, html) → globo flotante junto a cualquier elemento (para chips con explicación).
import { ic } from './iconos.js';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Consejos por pantalla: título + 2 a 4 ideas cortas. */
export const TEXTOS = {
  inicio: ['Cómo usar el inicio', ['Toque una tarjeta para ir directo a la tarea.', 'Los números rojos son cosas por hacer hoy.',
    '"Qué hacer ahora" le sugiere lo más urgente primero.', 'Sin señal también funciona: lo que haga se envía al volver la conexión.']],
  deuda: ['Estado de la deuda', ['Sale del último Excel de la Empresa X.', 'Por vencer → Moroso 1, 2, 3+ meses → Para corte.',
    'Toque una barra para ver esos clientes.']],
  clientes: ['Buscar clientes', ['Escriba nombre, teléfono, zona o referencia, en cualquier orden.', 'Combine zona, estado y situación para encontrar a quién atender.',
    '🔒 = dato corregido en la app (el Excel ya no lo cambia).']],
  ficha: ['Ficha del cliente', ['Las etiquetas de arriba son lo importante: corte, pausa, pendientes.', 'Toque 📞 o 💬 al lado de cada número para llamar o escribir.',
    'Al volver le preguntamos cómo fue: así sabemos si el número sirve.', 'Use ⋯ Más para editar datos y marcas.']],
  telefonos: ['Teléfonos', ['✓ verde: tiene WhatsApp. ? amarillo: falta comprobar. ✗ rojo: no tiene.', '⭐ = número principal (al que va el aviso).',
    'Si al llamar no es el cliente, márquelo como equivocado: queda pendiente para corregirlo.']],
  envios: ['Envíos por WhatsApp', ['La app arma el mensaje y abre WhatsApp: usted solo pulsa Enviar.', 'Al volver, marque cómo fue (enviado, no tiene WhatsApp, no salió).',
    'Cada celular tiene su límite diario: cuida el número de bloqueos.', 'Cada usuario envía a los clientes de SUS zonas.']],
  tanda: ['Tanda', ['Elija zona y estado; la app ordena primero a los contactos guardados.', 'No se envía a quien pidió NO ENVIAR, pagó, prometió pagar o ya fue avisado hace poco.',
    'Toque "Ver por qué" para ver los excluidos.']],
  verificar: ['Verificar números', ['Abre el chat SIN enviar nada.', 'Si el chat se abre, tiene WhatsApp. Vale para todos los clientes con ese número.']],
  pendientes: ['Pendientes por atender', ['Quejas, números equivocados, reclamos, cortes y bajas.', 'Atienda primero los de prioridad alta y los más antiguos.',
    'Puede mandarlos al técnico con "Crear visita".']],
  ordenes: ['Órdenes y visitas', ['Una orden agrupa visitas para un técnico.', 'En cada visita: resultado, nota, foto y ubicación.',
    'Si el cliente no tenía ubicación, la del lugar se guarda sola.', 'Ruta: ordena las visitas desde donde usted está.']],
  mapa: ['Mapa', ['Rojo: sin WhatsApp (avisar en persona). Naranja: pendiente. Morado: visita.', 'Active "Cerca de mí" al salir: le avisa cuando pase cerca de alguien por atender.',
    'Clientes sin ubicación: márquela con "Estoy aquí" en la ficha.']],
  equipo: ['Equipo', ['Cada usuario trabaja con los clientes de SUS zonas (envíos, datos, visitas).', 'Sin zonas: solo ve los clientes de sus órdenes.',
    'Un usuario nuevo también debe agregarse en Google Cloud → Usuarios de prueba.']],
  reportes: ['Reportes', ['Cada reporte se ve aquí, se imprime o guarda en PDF y se baja a Excel.', 'Ninguno lleva DNI.',
    'Teléfonos y referencias solo salen si REPORTE_CON_UBICACION = SI (Configuración).', 'Lista de corte: el corte lo hace nuestro técnico; desde ahí se crea la orden.']],
  panel: ['Panel de control', ['Elija informe, zona, servicio o estado: todo se recalcula.', 'Pase el dedo sobre una barra para ver su detalle; "Ver tabla" muestra los números.',
    '"Recuperado", la tendencia y la efectividad aparecen desde el segundo informe.', 'Toque una zona para ver sus clientes.']],
  paralelo: ['Marcha en paralelo', ['Durante un mes la app y la macro conviven.', 'Los avisos salen solo desde la app; la macro sirve para comparar.',
    'Cuando todos los pasos estén ✓, la macro queda solo para consulta.']],
  cuadre: ['Cuadre con la macro', ['Importe el mismo informe en las dos y suba aquí la macro.', 'Compara deuda, meses, estado, zona, teléfonos, WhatsApp, NO ENVIAR y último aviso.',
    '"Explicada" = diferencia esperada (ej. la macro usa el sector como zona). "Revisar" = mirar ese cliente.']],
  seguimiento: ['Seguimiento', ['Promesas vencidas: llame primero a estos.', 'Avisados sin pago: ya recibieron aviso y siguen debiendo.']],
};

/** Botón ⓘ (se abre con el manejador global). */
export const ayuda = (clave, etiqueta = 'Ayuda') => `<button type="button" class="ayuda" data-ayuda="${esc(clave)}" aria-label="${esc(etiqueta)}">${ic('info')}</button>`;

/** Globo flotante junto a un elemento. */
export function globo(el, html) {
  cerrarGlobo();
  const g = document.createElement('div');
  g.className = 'globo'; g.id = 'globo'; g.setAttribute('role', 'dialog');
  g.innerHTML = html + '<button type="button" class="globo-x" aria-label="Cerrar">×</button>';
  document.body.appendChild(g);
  const r = el.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 24);
  g.style.width = w + 'px';
  const izq = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
  const abajo = r.bottom + 8 + g.offsetHeight < window.innerHeight;
  g.style.left = izq + 'px';
  g.style.top = (abajo ? r.bottom + 8 : Math.max(12, r.top - 8 - g.offsetHeight)) + window.scrollY + 'px';
  g.classList.add(abajo ? 'abajo' : 'arriba');
  g.querySelector('.globo-x').onclick = cerrarGlobo;
  return g;
}
export function cerrarGlobo() { const g = document.getElementById('globo'); if (g) g.remove(); }

let _iniciado = false;
/** Un solo manejador para todos los ⓘ y para cerrar el globo al tocar fuera. */
export function iniciarAyuda() {
  if (_iniciado) return; _iniciado = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-ayuda]');
    if (b) {
      e.preventDefault(); e.stopPropagation();
      const t = TEXTOS[b.dataset.ayuda];
      if (!t) return;
      if (document.getElementById('globo') && document.getElementById('globo').dataset.de === b.dataset.ayuda) return cerrarGlobo();
      const g = globo(b, `<b>${ic('consejo')} ${esc(t[0])}</b><ul>${t[1].map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`);
      g.dataset.de = b.dataset.ayuda;
      return;
    }
    if (!(e.target.closest && e.target.closest('#globo'))) cerrarGlobo();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarGlobo(); });
  window.addEventListener('hashchange', cerrarGlobo);
}

/** Confirmación grande y amable; se cierra sola (o al tocarla). */
export function celebrar(titulo, sub = '', tipo = 'ok') {
  const v = document.getElementById('celebrar');
  if (v) v.remove();
  const d = document.createElement('div');
  d.id = 'celebrar'; d.className = 'celebrar ' + tipo; d.setAttribute('role', 'status'); d.setAttribute('aria-live', 'polite');
  d.innerHTML = `<div class="celebrar-caja"><span class="celebrar-ico">${tipo === 'ok' ? '✓' : tipo === 'aviso' ? '!' : '✗'}</span><b>${esc(titulo)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
  d.onclick = () => d.remove();
  document.body.appendChild(d);
  if (navigator.vibrate) try { navigator.vibrate(tipo === 'ok' ? 40 : [30, 60, 30]); } catch (e) { /* sin vibración */ }
  setTimeout(() => d.classList.add('sale'), 1500);
  setTimeout(() => d.remove(), 1900);
}
