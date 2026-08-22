/**
 * [P2-FRONTEND-COUNTRY-TESTS · 2026-08-21] El selector de país de Configuración no tenía ni un test.
 *
 * Es la superficie por la que un usuario CAMBIA de país después de registrarse — la que arregla un
 * país mal elegido, la que usa quien se muda. Y no la cubría nada: los guards de país del frontend
 * vivían todos en el wizard (`QCountry`, `QBudget`) o en el Dashboard.
 *
 * QUÉ SE PRUEBA, Y POR QUÉ ASÍ. No que el handler «se llame»: la otra mitad de este gap era
 * exactamente esa clase de guard —«comprueba que la función se invoque, no lo que devuelve»— y el
 * `: 'RD$'` que ignoraba las monedas beta pasaba sin despeinarse. Aquí se comprueba el EFECTO:
 *
 *   · qué viaja al backend (`PATCH /api/profile` con `health_profile.country`, key-level);
 *   · que la copia local del wizard se sincroniza — sin esa línea, «Renovar» reenvía el 'DO'
 *     sembrado por `initialFormData` y el país elegido aquí no sobrevive. Es el incidente REAL del
 *     día del flip, cerrado por `P1-COUNTRY-RENEWAL-PROFILE-WINS`;
 *   · que un fallo de red NO deja al usuario creyendo que guardó;
 *   · que re-elegir el país actual no gasta una llamada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const _fetchWithAuth = vi.fn();
const _updateData = vi.fn();
const _toastSuccess = vi.fn();
const _toastError = vi.fn();

vi.mock('../config/api', () => ({
    fetchWithAuth: (...a) => _fetchWithAuth(...a),
    API_BASE_URL: '',
}));
vi.mock('sonner', () => ({
    toast: Object.assign(vi.fn(), { success: (...a) => _toastSuccess(...a), error: (...a) => _toastError(...a) }),
}));

/**
 * Reproduce `handleSelectCountry` de Settings.jsx con sus dependencias inyectadas.
 *
 * Se replica en vez de montar la página entera a propósito: `Settings.jsx` arrastra el contexto de
 * assessment, el tema, el router y media queries, y montarlo entero convierte un test de CONTRATO
 * en un test de andamiaje — que es como se acaba con un guard que mide el entorno en vez de la
 * regla. La paridad con el original la ancla el test de abajo, que lee el fuente.
 */
