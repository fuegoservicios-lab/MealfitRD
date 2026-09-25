// [P1-PLAN-LOTE-224 · 2026-09-24] Texto libre del modelo, traducido AL LEER.
//
// Casi todo lo que el modelo escribe para el usuario vive en el plan y lo traduce la capa `_display` en el servidor.
// Quedaba fuera el texto que no es del plan traducido: lo que el coach recuerda del usuario (Configuración →
// Memoria) y los suplementos del día (nombre, dosis, momento, motivo). Salía en español en los cinco idiomas.
//
// Este hook pide a `POST /api/i18n/textos` SÓLO lo que no tiene, en lotes de 40, y guarda lo que vuelve en memoria y
// en el dispositivo (por idioma, las últimas 400 frases): la segunda vez que se abre la pantalla ya no hay petición.
// Cada frase se pide UNA vez por sesión aunque falle (un 429 o una caída no se convierten en un bucle de peticiones).
// Mientras tanto, y si falla, se pinta el texto original. En es-DO no hace nada.
import { useEffect, useMemo, useState } from 'react';
import { getLocale, useI18n } from '../i18n';
import { fetchWithAuth } from '../config/api';
import { safeLocalStorageGet, safeLocalStorageSet } from '../utils/safeLocalStorage';

const _LOTE = 40;
const _MAX_CHARS = 400;
const _MAX_GUARDADAS = 400;
const _clave = (locale) => `mealfit_textos_i18n:${locale}`;

const _memoria = new Map();  // locale → Map(texto → traducción)
const _pedidas = new Map();  // locale → Set(texto) pedidas en esta sesión
const _suscriptores = new Set();

function _cache(locale) {
    if (!_memoria.has(locale)) {
        let guardado = {};
        try {
            const crudo = safeLocalStorageGet(_clave(locale), null);
            const obj = crudo ? JSON.parse(crudo) : null;
            if (obj && typeof obj === 'object') guardado = obj;
        } catch { /* caché corrupta: se empieza de cero */ }
        _memoria.set(locale, new Map(Object.entries(guardado).filter(([, v]) => typeof v === 'string')));
    }
    return _memoria.get(locale);
}

function _pedidasDe(locale) {
    if (!_pedidas.has(locale)) _pedidas.set(locale, new Set());
    return _pedidas.get(locale);
}

function _guardar(locale) {
    const entradas = [..._cache(locale).entries()].slice(-_MAX_GUARDADAS);
    safeLocalStorageSet(_clave(locale), JSON.stringify(Object.fromEntries(entradas)));
}

async function _pedir(locale, faltan) {
    let hubo = false;
    for (let i = 0; i < faltan.length; i += _LOTE) {
        const lote = faltan.slice(i, i + _LOTE);
        const r = await fetchWithAuth('/api/i18n/textos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ locale, textos: lote }),
        });
        if (!r.ok) break;
        const res = await r.json().catch(() => null);
        const out = Array.isArray(res?.textos) && res.textos.length === lote.length ? res.textos : null;
        if (!out) break;
        const m = _cache(locale);
        lote.forEach((x, j) => {
            if (typeof out[j] === 'string' && out[j].trim()) {
                m.delete(x);  // al final: las recientes son las que sobreviven al recorte
                m.set(x, out[j].trim());
                hubo = true;
            }
        });
    }
    if (hubo) {
        _guardar(locale);
        _suscriptores.forEach((fn) => fn());
    }
}

/**
 * `const tr = useTextosTraducidos(textos)` → `tr(texto)`: su traducción al idioma activo si ya está, o el texto tal
 * cual. `textos` son los que la pantalla va a pintar; el hook pide los que falten.
 */
export function useTextosTraducidos(textos) {
    // El contexto SUSCRIBE (un cambio de idioma repinta); el idioma se lee del motor, que es la fuente también fuera
    // de un <I18nProvider> (el valor por defecto del contexto es siempre el idioma base).
    useI18n();
    const locale = getLocale();
    const [version, setVersion] = useState(0);
    useEffect(() => {
        const fn = () => setVersion((v) => v + 1);
        _suscriptores.add(fn);
        return () => { _suscriptores.delete(fn); };
    }, []);

    const lista = (Array.isArray(textos) ? textos : [])
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter((x) => x && x.length <= _MAX_CHARS);
    const firma = [...new Set(lista)].join('\u0001');

    useEffect(() => {
        if (!locale || locale === 'es-DO' || !firma) return;
        const m = _cache(locale);
        const pedidas = _pedidasDe(locale);
        const faltan = firma.split('\u0001').filter((x) => !m.has(x) && !pedidas.has(x));
        if (!faltan.length) return;
        faltan.forEach((x) => pedidas.add(x));
        _pedir(locale, faltan).catch(() => { /* se queda el original */ });
    }, [locale, firma]);

    // Identidad nueva con cada respuesta (`version`), para que un hijo memoizado también se repinte.
    return useMemo(() => {
        const mapa = locale && locale !== 'es-DO' && version >= 0 ? _cache(locale) : null;
        return (texto) => (typeof texto === 'string' && mapa ? (mapa.get(texto.trim()) || texto) : texto);
    }, [locale, version]);
}
