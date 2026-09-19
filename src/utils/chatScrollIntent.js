// [P1-PLAN-LOTE-123 · 2026-09-19] ¿El chat se alejó del fondo porque el USUARIO subió, o porque el contenido cambió
// de alto?
//
// EL DEFECTO (el dueño: «la imagen cambió de tamaño y volvió a su tamaño normal pero el scroll se había ido hacia
// arriba»). En modo «abajo», el manejador de scroll pasaba a modo libre en cuanto la distancia al fondo superaba
// 120 px: la lectura «el usuario subió a leer». Pero hay otra forma de acabar a más de 120 px del fondo sin que nadie
// toque nada: el contenido ENCOGE (el navegador recorta `scrollTop`) y vuelve a CRECER antes de que se despache el
// evento de scroll de aquel recorte. En ese evento la distancia ya es el alto recuperado — 164 px con una foto que
// baja de 260 a 96 y vuelve —, el chat se declara «libre» y el observador de tamaño, que corre DESPUÉS en el mismo
// fotograma, ya no re-ancla. Resultado: la respuesta del agente queda fuera de cuadro con la flecha de «ir al final».
//
// LA REGLA. Alejarse del fondo solo es «el usuario subió» si hay un gesto suyo vigente (dedo, rueda, teclado, barra)
// o si el alto no cambió hace un instante. Un salto sin gesto y pegado a un cambio de alto es del LAYOUT: se re-ancla.
export const DISTANCIA_LIBRE_PX = 120;
export const INTENCION_VIGENTE_MS = 3000;   // la inercia de iOS sigue moviendo el scroll tras levantar el dedo
export const LAYOUT_RECIENTE_MS = 600;

export function hayIntencionDeScroll({ tocando = false, ultimoGestoEn = 0, ahora = 0 }) {
    return tocando === true || (ultimoGestoEn > 0 && ahora - ultimoGestoEn < INTENCION_VIGENTE_MS);
}

/** En modo «abajo», con la distancia al fondo ya medida: 'nada' | 'libre' | 'fijar'. */
export function decidirAlAlejarseDelFondo({ distancia, tocando = false, ultimoGestoEn = 0, ultimoCambioDeAltoEn = 0, ahora = 0 }) {
    if (!(distancia > DISTANCIA_LIBRE_PX)) return 'nada';
    if (hayIntencionDeScroll({ tocando, ultimoGestoEn, ahora })) return 'libre';
    const layoutReciente = ultimoCambioDeAltoEn > 0 && ahora - ultimoCambioDeAltoEn < LAYOUT_RECIENTE_MS;
    return layoutReciente ? 'fijar' : 'libre';
}
