/**
 * [P2-NEW-4 · 2026-05-10] Regression guard: el listener `visibilitychange`
 * de History.jsx limpia TODOS los caches dependientes del plan abierto,
 * no solo `lessons-counts` (P1-HIST-NEW-3).
 *
 * Bug temido (audit 2026-05-10 — descartado tras verificación):
 *   El auditor afirmaba que el listener solo invalidaba `lessons-counts`
 *   y dejaba stale a `chunkMetricsCache` + `lifetimeLessonsCache` tras
 *   regresar de background >60s.
 *
 * Verificación post-audit (History.jsx snapshot 2026-05-10):
 *   El listener (líneas ~388-432) hace 6 invalidaciones cuando hay
 *   `selectedPlan`:
 *     1. fetchHistory()                       — listado base.
 *     2. _fetchLessonsCounts()                — chip "X lecciones".
 *     3. invalidateCachesForPlan(plan.id)     — singleton (lessons/coherence/blocked/metrics).
 *     4. setLessonsDetailCache (omit plan)    — tab Lecciones.
 *     5. setCoherenceHistoryCache (omit)      — tab Ajustes.
 *     6. setBlockedReasonsCache (omit)        — banner pausado.
 *     7. setChunkMetricsCache (omit)          — tab Métricas.
 *     8. setLifetimeLessonsCache (omit)       — sub-sección Aprendizaje.
 *
 * Este test bloquea regresión del contrato — si alguien añade un nuevo
 * cache dependiente de plan y olvida añadirlo al listener, el chip /
 * tab quedará stale tras background → debe verse el patrón al revisar.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HISTORY_JSX = join(__dirname, '..', 'pages', 'History.jsx');


/**
 * Extrae el cuerpo del useEffect que registra el listener de `visibilitychange`.
 * Busca desde `document.addEventListener('visibilitychange'` hacia atrás
 * el `useEffect((` correspondiente; hacia adelante el cierre del listener
 * (return remove + `}, [...]);`).
 */
function extractVisibilityChangeListenerBody(src) {
    const addIdx = src.indexOf("document.addEventListener('visibilitychange'");
    expect(addIdx).toBeGreaterThan(-1);

    // Buscar 100 líneas hacia atrás el `useEffect(() => {` que contiene este listener
    const beforeAdd = src.slice(0, addIdx);
    const useEffectStart = beforeAdd.lastIndexOf('useEffect((');
    expect(useEffectStart).toBeGreaterThan(-1);

    // Tomar el rango entre useEffect y removeEventListener.
    const afterAdd = src.slice(addIdx);
    const removeIdx = afterAdd.indexOf("document.removeEventListener('visibilitychange'");
    expect(removeIdx).toBeGreaterThan(-1);

    return src.slice(useEffectStart, addIdx + removeIdx + 100);
}


describe('[P2-NEW-4] visibilitychange listener — invalidaciones completas', () => {
    let src;
    beforeAll(() => {
        src = readFileSync(HISTORY_JSX, 'utf8');
    });

    it('listener registrado en History.jsx', () => {
        expect(src).toMatch(/document\.addEventListener\(\s*['"]visibilitychange['"]/);
        expect(src).toMatch(/document\.removeEventListener\(\s*['"]visibilitychange['"]/);
    });

    it('listener llama fetchHistory + _fetchLessonsCounts', () => {
        const body = extractVisibilityChangeListenerBody(src);
        expect(body).toMatch(/fetchHistory\(\)/);
        expect(body).toMatch(/_fetchLessonsCounts\(\)/);
    });

    it('listener llama invalidateCachesForPlan para singleton caches', () => {
        const body = extractVisibilityChangeListenerBody(src);
        expect(body).toMatch(/invalidateCachesForPlan\(\s*selectedPlan\.id\s*\)/);
    });

    it.each([
        ['setLessonsDetailCache',       'tab Lecciones'],
        ['setCoherenceHistoryCache',    'tab Ajustes'],
        ['setBlockedReasonsCache',      'banner pausado'],
        ['setChunkMetricsCache',        'tab Métricas (P2-NEW-4)'],
        ['setLifetimeLessonsCache',     'sub-sección Aprendizaje (P2-NEW-4)'],
    ])('listener invalida %s (%s)', (setter, _label) => {
        const body = extractVisibilityChangeListenerBody(src);
        // Patrón esperado:
        //   setX((prev) => { if (!(selectedPlan.id in prev)) return prev; const { [selectedPlan.id]: _omit, ...rest } = prev; return rest; });
        const pattern = new RegExp(
            `${setter}\\(\\(prev\\)\\s*=>\\s*\\{[\\s\\S]{0,300}?selectedPlan\\.id`,
            ''
        );
        expect(body).toMatch(pattern);
    });

    it('listener gated por _STALE_MS (>60s en background) o _dirty', () => {
        const body = extractVisibilityChangeListenerBody(src);
        // El gate "_stale < _STALE_MS && !_dirty" return early — verifica
        // ambos términos están presentes.
        expect(body).toMatch(/_STALE_MS/);
        expect(body).toMatch(/_dirty/);
    });
});
