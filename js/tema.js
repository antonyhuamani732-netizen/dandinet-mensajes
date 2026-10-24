/* Tema elegido (Día / Noche) antes de pintar, para que no parpadee. Va en archivo aparte: las reglas de seguridad no permiten código suelto en la página. */
try { var t = localStorage.getItem('tema'); if (t === 'dia' || t === 'noche') document.documentElement.dataset.tema = t; } catch (e) { /* sin almacenamiento */ }
