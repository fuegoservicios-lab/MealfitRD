// [P1-PANTRY-STRICT-CONSENT · 2026-08-02] "Nevera estricta + consentimiento" — el botón
// Cambiar Plato / la confirmación de "No me gusta" / "Arreglar este día" abren el modal
// "Tu Nevera no alcanza" cuando el backend responde `needs_new_ingredients` en vez de
// introducir el ingrediente en la lista de compras sin preguntar.
//
// Test parser-based (mismo harness que Dashboard.p1_fix_sodium_day.test.js — evita
// importar Dashboard.jsx completo, árbol de dependencias pesado vía useAssessment/
// AssessmentContext).
//
// Caso real que lo motiva: un swap metió catibías de YUCA (75g de un día ya archivado del
// plan, nunca en `user_inventory`) sin preguntar; la lista de compras "renació" con 1
// ítem y "Ya compré la lista" reapareció sin consentimiento del usuario.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _src = readFileSync(join(__dirname, '..', 'pages', 'Dashboard.jsx'), 'utf-8');

function _sliceFrom(marker, len = 3000) {
    const i = _src.indexOf(marker);
    expect(i, `marcador no encontrado: ${marker}`).toBeGreaterThan(-1);
    return _src.slice(i, i + len);
}

describe('P1-PANTRY-STRICT-CONSENT', () => {
    it('importa PantryConsentModal', () => {
        expect(_src).toContain("import PantryConsentModal from '../components/common/PantryConsentModal'");
    });

    it('declara el estado del modal + su contexto', () => {
        expect(_src).toContain('const [pantryConsent, setPantryConsent] = useState(null)');
        expect(_src).toContain('const pantryConsentContext = useRef(null)');
    });

    it('runSwapWithConsentFlow existe y detecta needsConsent ANTES de tratar el resultado como éxito', () => {
        const win = _sliceFrom('const runSwapWithConsentFlow = async (', 2200);
        expect(win).toContain('result.needsConsent');
        expect(win).toContain('setPantryConsent({ missing: result.missing, message: result.message, busy: false })');
        const iNeeds = win.indexOf('result.needsConsent');
        const iSuccessToast = win.indexOf("toast.success('¡Menú Actualizado!'");
        expect(iNeeds).toBeGreaterThan(-1);
        expect(iSuccessToast).toBeGreaterThan(iNeeds);
    });

    it('runSwapWithConsentFlow reenvía allowNewIngredients a regenerateSingleMeal', () => {
        const win = _sliceFrom('const runSwapWithConsentFlow = async (', 1200);
        expect(win).toContain('await regenerateSingleMeal(');
        expect(win).toContain('allowNewIngredients,');
    });

    it('el picker "¿Por qué quieres cambiar?" usa runSwapWithConsentFlow (no duplica el flujo)', () => {
        const win = _sliceFrom('<MotivoActualizarModal', 4200);
        expect(win).toContain('await runSwapWithConsentFlow({ dayIndex, mealIndex, mealType, mealName, swapReason: optionId })');
    });

    it('la confirmación de "No me gusta" usa runSwapWithConsentFlow con loadingTitle propio', () => {
        const win = _sliceFrom("title=\"¿Bloquear este plato?\"", 3000);
        expect(win).toContain('await runSwapWithConsentFlow({');
        expect(win).toContain("swapReason: 'dislike'");
        expect(win).toContain("loadingTitle: '👎 Registrando preferencia...'");
    });

    it('handleFixSodiumDay acepta allowNewIngredients y lo manda condicionalmente en el body', () => {
        const win = _sliceFrom('const handleFixSodiumDay = async (allowNewIngredients = null)', 1400);
        expect(win).toContain('allow_new_ingredients: allowNewIngredients');
        expect(win).toContain("`${API_BASE}/api/plans/${planData.id}/fix-sodium-day`");
    });

    it('handleFixSodiumDay chequea needs_new_ingredients ANTES de la rama fixed/soft-fail', () => {
        const win = _sliceFrom('const handleFixSodiumDay = async (allowNewIngredients = null)', 2500);
        const iNeeds = win.indexOf("result?.needs_new_ingredients === true");
        const iFixed = win.indexOf('result?.fixed === true');
        expect(iNeeds).toBeGreaterThan(-1);
        expect(iFixed).toBeGreaterThan(iNeeds);
        const needsWin = win.slice(iNeeds, iFixed);
        expect(needsWin).toContain("source: 'fix-sodium-day'");
        expect(needsWin).toContain('setPantryConsent({');
    });

    it('handlePantryConsentConfirm despacha a handleFixSodiumDay o runSwapWithConsentFlow según el origen', () => {
        const win = _sliceFrom('const handlePantryConsentConfirm = async () => {', 900);
        expect(win).toContain("ctx.source === 'fix-sodium-day'");
        expect(win).toContain('await handleFixSodiumDay(names)');
        expect(win).toContain('await runSwapWithConsentFlow({ ...ctx, allowNewIngredients: names })');
    });

    it('handlePantryConsentRetry reintenta SIN consentimiento (allowNewIngredients: null)', () => {
        const win = _sliceFrom('const handlePantryConsentRetry = async () => {', 700);
        expect(win).toContain('await handleFixSodiumDay(null)');
        expect(win).toContain('allowNewIngredients: null');
    });

    it('handlePantryConsentClose limpia el estado sin invocar ningún handler de red', () => {
        const win = _sliceFrom('const handlePantryConsentClose = () => {', 300);
        expect(win).toContain('setPantryConsent(null)');
        expect(win).toContain('pantryConsentContext.current = null');
        expect(win).not.toContain('fetchWithAuth');
    });

    it('el modal se renderiza con los 3 handlers cableados', () => {
        const win = _sliceFrom('<PantryConsentModal', 500);
        expect(win).toContain('open={!!pantryConsent}');
        expect(win).toContain('onConfirm={handlePantryConsentConfirm}');
        expect(win).toContain('onRetry={handlePantryConsentRetry}');
        expect(win).toContain('onClose={handlePantryConsentClose}');
    });

    it('marker anchor presente', () => {
        expect(_src.split('P1-PANTRY-STRICT-CONSENT').length - 1).toBeGreaterThanOrEqual(5);
    });
});
