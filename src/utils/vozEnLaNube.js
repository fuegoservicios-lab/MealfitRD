// [P1-PLAN-LOTE-685 · 2026-09-28] La voz del coach en la nube: Gemini 3.8 Flash-Lite TTS detrás de `POST /api/chat/voz`
// (backend `coach_voz.py`). El dueño: «la voz no es nada realista» — era el lector de accesibilidad del teléfono.
//
// Una frase → un WAV. `null` = que hable el teléfono: 204 (voz apagada por knob, sin presupuesto del día o Google
// caído), un fallo de red o más de VOZ_NUBE_TIMEOUT_MS. La síntesis tarda ~2 s por petición (medido contra la API real),
// por eso `crearVozDelCoach` pide cada frase en cuanto llega y las toca en orden.
import { fetchWithAuth } from '../config/api';

export const VOZ_NUBE_TIMEOUT_MS = 7000;

export async function pedirVozEnLaNube(texto, { locale = 'es-DO', signal, fetcher = fetchWithAuth } = {}) {
    const frase = String(texto || '').trim();
    if (!frase) return null;
    try {
        const r = await fetcher('/api/chat/voz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto: frase, locale }),
            timeout: VOZ_NUBE_TIMEOUT_MS,
            signal,
        });
        if (!r || r.status !== 200) return null;
        const audio = await r.arrayBuffer();
        return audio && audio.byteLength > 44 ? audio : null;   // 44 = la cabecera WAV sola
    } catch {
        return null;
    }
}

/**
 * [P1-PLAN-LOTE-901 · 2026-09-29] La misma voz en streaming (`POST /api/chat/voz/flujo`): PCM 16 bits mono mientras
 * Google lo produce — el primer audio a ~0,65 s en vez de los ~2-3 s del WAV entero. Devuelve `{ frecuencia, lector }`
 * (un lector del cuerpo), `'wav'` si el servidor tiene el streaming apagado (que se pida el WAV de siempre) o `null`
 * (que hable el teléfono). El `timeout` cubre hasta las cabeceras: el servidor solo responde 200 con el primer audio
 * ya en la mano, así que un 200 nunca es un silencio.
 */
export async function abrirVozEnLaNube(texto, { locale = 'es-DO', signal, fetcher = fetchWithAuth } = {}) {
    const frase = String(texto || '').trim();
    if (!frase) return null;
    try {
        const r = await fetcher('/api/chat/voz/flujo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto: frase, locale }),
            timeout: VOZ_NUBE_TIMEOUT_MS,
            signal,
        });
        if (r && r.status === 204 && r.headers?.get?.('X-Voz-Motivo') === 'flujo_apagado') return 'wav';
        if (!r || r.status !== 200 || !r.body?.getReader) return null;
        const frecuencia = Number(r.headers?.get?.('X-Voz-Frecuencia')) || 24000;
        return { frecuencia, lector: r.body.getReader() };
    } catch {
        return null;
    }
}
