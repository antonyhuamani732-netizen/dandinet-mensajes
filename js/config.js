// Configuración de la app D@ndinet Mensajes. No hay secretos aquí: la seguridad la da
// el servidor (verifica el inicio de sesión con Google en cada llamada).
export const CONFIG = {
  VERSION: '0.7.1',
  // URL de la implementación web de DANDINET_MENSAJES (docs/FASE1_INSTALACION.md, paso 5).
  // Mientras diga PEGAR_AQUI, la app avisa que falta instalar el servidor.
  API_URL: 'https://script.google.com/macros/s/AKfycbwmIJHGsmH2lv1n2zo9e2Wo0ZNa74voOIS5C7g8IeI9E8Z73HHdIvRKMayS18Cq-sipYQ/exec',
  // ID de cliente OAuth propio "app_mensajes" (mismo proyecto de Google Cloud que D@NDINET).
  CLIENT_ID: '223370778430-6tjnpo33rg9qbaeifre3tk080lqtu380.apps.googleusercontent.com',
  SYNC_CADA_MIN: 3,          // con la app abierta y con señal, sincroniza cada N minutos
  LOTE_ENVIO: 20,            // operaciones por envío
  DEMO: false,               // true solo en el MODO PRUEBA local (herramientas/demo.js)
};
