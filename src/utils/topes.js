// [P1-PLAN-LOTE-1116 · 2026-11-20] Qué decir cuando un tope de uso frena (fotos del día, coach del día, voz del mes,
// gasto de IA del mes). El backend manda el código en la cabecera `X-Tope` (o como `motivo` en la voz en vivo); aquí
// se traduce. Cada frase dice qué SÍ puede hacer la persona: el contador y lo ya registrado nunca se frenan.

/** El código del tope de una respuesta 402, o null. */
export function codigoDeTope(response) {
    try {
        return response?.headers?.get?.('X-Tope') || null;
    } catch {
        return null;
    }
}

/** El mensaje traducido para un código de tope; null si el código no es de un tope. */
export function mensajeDeTope(codigo, tFn) {
    const t = typeof tFn === 'function' ? tFn : (s) => s;
    switch (codigo) {
        case 'tope_fotos_dia':
            return t('Usaste tus análisis de foto de hoy. Puedes registrar la comida escribiéndola o desde el buscador; mañana vuelven.');
        case 'tope_coach_dia':
            return t('Llegaste a los mensajes con el coach de hoy. Mañana sigue la conversación.');
        case 'tope_voz_mes':
            return t('Usaste tus minutos de voz en vivo de este mes. Puedes seguir hablándole al coach con el micrófono del chat.');
        case 'tope_mes_usd':
            return t('Llegaste al uso de IA incluido en tu plan este mes. Se renueva el día 1; el contador y lo que ya registraste siguen funcionando.');
        default:
            return null;
    }
}
