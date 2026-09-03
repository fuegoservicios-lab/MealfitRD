// [P1-CHAT-ORPHAN-TURN-TRUTH · 2026-09-03] Al recargar con el último mensaje sin respuesta, el
// cliente sondeaba /history hasta 30 veces (~4 min) «Recuperando tu respuesta…» aunque el turno
// ya hubiera muerto en el servidor. Ahora /history trae `turn_active`; si es false y sigue sin
// respuesta, se abandona en el primer sondeo con una burbuja reintentable que dice la verdad.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');
const SRC = read('src/pages/AgentPage.jsx');

describe('recuperación de un turno huérfano', () => {
    it('abandona en el primer sondeo cuando el servidor dice que el turno no está vivo', () => {
        const i = SRC.indexOf('const _poll = async () => {');
        expect(i).toBeGreaterThan(0);
        const poll = SRC.slice(i, SRC.indexOf('st.timer = setTimeout(_poll, 2500);', i));
        expect(poll).toContain("if (data && data.turn_active === false) {");
        expect(poll).toContain("_abandon('dead');");
        // la comprobación va DESPUÉS de buscar una respuesta real (si llegó, gana la respuesta)
        expect(poll.indexOf("srvLast.role === 'model'")).toBeLessThan(poll.indexOf('data.turn_active === false'));
        // backend viejo (sin el campo) ⇒ conducta previa: seguir sondeando
        expect(poll).not.toContain('!data.turn_active');
    });
    it('los dos cierres comparten la burbuja reintentable y las anclas de STOP-POWER siguen', () => {
        expect(SRC).toContain("const _abandon = (motivo) => {");
        expect(SRC).toContain("_abandon('exhausted');");
        expect(SRC).toContain('cur.attempts > 30');
        expect(SRC).toContain('retryPrompt: canRetry ? lastPrev.content : null');
        expect(SRC).toContain("errorType: 'dead_turn',");
        expect(SRC).toContain("t('⚠ La respuesta del coach no llegó: se interrumpió en el servidor. Puedes reintentar.')");
    });
    it('el motivo del cierre se persiste y la rehidratación pinta la burbuja correcta (no siempre «Detenido»)', () => {
        expect(SRC).toContain("(sid) => `mealfit_orphan_reason_${sid}`");
        expect(SRC).toContain("safeLocalStorageSet(_orphanReasonKey(currentSessionId), motivo);");
        expect(SRC).toContain("safeLocalStorageSet(_orphanReasonKey(currentSessionId), 'stopped');");
        expect(SRC).toContain("safeLocalStorageGet(_orphanReasonKey(sessionId), null) || 'stopped',");
        expect(SRC).toContain('const _orphanBubble = useCallback((reason, lastUser) => {');
        expect((SRC.match(/_orphanBubble\(/g) || []).length).toBeGreaterThanOrEqual(3);   // fábrica + 2 usos
    });
    it('catálogos: las dos claves nuevas en los 4 idiomas', () => {
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            expect(cat['⚠ La respuesta del coach no llegó: se interrumpió en el servidor. Puedes reintentar.'], loc).toBeTruthy();
            expect(cat['⚠ La respuesta del coach no llegó: se interrumpió en el servidor. Vuelve a enviar tu mensaje (o la foto).'], loc).toBeTruthy();
        }
    });
});
