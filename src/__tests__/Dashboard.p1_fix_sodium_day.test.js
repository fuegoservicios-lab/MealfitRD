// [P1-FIX-SODIUM-DAY · 2026-08-02] Botón "Arreglar este día" en el banner de aviso de
// sodio (`micro_worst_day_ceiling`) — puente de un clic al swap sodio-consciente ya
// desplegado (P1-SODIUM-AWARE-PLACEMENT, backend). Test parser-based (mismo harness que
// Dashboard.p3_banner_reason_copy.test.js — evita importar Dashboard.jsx completo, árbol
// de dependencias pesado vía useAssessment/AssessmentContext).
//
// Caso real que lo motiva: banner "1 de 3 días se pasa del techo (peor: Día 1)" con
// ricotta+camarones; el usuario tuvo que ADIVINAR qué plato cambiar (y cambió el de OTRO
// día). El botón SOLO aparece para la clase de motivo sodio/micro-ceiling
// (`micro_worst_day_ceiling`) — el resto de razones de `_quality_degraded_reason` no lo
// muestran.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _src = readFileSync(join(__dirname, '..', 'pages', 'Dashboard.jsx'), 'utf-8');

// [P1-FIX-DAY-ONLY-IF-SODIUM · 2026-08-05] Ancla ÚNICA del gate de render.
//
// Estos tres tests anclaban cada uno por su cuenta en la cadena literal
// `_quality_degraded_reason === 'micro_worst_day_ceiling'`. Al mover la condición a
// `fixDayCtaApplies()` —para poder probar la DECISIÓN y no el texto— los tres se
// quedaron huérfanos a la vez: fallaron por "marcador no encontrado", no por que el
// botón estuviera mal. Una sola constante para que la próxima mudanza rompa en un
// sitio y con un mensaje que se entienda.
//
// El gate en sí (qué techos muestran el botón) se prueba en fixDayCta.test.js,
// ejecutando la función. Lo de aquí sigue siendo lo que un parser puede ver: que el
// botón existe, que vive dentro del banner y que su copy de carga es el correcto.
const _GATE = 'fixDayCtaApplies(planData) && (';

function _sliceFrom(marker, len = 3000) {
    const i = _src.indexOf(marker);
    expect(i, `marcador no encontrado: ${marker}`).toBeGreaterThan(-1);
    return _src.slice(i, i + len);
}

