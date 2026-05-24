// [P0-AUDIT-HIST-2 · 2026-05-09] Tests del fetch + reconciliación
// `chunkStatusSummary` en History.jsx. Cierra el drift entre
// `plan_chunk_queue.status` y `plan_data._user_action_required`.
//
// Bug original (audit Historial 2026-05-09):
//   `getStatusInfo` decidía el bucket 100% desde plan_data. Solo
//   `_escalate_unrecoverable_chunk` (cron_tasks.py:7928) escribe
//   `_user_action_required` en plan_data; las 6 rutas que setean
//   `status='pending_user_action'` (pausa pantry, snapshot stale,
//   TZ unresolved, missing prior lessons pre-escalation) NO tocan
//   plan_data → drift donde el chunk está bloqueado pero el bucket
//   sale `complete`/`partial` y el banner CTA jamás aparece.
//
// Fix:
//   - Estado `chunkStatusSummary` poblado vía
//     `getHistoryStatusSummary({ signal })` en mount.
//   - `getStatusInfo` reconcilia: si el plan tiene
//     `pending_user_action_count > 0` o `failed_count > 0` en el
//     summary, eleva el bucket a `action_required` aunque
//     plan_data esté limpio.
//   - Banner del modal renderiza copy fallback cuando el drift
//     viene del queue (no de plan_data) — UX consistente con el
//     chip elevado.
//
// Cobertura (static analysis del source — coherente con el patrón
// de los otros tests audit_*):
//   1. Anchor del marker.
//   2. Import de getHistoryStatusSummary desde config/api.
//   3. useState chunkStatusSummary inicializado a {}.
//   4. useEffect dispara la request con timeout 12s + race
//      (mismo patrón que getLessonsCounts).
//   5. setChunkStatusSummary se llama solo si el body es shape
//      válido.
//   6. getStatusInfo lee chunkStatusSummary[plan.id] y eleva a
//      action_required cuando pending_user_action_count > 0.
//   7. La elevación NO degrada (no toca buckets failed/action_required
//      preexistentes — preserva la severidad del plan_data).
//   8. Banner del modal renderiza copy fallback cuando es queue
//      drift (sin _user_action_required ni _exhausted).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');
const _API_PATH = join(__dirname, '..', 'config', 'api.js');

const src = readFileSync(_HISTORY_PATH, 'utf8');
const apiSrc = readFileSync(_API_PATH, 'utf8');


describe('[P0-AUDIT-HIST-2] anchor + import wiring', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P0-AUDIT-HIST-2\s*·\s*2026-05-09\]/);
    });

    it('import incluye getHistoryStatusSummary desde config/api', () => {
        // Detección por substring para no fallar por el orden o
        // separadores del import compuesto.
        const importLine = src.match(
            /import\s*\{[^}]*\}\s*from\s*['"]\.\.\/config\/api['"]/
        );
        expect(importLine).toBeTruthy();
        expect(importLine[0]).toMatch(/getHistoryStatusSummary/);
    });

    it('config/api.js exporta getHistoryStatusSummary apuntando al endpoint correcto', () => {
        // [P1-HISTORY-ABORT · 2026-05-23] Firma evolucionó a
        // `(options = {})` con forwarding al fetchWithAuth. Regex
        // relajado: parens permiten args, segundo arg a fetchWithAuth
        // opcional.
        expect(apiSrc).toMatch(
            /export\s+const\s+getHistoryStatusSummary\s*=\s*\([^)]*\)\s*=>\s*fetchWithAuth\(\s*['"]\/api\/plans\/history-status-summary['"]/
        );
    });
});


