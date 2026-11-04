// IMAGEN DE LOS AVISOS (como el botón "Imagen" de la macro).
// El enlace de WhatsApp (wa.me) solo lleva texto. Por eso, en la tanda:
//   1) "Abrir WhatsApp" abre el chat del cliente con el texto → usted pulsa Enviar;
//   2) "Enviar imagen" abre "Compartir" del celular con la imagen → elige ese mismo chat
//      (aparece primero en WhatsApp porque acaba de escribirle).
// En la PC (sin "Compartir" con archivos) la imagen se copia y se pega en el chat con Ctrl+V.
// La imagen se guarda en el celular para poder usarla sin señal.
import { D } from './datos.js';
import { llamar } from './api.js';
import { kvGet, kvSet } from './db.js';
import { CONFIG } from './config.js';

const KV_IMAGEN = 'imagenAviso';

/** ¿Está activado "Enviar imagen" y hay una imagen elegida? */
export const imagenActiva = () => /^S[IÍ]$/i.test(String(D.config.ENVIAR_IMAGEN || '').trim()) && !!String(D.config.IMAGEN_AVISO || '');

/** Devuelve la imagen actual { id, dataUrl } (del celular si ya está; si cambió, la baja). null si no hay. */
export async function imagenAviso() {
  const id = String(D.config.IMAGEN_AVISO || '');
  if (!id) return null;
  const guardada = await kvGet(KV_IMAGEN);
  if (guardada && (guardada.id === id || (String(id).startsWith('LOCAL') && guardada.local))) return guardada;
  if (!navigator.onLine) return guardada || null;      // sin señal: la última que se tenga
  try {
    const r = await llamar('imagenAviso');
    if (r && r.id && r.dataUrl) { await kvSet(KV_IMAGEN, { id: r.id, dataUrl: r.dataUrl }); return { id: r.id, dataUrl: r.dataUrl }; }
  } catch (e) { /* sin servidor: se usa la guardada */ }
  return guardada || null;
}

/** La imagen recién elegida en este celular (antes de que el servidor la confirme). */
export const guardarLocal = (dataUrl) => kvSet(KV_IMAGEN, { id: 'LOCAL', local: true, dataUrl });

/** Baja la imagen en segundo plano (después de sincronizar), para tenerla sin señal. */
export function precargarImagen() { if (imagenActiva()) imagenAviso().catch(() => {}); }

function aArchivo(dataUrl) {
  const [cab, b64] = dataUrl.split(','), tipo = (/data:([^;]+)/.exec(cab) || [])[1] || 'image/jpeg';
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new File([u], 'aviso.' + (tipo.split('/')[1] || 'jpg').replace('jpeg', 'jpg'), { type: tipo });
}

/** El portapapeles de los navegadores solo acepta PNG: se convierte. */
function aPng(dataUrl) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); c.toBlob((b) => (b ? ok(b) : mal(new Error('png'))), 'image/png'); };
    img.onerror = () => mal(new Error('img'));
    img.src = dataUrl;
  });
}

/**
 * Comparte la imagen. Devuelve 'compartida' | 'copiada' | 'descargada' | 'cancelada' | 'prueba'.
 * En el MODO PRUEBA no abre nada (no se envía nada real).
 */
export async function compartirImagen(dataUrl) {
  if (CONFIG.DEMO) { window.dispatchEvent(new CustomEvent('demo-enlace', { detail: 'compartir:' + dataUrl })); return 'prueba'; }
  const archivo = aArchivo(dataUrl);
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo] }); return 'compartida'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelada'; }
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': aPng(dataUrl) })]);
    return 'copiada';
  } catch (e) { /* sin portapapeles de imágenes */ }
  const a = document.createElement('a'); a.href = dataUrl; a.download = archivo.name; document.body.appendChild(a); a.click(); a.remove();
  return 'descargada';
}

/** Reduce la imagen elegida (máx. 1280 px) sin pasar de ~1 MB, para que viaje rápido y quepa en el servidor. */
export function prepararImagen(file) {
  return new Promise((ok, mal) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return mal(new Error('Elija una imagen JPG, PNG o WEBP.'));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      let q = 0.85, d = c.toDataURL('image/jpeg', q);
      while (d.length > 1300000 && q > 0.4) { q -= 0.1; d = c.toDataURL('image/jpeg', q); }
      d.length > 1300000 ? mal(new Error('La imagen es demasiado grande.')) : ok(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}