describe('P1-FIX-SODIUM-DAY', () => {
    it('el handler existe y define el estado de carga', () => {
        expect(_src).toContain('const handleFixSodiumDay = async (allowNewIngredients = null)');
        expect(_src).toContain('const [fixSodiumDayLoading, setFixSodiumDayLoading] = useState(false)');
    });

    it('el botón SOLO se renderiza para la clase de motivo sodio/micro-ceiling', () => {
        const i = _src.indexOf(_GATE);
        expect(i).toBeGreaterThan(-1);
        const win = _src.slice(i, i + 1800);
        expect(win).toContain('onClick={handleFixSodiumDay}');
        expect(win).toContain('disabled={fixSodiumDayLoading}');
        expect(win).toContain('Arreglar este día');
    });

    it('el botón vive DENTRO del banner de _quality_degraded (mismo div que el CTA de Nevera)', () => {
        const iPantryCta = _src.indexOf('_quality_degraded_pantry_limited &&');
        const iSodiumCta = _src.indexOf(_GATE);
        const iCloseDiv = _src.indexOf('</div>', iSodiumCta);
        const iDismiss = _src.indexOf('dismissQDegraded', iCloseDiv);
        expect(iPantryCta).toBeGreaterThan(-1);
        expect(iSodiumCta).toBeGreaterThan(iPantryCta);
        // El botón de cerrar (X, dismissQDegraded) debe venir DESPUÉS del cierre del div que
        // contiene ambos CTAs — confirma que el botón de sodio no se escapó del banner.
        expect(iDismiss).toBeGreaterThan(iCloseDiv);
    });

    it('estado de carga: copy honesto con estimado de tiempo, botón deshabilitado', () => {
        expect(_src).toContain('disabled={fixSodiumDayLoading}');
        // El texto en carga vive en el mismo botón — mismo bloque que la condición de render.
        const btnWin = _sliceFrom(_GATE, 1800);
        expect(btnWin).toMatch(/reformulando la comida más salada/);
        expect(btnWin).toMatch(/~30 ?s/);
    });

    it('POSTea al endpoint correcto con el plan_id activo', () => {
        const win = _sliceFrom('const handleFixSodiumDay = async (allowNewIngredients = null)', 1200);
        expect(win).toContain('`${API_BASE}/api/plans/${planData.id}/fix-sodium-day`');
        expect(win).toContain("method: 'POST'");
    });

    it('éxito (fixed=true): refresca el plan vía /api/plans-data/latest + setPlanData', () => {
        const win = _sliceFrom("result?.fixed === true", 1500);
        expect(win).toContain("fetchWithAuth('/api/plans-data/latest')");
        expect(win).toContain('setPlanData(pdNew)');
    });

    it('éxito: toast con el delta de sodio antes→después y el día 1-indexado', () => {
        // [P1-I18N-TEST-CLAVA-EL-COPY · 2026-08-22] Ventana ampliada y asserts por
        // PROPIEDAD: el titulo del toast pasa ahora por `t()`, asi que exigir el template
        // literal exacto mantenia la cadena en español en los cinco idiomas -- un guard no
        // puede ser la razon de que una pantalla no se traduzca. Lo que hay que preservar
        // es QUE DATOS lleva el aviso: el dia 1-indexado, el plato viejo→nuevo y el delta
        // de sodio.
        const win = _sliceFrom("result?.fixed === true", 3000);
        expect(win).toMatch(/toast\.success\(/);
        expect(win).toContain('Number(result.day) + 1');
        expect(win).toContain('${result.old_meal} → ${result.new_meal}');
        expect(win).toMatch(/result\.sodio_antes_mg[\s\S]{0,80}result\.sodio_despues_mg/);
        expect(win).toContain('bajo el techo ✓');
    });

    it('ceiling_not_sodium: toast informativo (NO error), SIN refresh — el banner queda tal cual', () => {
        // [P1-FIX-SODIUM-DAY-HONEST · 2026-08-02] micro_worst_day_ceiling no es sodio-exclusivo
        // (finding de review): cuando el backend dice que el techo roto del peor día es OTRO
        // nutriente, el frontend NO debe tratarlo como error ni refrescar el plan (nada cambió).
        const i = _src.indexOf("result?.code === 'ceiling_not_sodium'");
        expect(i).toBeGreaterThan(-1);
        const iNext = _src.indexOf("result?.code === 'no_day_over_ceiling'", i);
        const win = _src.slice(i, iNext);
        // [P1-I18N-SERVER-COPY-GANA · 2026-08-22] Se ancla la PROPIEDAD: que el aviso
        // salga del payload del servidor (por su código) y no de un literal inventado
        // en el cliente. Antes exigía la grafia `toast(result.message`, asi que pasar
        // el mensaje por `mensajeDeError` --que es lo que lo hace legible para un
        // usuario no hispano-- ponía el guard rojo sin que la conducta empeorara.
        expect(win).toMatch(/toast\(\s*(?:result\.message|mensajeDeError\(\s*result)/);
        expect(win).not.toContain('toast.error');
        expect(win).not.toContain('setPlanData');
        expect(win).not.toContain('hydrateLatestPlan');
    });

    it('no_day_over_ceiling: toast informativo (NO error) + refresco honesto (puede ser stale)', () => {
        const win = _sliceFrom("result?.code === 'no_day_over_ceiling'", 500);
        expect(win).toContain('hydrateLatestPlan?.(');
        // [P1-I18N-SERVER-COPY-GANA] Propiedad, no grafia (ver el hermano de arriba).
        expect(win).toMatch(/toast\(\s*(?:result\.message|mensajeDeError\(\s*result)/);
        expect(win).not.toContain('toast.error');
    });

    it('fracaso del chef: toast.error con el motivo, SIN refresh (el banner queda, plan intacto)', () => {
        const i = _src.indexOf("result?.code === 'no_day_over_ceiling'");
        const iElse = _src.indexOf('} else {', i);
        const win = _src.slice(iElse, iElse + 800);
        expect(win).toContain('toast.error');
        // [P1-I18N-SERVER-COPY-GANA] El motivo tiene que venir del payload del servidor;
        // por que canal lo resuelva es implementacion.
        expect(win).toMatch(/result\?\.error_message|mensajeDeError\(\s*result/);
        expect(win).not.toContain('setPlanData');
    });

    it('respuesta no-OK (red/5xx): toast.error honesto, no asume el shape de éxito', () => {
        const win = _sliceFrom('const handleFixSodiumDay = async (allowNewIngredients = null)', 2000);
        expect(win).toContain('if (!resp.ok)');
        const iNotOk = win.indexOf('if (!resp.ok)');
        const notOkWin = win.slice(iNotOk, iNotOk + 500);
        expect(notOkWin).toContain('toast.error');
    });

    it('marker anchor presente', () => {
        expect(_src).toContain('P1-FIX-SODIUM-DAY');
    });
});