describe('[P0-AUDIT-HIST-2] state + fetch wiring', () => {
    it('useState chunkStatusSummary inicializado a {}', () => {
        // Defense vs render: el getter del summary asume objeto.
        expect(src).toMatch(
            /useState\(\{\}\)/
        );
        expect(src).toMatch(
            /const\s*\[\s*chunkStatusSummary\s*,\s*setChunkStatusSummary\s*\]\s*=\s*useState/
        );
    });

    it('useEffect dispara getHistoryStatusSummary con Promise.race + timeout 12s', () => {
        const fetchIdx = src.indexOf('getHistoryStatusSummary({ signal })');
        expect(fetchIdx).toBeGreaterThan(-1);
        const block = src.slice(Math.max(0, fetchIdx - 400), fetchIdx + 600);
        expect(block).toMatch(/Promise\.race/);
        // Timeout 12s consistente con getLessonsCounts.
        expect(block).toMatch(/12000/);
        expect(block).toMatch(/TIMEOUT_HISTORY_STATUS_SUMMARY/);
    });

    it('setChunkStatusSummary solo se invoca con shape válido (typeof body.summary === object)', () => {
        const fetchIdx = src.indexOf('getHistoryStatusSummary({ signal })');
        const block = src.slice(fetchIdx, fetchIdx + 1200);
        expect(block).toMatch(/typeof\s+body\.summary\s*===\s*['"]object['"]/);
        expect(block).toMatch(/setChunkStatusSummary\s*\(\s*body\.summary\s*\)/);
    });

    it('falla del fetch degrada silente (.catch sin toast.error)', () => {
        const fetchIdx = src.indexOf('getHistoryStatusSummary({ signal })');
        const block = src.slice(fetchIdx, fetchIdx + 1500);
        expect(block).toMatch(/\.catch\(\s*\(\)\s*=>\s*\{[^}]*\}\s*\)/);
        // El comentario debe aclarar que es silencioso.
        expect(block).toMatch(/silencioso/);
    });
});


describe('[P0-AUDIT-HIST-2] reconciliación bucket en getStatusInfo', () => {
    // El helper getStatusInfo es largo (>500 líneas con la lógica de
    // buckets + comentarios). Buscamos las identificadores nuevas
    // directamente en todo el source — más robusto que slicing por
    // posición.

    it('getStatusInfo lee chunkStatusSummary[plan.id]', () => {
        expect(src).toMatch(/chunkStatusSummary\s*\[\s*plan\.id\s*\]/);
    });

    it('eleva a action_required cuando pending_user_action_count > 0', () => {
        expect(src).toMatch(/pending_user_action_count/);
        // [P0-HIST-IN-PROGRESS · 2026-05-09] Anchor migrado de
        // `'chunkStatusSummary && plan'` a `_embeddedPuac`. El primer
        // string ahora aparece TAMBIÉN en el bloque de detección
        // `in_progress` (lectura de chunk_in_flight_count vía
        // chunkStatusSummary). `_embeddedPuac` sigue siendo único de
        // la rama de reconciliación PUAC/failed.
        // [P1-HISTORY-ABORT · 2026-05-23] Slice ampliado de 1500 a
        // 3500 chars: el bloque `_embeddedPuac` → `bucket = 'action_required'`
        // creció con guards adicionales del fallback summary; los ~55
        // líneas entre ambos puntos exceden 1500 chars.
        const reconcileIdx = src.indexOf('_embeddedPuac');
        expect(reconcileIdx).toBeGreaterThan(-1);
        const reconcileBlock = src.slice(reconcileIdx, reconcileIdx + 3500);
        expect(reconcileBlock).toMatch(/bucket\s*=\s*['"]action_required['"]/);
    });

    it('eleva a action_required cuando failed_count > 0', () => {
        // [P0-HIST-IN-PROGRESS · 2026-05-09] Mismo cambio de anchor
        // que la aserción anterior — `_embeddedPuac` apunta solo a la
        // reconciliación PUAC/failed.
        // [P1-HISTORY-ABORT · 2026-05-23] Slice ampliado idem (3500).
        const reconcileIdx = src.indexOf('_embeddedPuac');
        const reconcileBlock = src.slice(reconcileIdx, reconcileIdx + 3500);
        expect(reconcileBlock).toMatch(/failed_count/);
    });

    it('NO degrada buckets failed/action_required preexistentes', () => {
        // La condición de elevación debe checar que el bucket
        // actual NO sea 'failed' ni 'action_required' (sería un
        // no-op redundante; pero el guard previene degradación
        // accidental tras un futuro refactor).
        // [P1-AUDIT-HIST-4 · 2026-05-09] El guard ahora envuelve
        // todo el bloque de embedded counters + summary fallback.
        // Anchor único: `_embeddedPuac` solo aparece en la rama de
        // reconciliación dentro de getStatusInfo. Window hacia atrás
        // captura el if-guard.
        const reconcileIdx = src.indexOf('_embeddedPuac');
        expect(reconcileIdx).toBeGreaterThan(-1);
        const reconcileBlock = src.slice(
            Math.max(0, reconcileIdx - 800),
            reconcileIdx + 1500
        );
        expect(reconcileBlock).toMatch(/bucket\s*!==\s*['"]failed['"]/);
        expect(reconcileBlock).toMatch(/bucket\s*!==\s*['"]action_required['"]/);
    });

    it('comentario load-bearing cita el origen del drift', () => {
        // El comentario debe explicar POR QUÉ esta lógica existe
        // — sin esto, un refactor futuro podría removerla.
        const reconcileIdx = src.indexOf('chunkStatusSummary && plan');
        const reconcileBlock = src.slice(
            Math.max(0, reconcileIdx - 1200),
            reconcileIdx
        );
        // Debe citar al menos uno de los anchors clave.
        expect(reconcileBlock).toMatch(
            /pending_user_action|_escalate_unrecoverable_chunk|drift/i
        );
    });
});


describe('[P0-AUDIT-HIST-2] banner del modal con copy fallback queue-drift', () => {
    it('banner renderiza copy fallback cuando el drift viene del queue (sin _user_action_required ni _exhausted)', () => {
        // El banner debe mostrarse cuando _hasQueueDrift es true
        // (summary indica chunks bloqueados pero plan_data limpio).
        // Antes solo se renderizaba si plan_data tenía info →
        // chip "Acción" sin banner = UX incoherente.
        expect(src).toMatch(/_hasQueueDrift/);
        // El guard del early-return debe incluir _hasQueueDrift
        // junto a _hasAction y _exhausted.length (los 3 caminos
        // que disparan banner).
        expect(src).toMatch(
            /!_hasAction\s*&&\s*_exhausted\.length\s*===\s*0\s*&&\s*!_hasQueueDrift/
        );
    });

    it('body fallback menciona "chunk(s) bloqueado(s)" + count agregado', () => {
        // El copy debe ser informativo sin pretender datos que
        // plan_data no tiene.
        expect(src).toMatch(/_queueDriftBody/);
        const dbIdx = src.indexOf('_queueDriftBody');
        const block = src.slice(dbIdx, dbIdx + 800);
        expect(block).toMatch(/bloqueado/);
        // Suma de pending + failed.
        expect(block).toMatch(/_queuePuac\s*\+\s*_queueFailed/);
    });

    it('cuando plan_data tiene actionReq.body, ese gana sobre _queueDriftBody', () => {
        // Coalescing chain: actionReq.body || _queueDriftBody. Si
        // ambos están presentes, plan_data.body es la fuente
        // canónica (el cron lo formateó deliberadamente).
        const bodyIdx = src.indexOf('const _body =');
        expect(bodyIdx).toBeGreaterThan(-1);
        const block = src.slice(bodyIdx, bodyIdx + 600);
        // El operador `:` (ternary) debe colocar _queueDriftBody en
        // el branch del ELSE — solo cae al fallback cuando no hay
        // plan_data.body.
        expect(block).toMatch(/_actionReq\.body[\s\S]*\?[\s\S]*:\s*_queueDriftBody/);
    });
});
