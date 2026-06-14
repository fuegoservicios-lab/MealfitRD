/**
 * P2-3 · Chequeo de password filtrada vía HaveIBeenPwned (HIBP) Pwned Passwords API.
 *
 * Equivalente funcional al toggle "Prevent use of leaked passwords" del Pro plan
 * de el backend anterior Auth, implementado en el frontend para cuentas Free.
 *
 * Privacidad: usa el modelo k-anonymity de HIBP. Calcula el SHA-1 de la password
 * en el navegador y solo envía los primeros 5 chars en hex al servicio. La
 * password en claro NUNCA sale del cliente.
 *
 * Knob `VITE_LEAKED_PASSWORD_CHECK`:
 *   - 'off':   no consulta HIBP. Devuelve `{leaked:false, mode:'off'}`.
 *   - 'warn':  consulta y registra en consola pero el caller decide no bloquear.
 *   - 'block': (default) si `leaked === true`, el caller debe abortar el submit.
 *
 * Degrada open: si crypto.subtle no está disponible o la red falla, devuelve
 * `{leaked:false, error:<msg>}`. Preferimos no bloquear signup ante fallos de
 * red sobre un servicio externo.
 */
const HIBP_RANGE_API = 'https://api.pwnedpasswords.com/range/';

async function sha1Hex(password) {
    const buf = new TextEncoder().encode(password);
    const hash = await crypto.subtle.digest('SHA-1', buf);
    return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join('');
}

export function getLeakedPasswordMode() {
    const raw = (import.meta.env?.VITE_LEAKED_PASSWORD_CHECK || 'block')
        .toString()
        .trim()
        .toLowerCase();
    if (raw === 'off' || raw === 'warn' || raw === 'block') return raw;
    return 'block';
}

export async function checkLeakedPassword(password) {
    const mode = getLeakedPasswordMode();
    if (mode === 'off' || !password) {
        return { leaked: false, count: 0, mode };
    }
    if (typeof crypto === 'undefined' || !crypto.subtle) {
        console.warn('[HIBP] crypto.subtle no disponible; skip leaked password check');
        return { leaked: false, count: 0, mode, error: 'crypto-unavailable' };
    }
    let hash;
    try {
        hash = await sha1Hex(password);
    } catch (e) {
        console.warn('[HIBP] sha1 failed:', e?.message || e);
        return { leaked: false, count: 0, mode, error: 'sha1-failed' };
    }
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    let res;
    try {
        res = await fetch(HIBP_RANGE_API + prefix, {
            headers: { 'Add-Padding': 'true' },
        });
    } catch (e) {
        console.warn('[HIBP] network error:', e?.message || e);
        return { leaked: false, count: 0, mode, error: 'network' };
    }
    if (!res.ok) {
        console.warn(`[HIBP] HTTP ${res.status}; skip check`);
        return { leaked: false, count: 0, mode, error: `http-${res.status}` };
    }
    let text;
    try {
        text = await res.text();
    } catch {
        return { leaked: false, count: 0, mode, error: 'body-read' };
    }
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const idx = trimmed.indexOf(':');
        if (idx === -1) continue;
        const s = trimmed.slice(0, idx);
        const c = trimmed.slice(idx + 1);
        if (s === suffix) {
            const count = parseInt(c, 10);
            const leaked = Number.isFinite(count) && count > 0;
            if (leaked && mode === 'warn') {
                console.warn(`[HIBP] password leaked (${count} hits) but mode=warn; not blocking`);
            }
            return { leaked, count: leaked ? count : 0, mode };
        }
    }
    return { leaked: false, count: 0, mode };
}
