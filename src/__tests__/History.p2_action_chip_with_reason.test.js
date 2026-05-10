// [P2-HIST-NEW-1 · 2026-05-09] Tests del chip "Acción: <reason>" en
// la card del Historial (consistencia con Dashboard que ya mostraba
// el reason en el slot del plan ACTIVO desde P0-DASH-CHIP-HONESTY).
//
// Bug original (audit profundo Historial 2026-05-09):
//   El chip "Acción" de la card era genérico — el reason real solo
//   era visible al abrir el modal (lazy fetch /blocked_reasons).
//   Inconsistencia surface-to-surface: Dashboard slot = "Pausado:
//   empty_pantry", History card = "Acción". Mismo plan, dos labels.
//
// Fix:
//   Backend (history-list LATERAL qaction) devuelve
//   `primary_action_reason` del chunk bloqueante más temprano.
//   Frontend usa map es-DO breve (utils/actionReasons.js) para
//   promover "Acción" → "Acción: Nevera vacía". Si reason_code no
//   está en el catálogo, cae a "Acción" plano (no inventa copy).
//
// Cobertura:
//   1. Anchor del marker.
//   2. Import de getActionReasonLabel.
//   3. Render condicional: solo bucket=action_required.
//   4. Lectura de plan.primary_action_reason.
//   5. Fallback a "Acción" plano cuando label es null.
//   6. Tooltip diferenciado según presencia de reason.
//   7. Helper map cubre catálogo de /blocked_reasons backend.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getActionReasonLabel, _ACTION_REASON_LABELS_MAP } from '../utils/actionReasons';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const _HISTORY_PATH = join(__dirname, '..', 'pages', 'History.jsx');

const src = readFileSync(_HISTORY_PATH, 'utf8');


describe('[P2-HIST-NEW-1] anchor + import del helper', () => {
    it('marker presente en History.jsx', () => {
        expect(src).toMatch(/\[P2-HIST-NEW-1\s*·\s*2026-05-09\]/);
    });

    it('importa getActionReasonLabel del helper SSOT', () => {
        expect(src).toMatch(
            /import\s+\{\s*getActionReasonLabel\s*\}\s+from\s+['"]\.\.\/utils\/actionReasons['"]/
        );
    });
});


describe('[P2-HIST-NEW-1] render del chip action_required', () => {
    it('lee plan.primary_action_reason en la rama action_required', () => {
        const idx = src.indexOf("_info.bucket === 'action_required'");
        expect(idx).toBeGreaterThan(-1);
        const block = src.slice(idx, idx + 2500);
        expect(block).toMatch(/getActionReasonLabel\(plan\.primary_action_reason\)/);
    });

    it('label dinámico: "Acción: <label>" cuando hay reason válido', () => {
        const idx = src.indexOf("_info.bucket === 'action_required'");
        const block = src.slice(idx, idx + 2500);
        // Template literal con _reasonLabel.
        expect(block).toMatch(/Acci[oó]n:\s*\$\{_reasonLabel\}/);
    });

    it('fallback a "Acción" plano cuando reason_code no está en catálogo', () => {
        // Si getActionReasonLabel devuelve null (code desconocido),
        // mejor "Acción" que un code técnico crudo visible al user.
        // El ternario es:
        //   _reasonLabel ? `Acción: ${_reasonLabel}` : 'Acción'
        const idx = src.indexOf("_info.bucket === 'action_required'");
        const block = src.slice(idx, idx + 2500);
        // Buscar `_reasonLabel` seguido de `?` y eventualmente
        // `: 'Acción'` (la rama else del ternario).
        expect(block).toMatch(/_reasonLabel[\s\S]*?\?[\s\S]*?:\s*['"]Acci[oó]n['"]/);
    });

    it('tooltip diferenciado: incluye reason si está, sino genérico', () => {
        const idx = src.indexOf("_info.bucket === 'action_required'");
        const block = src.slice(idx, idx + 2500);
        // Tooltip dinámico: con reason copy específica, sin reason copy
        // genérica. Ambos branches presentes.
        expect(block).toMatch(/Acci[oó]n requerida\s*—\s*\$\{_reasonLabel\}/);
        expect(block).toMatch(/Acci[oó]n requerida:\s*hay chunks pendientes/);
    });
});


describe('[P2-HIST-NEW-1] helper actionReasons.js', () => {
    it('getActionReasonLabel devuelve null para input no-string', () => {
        expect(getActionReasonLabel(null)).toBeNull();
        expect(getActionReasonLabel(undefined)).toBeNull();
        expect(getActionReasonLabel(123)).toBeNull();
        expect(getActionReasonLabel({})).toBeNull();
    });

    it('getActionReasonLabel devuelve null para string vacío o whitespace', () => {
        expect(getActionReasonLabel('')).toBeNull();
        expect(getActionReasonLabel('   ')).toBeNull();
    });

    it('getActionReasonLabel devuelve null para code desconocido', () => {
        // Code no en catálogo → null. Frontend cae al fallback "Acción".
        expect(getActionReasonLabel('totally_unknown_code')).toBeNull();
    });

    it('catálogo cubre los pause reasons canónicos', () => {
        // Los pause reasons del temporal_gate / pantry_gate / etc.
        const _required = [
            'learning_zero_logs',
            'stale_snapshot',
            'empty_pantry',
            'tz_unresolved',
            'missing_prior_lessons',
        ];
        for (const code of _required) {
            const label = getActionReasonLabel(code);
            expect(label).toBeTruthy();
            expect(typeof label).toBe('string');
        }
    });

    it('catálogo cubre los dead-letter reasons canónicos', () => {
        const _required = [
            'recovery_exhausted',
            'unrecoverable_missing_anchor',
            'unrecoverable_corrupted_date',
            'missing_prior_lessons_unrecoverable',
        ];
        for (const code of _required) {
            const label = getActionReasonLabel(code);
            expect(label).toBeTruthy();
        }
    });

    it('labels son cortos (≤25 chars) para chip layout', () => {
        // Cap defensivo: si alguien añade un label largo, el chip
        // se desborda en mobile. 25 chars es el ancho típico de
        // un chip antes de truncate visual.
        for (const [code, label] of Object.entries(_ACTION_REASON_LABELS_MAP)) {
            expect(label.length).toBeLessThanOrEqual(25);
        }
    });

    it('labels son strings no-vacíos post-trim', () => {
        for (const [code, label] of Object.entries(_ACTION_REASON_LABELS_MAP)) {
            expect(typeof label).toBe('string');
            expect(label.trim().length).toBeGreaterThan(0);
        }
    });
});
