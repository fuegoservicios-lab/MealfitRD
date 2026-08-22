/**
 * [P2-I18N-RELTIME-HISTORY-CRUDO · 2026-08-22] Conducta del tiempo relativo del panel forense.
 *
 * Antes esto no se podía probar así: la aritmética vivía DENTRO de `History.jsx`, a 3.700
 * líneas de profundidad, y sus cinco tests parseaban el código fuente buscando nombres de
 * variable — tres de ellos clavando el copy español (`hace ${_days}d ${_remH}h`), o sea
 * MANTENIENDO en español justo lo que había que traducir.
 *
 * Con la lógica en un módulo puro, se mide lo que hace.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatRelativeTime } from '../utils/relativeTime';

const AHORA = new Date('2026-08-22T12:00:00.000Z');
const haceMs = (ms) => new Date(AHORA.getTime() - ms).toISOString();

const congelar = () => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
};
afterEach(() => vi.useRealTimers());

/** `t` de mentira: marca lo traducido e interpola como el motor real. */
const tFalsa = (clave, vars) =>
    `«${String(clave).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m))}»`;
const tnFalsa = (n, one, other, vars) => tFalsa(n === 1 ? one : other, vars);

describe('formatRelativeTime', () => {
    it('devuelve null con una entrada que no es una fecha usable', () => {
        for (const malo of [null, undefined, '', 42, {}, 'no soy una fecha']) {
            expect(formatRelativeTime(malo, tFalsa, tnFalsa)).toBe(null);
        }
    });

    it('una marca FUTURA sale como «ahora», no como «hace -5m»', () => {
        // Desfase de reloj o bug del backend: es la razón por la que existe esa rama.
        congelar();
        const r = formatRelativeTime(new Date(AHORA.getTime() + 5 * 60_000).toISOString(), tFalsa, tnFalsa);
        expect(r.rel).toBe('«ahora»');
    });

    it('cubre las cuatro granularidades: segundos, minutos, horas y días', () => {
        congelar();
        const caso = (ms) => formatRelativeTime(haceMs(ms), tFalsa, tnFalsa).rel;
        expect(caso(30 * 1000)).toBe('«hace <1m»');
        expect(caso(15 * 60_000)).toBe('«hace 15 min»');
        expect(caso(3 * 3_600_000)).toBe('«hace 3 h»');
        expect(caso(2 * 86_400_000)).toBe('«hace 2 días»');
    });

    it('conserva el resto, que es lo que un operador cruza con el log', () => {
        congelar();
        const caso = (ms) => formatRelativeTime(haceMs(ms), tFalsa, tnFalsa).rel;
        expect(caso(2 * 3_600_000 + 15 * 60_000)).toBe('«hace 2 h 15 min»');
        expect(caso(3 * 86_400_000 + 5 * 3_600_000)).toBe('«hace 3 d 5 h»');
    });

    it('TODO el texto pasa por el motor: no queda español suelto', () => {
        congelar();
        for (const ms of [30_000, 15 * 60_000, 3 * 3_600_000, 2 * 3_600_000 + 15 * 60_000,
                          2 * 86_400_000, 3 * 86_400_000 + 5 * 3_600_000]) {
            const { rel } = formatRelativeTime(haceMs(ms), tFalsa, tnFalsa);
            expect(rel.startsWith('«')).toBe(true);
            expect(rel.endsWith('»')).toBe(true);
        }
    });

    it('el plural de «día» lo decide el motor, no un `n === 1`', () => {
        // El francés mete el 0 en singular y el portugués tiene categoría `many`: un
        // `n === 1` a mano da la forma equivocada en dos de los cuatro idiomas.
        congelar();
        expect(formatRelativeTime(haceMs(86_400_000), tFalsa, tnFalsa).rel).toBe('«hace 1 día»');
        expect(formatRelativeTime(haceMs(5 * 86_400_000), tFalsa, tnFalsa).rel).toBe('«hace 5 días»');
    });

    it('sin `t` devuelve el español, idéntico a lo que se veía antes', () => {
        congelar();
        expect(formatRelativeTime(haceMs(2 * 3_600_000 + 15 * 60_000)).rel).toBe('hace 2 h 15 min');
        expect(formatRelativeTime(haceMs(30_000)).rel).toBe('hace <1m');
    });

    it('devuelve la fecha CRUDA, para que el llamador la formatee por locale', () => {
        congelar();
        const r = formatRelativeTime(haceMs(60_000), tFalsa, tnFalsa);
        expect(r.fecha).toBeInstanceOf(Date);
        // Y NO un string ya formateado: clavar el formato aquí es lo que
        // `P1-I18N-FORMATOS-CLAVADOS` cerró en su día.
        expect(typeof r.fecha).not.toBe('string');
    });
});