const crearHandler = ({ paisActual = 'DO' } = {}) => {
    let guardando = false;
    const { coerceCountry } = { coerceCountry: (raw) => {
        const c = String(raw ?? '').trim().toUpperCase();
        return ['DO', 'ES', 'US', 'MX', 'PR', 'CO'].includes(c) ? c : 'DO';
    } };
    return async (country) => {
        if (guardando || country === coerceCountry(paisActual)) return;
        guardando = true;
        try {
            const res = await _fetchWithAuth('/api/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ health_profile: { country } }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            _updateData('country', country);
            _toastSuccess('País actualizado');
        } catch {
            _toastError('No se pudo guardar tu país. Inténtalo de nuevo.');
        } finally {
            guardando = false;
        }
    };
};

beforeEach(() => {
    _fetchWithAuth.mockReset();
    _updateData.mockReset();
    _toastSuccess.mockReset();
    _toastError.mockReset();
    _fetchWithAuth.mockResolvedValue({ ok: true });
});

describe('[P2-FRONTEND-COUNTRY-TESTS] el selector de país de Configuración', () => {
    it('manda el país al backend key-level, no el health_profile entero', async () => {
        await crearHandler()('ES');
        expect(_fetchWithAuth).toHaveBeenCalledTimes(1);
        const [url, opts] = _fetchWithAuth.mock.calls[0];
        expect(url).toBe('/api/profile');
        expect(opts.method).toBe('PATCH');
        // Key-level: mandar el perfil entero desde el cliente es la clase lost-update que la
        // invariante I6 prohíbe — el backend y el wizard escriben el mismo documento.
        expect(JSON.parse(opts.body)).toEqual({ health_profile: { country: 'ES' } });
    });

    it('sincroniza la copia local del wizard (el incidente del día del flip)', async () => {
        await crearHandler()('MX');
        expect(_updateData).toHaveBeenCalledWith('country', 'MX');
    });

    it('un fallo de red NO deja al usuario creyendo que guardó', async () => {
        _fetchWithAuth.mockResolvedValue({ ok: false, status: 500 });
        await crearHandler()('ES');
        expect(_toastError).toHaveBeenCalled();
        expect(_toastSuccess).not.toHaveBeenCalled();
        // Y la copia local NO se toca: si se tocara, el wizard y el perfil discreparían tras un
        // error, que es peor que no haber cambiado nada.
        expect(_updateData).not.toHaveBeenCalled();
    });

    it('una excepción de red tampoco', async () => {
        _fetchWithAuth.mockRejectedValue(new Error('offline'));
        await crearHandler()('CO');
        expect(_toastError).toHaveBeenCalled();
        expect(_updateData).not.toHaveBeenCalled();
    });

    it('re-elegir el país actual no gasta una llamada', async () => {
        await crearHandler({ paisActual: 'ES' })('ES');
        expect(_fetchWithAuth).not.toHaveBeenCalled();
    });
});

describe('[P2-FRONTEND-COUNTRY-TESTS] paridad con el fuente real', () => {
    // El riesgo de replicar el handler es que el original cambie y este test siga verde sobre una
    // copia obsoleta. Estas aserciones lo atan al fuente: si desaparece alguna de las tres piezas,
    // la réplica de arriba deja de representar nada y hay que revisarla.
    const _src = () => {
        const fs = require('fs');
        const path = require('path');
        return fs.readFileSync(path.join(process.cwd(), 'src/pages/Settings.jsx'), 'utf-8');
    };

    it('el handler sigue existiendo y sigue mandando key-level', () => {
        const s = _src();
        expect(s).toContain('const handleSelectCountry');
        expect(s).toContain("health_profile: { country }");
    });

    it('sigue sincronizando la copia local del wizard', () => {
        expect(_src()).toContain("updateData('country', country)");
    });

    it('el selector se construye desde el SSOT de países, no de una lista propia', () => {
        const s = _src();
        expect(s).toContain("from '../config/countries'");
        expect(s).toContain('COUNTRIES.map((c) => c.code)');
    });
});

describe('[P3-COUNTRY-PICK-EXPLICIT] tocar «República Dominicana» sin país guardado SÍ persiste', () => {
    // EL CASO. El guard de salida temprana era:
    //
    //     if (isSavingCountry || country === coerceCountry(userProfile?.health_profile?.country))
    //
    // y `coerceCountry(undefined)` devuelve 'DO'. O sea que para un perfil SIN país —quince de los
    // dieciséis vivos hoy— tocar la tarjeta de República Dominicana comparaba 'DO' contra 'DO' y
    // salía sin escribir nada: sin PATCH, sin toast, sin rastro. El usuario cree que eligió; el
    // sistema no se entera.
    //
    // No es cosmético aunque el motor caiga a DO igual. `canonicalize_country` distingue
    // explícitamente «ausente» (fail-safe legítimo, silencioso) de «valor que no canoniza»
    // (corrupción, con warning) — esa es toda la razón de ser de `P2-COUNTRY-FAILSAFE-LOUD`. Con
    // la elección sin registrar, ese usuario se queda en la casilla «ausente» para siempre, y
    // nadie puede distinguir «eligió RD» de «nunca contestó». Es la misma familia que el «default
    // sembrado» que este repo ya pagó dos veces: una elección que no deja rastro es
    // indistinguible de no haber elegido.
    // ⚠️ SIN COMENTARIOS, y la primera versión enseñó por qué: leía 900 caracteres crudos desde
    // `const handleSelectCountry`, y la nota que explica este arreglo (a) los llena enteros, así
    // que el código quedaba fuera de la ventana, y (b) CITA la expresión vieja, así que el guard
    // negativo acusaba al texto que documenta su propia corrección. Comentario-vence-guard, la
    // decimotercera de esta ola. Un guard sobre fuente tiene que mirar CÓDIGO.
    const _bloqueHandler = () => {
        const fs = require('fs');
        const path = require('path');
        const s = fs.readFileSync(path.join(process.cwd(), 'src/pages/Settings.jsx'), 'utf-8');
        const codigo = s
            .replace(/\/\*[\s\S]*?\*\//g, ' ')
            .split('\n')
            .filter((l) => !l.trim().startsWith('//'))
            .join('\n');
        const i = codigo.indexOf('const handleSelectCountry');
        expect(i).toBeGreaterThan(0);
        return codigo.slice(i, i + 600);
    };

    it('el guard distingue «sin país» de «país = DO»', () => {
        // La forma que producía el no-op: comparar contra `coerceCountry(...)` sobre el campo
        // crudo, que convierte la ausencia en 'DO'.
        expect(_bloqueHandler()).not.toMatch(
            /country === coerceCountry\(userProfile\?\.health_profile\?\.country\)/,
        );
    });

    it('la salida temprana exige que el país guardado EXISTA', () => {
        // Positivo: sin esto, borrar la comparación entera también pasaría el caso de arriba —
        // y eso reintroduciría el PATCH redundante en cada toque sobre el país ya elegido.
        expect(_bloqueHandler()).toMatch(/!=\s*null|!==\s*undefined/);
    });

    it('sigue evitando el PATCH redundante cuando el país YA está guardado', () => {
        // El error simétrico, anclado: quitar la guarda entera haría que tocar la tarjeta ya
        // marcada mandara un PATCH cada vez.
        const bloque = _bloqueHandler();
        expect(bloque).toContain('return;');
        expect(bloque).toContain('coerceCountry(');
    });
});
