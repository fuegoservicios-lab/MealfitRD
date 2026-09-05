// [P2-CHAT-ERROR-MINIMAL · 2026-09-04] La burbuja de error del coach era una caja roja con borde y un
// botón bordeado de 44 px («muy feo, hazlo más minimalista»). Ahora: icono pequeño + texto apagado sin
// fondo ni borde, y «Reintentar» como enlace. Y las copias pierden los emojis y la explicación técnica.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

describe('burbuja de error minimalista', () => {
    it('sin caja roja: texto apagado, icono y reintento como enlace', () => {
        const mb = read('src/components/agent/MessageBubble.jsx');
        expect(mb).toContain("(isErrorBubble ? 'var(--text-muted)' : 'var(--text-main)')");
        expect(mb).not.toContain("isErrorBubble ? 'var(--danger-bg)'");
        expect(mb).not.toContain("isErrorBubble ? '1px solid var(--danger-border)'");
        expect(mb).toContain('className="chat-error-line"');
        expect(mb).toContain("{!isErrorBubble && msg.content && msg.content !== '📷 Imagen enviada' && (");
        const i = mb.indexOf('const ErrorRetryButton = ');
        const btn = mb.slice(i, mb.indexOf('export const MemoizedMessageBubble', i));
        expect(btn).toContain("background: 'transparent',");
        expect(btn).toContain('borderRadius: 999,');
        expect(btn).toContain("border: '1px solid var(--border)',");
        expect(btn).not.toContain('#fca5a5');
        expect(btn).not.toContain('minHeight: 44');
    });
    it('las copias son cortas y sin emojis; el turno del coach marca «en vuelo»', () => {
        const ap = read('src/pages/AgentPage.jsx');
        expect(ap).toContain("t('No llegó la respuesta del coach.')");
        expect(ap).toContain("t('Detenido. Cuando quieras, vuelve a enviar tu mensaje.')");
        expect(ap).not.toContain('se interrumpió en el servidor');
        expect(ap).toContain("safeLocalStorageSet('mealfit_chat_turn_inflight', { startedAt: Date.now() })");
        expect(ap).toContain("safeLocalStorageRemove('mealfit_chat_turn_inflight')");
        for (const loc of ['en-US', 'fr-FR', 'it-IT', 'pt-BR']) {
            const cat = JSON.parse(read(`src/i18n/locales/${loc}.json`));
            expect(cat['No llegó la respuesta del coach.'], loc).toBeTruthy();
            expect(cat['Detenido. Cuando quieras, vuelve a enviar tu mensaje.'], loc).toBeTruthy();
        }
    });
});
