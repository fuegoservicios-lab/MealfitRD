// [P1-PLAN-LOTE-725 · 2026-09-28] El micrófono del dictado y el botón del modo voz no pueden parecer el mismo botón.
//
// El dueño, con los dos a la vista: «lo del micrófono no puede verse igual que el agente IA de voz, tienen que verse
// visualmente diferente». Dictando, el micrófono pintaba ondas moradas en un círculo morado; al lado, el modo voz son
// ondas en un círculo con degradado. Ahora el micrófono siempre es un micrófono y dictando se pone ROJO (grabación).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ap = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8').split(String.fromCharCode(13)).join('');
const regla = (sel) => {
    const i = ap.indexOf(`${sel} {`);
    return i < 0 ? '' : ap.slice(i, ap.indexOf('}', i));
};

describe('dictado ≠ modo voz', () => {
    it('el micrófono pinta un micrófono también mientras escucha (sin las ondas del modo voz)', () => {
        const i = ap.indexOf('className={`chat-mic-btn');
        const boton = ap.slice(i, ap.indexOf('</button>', i));
        expect(boton).toContain('<Mic size={21} strokeWidth={2.1} aria-hidden="true" />');
        expect(boton).not.toContain('isListening ? (');
        expect(ap).not.toContain('chat-mic-ondas');
    });

    it('dictando es rojo de grabación; el modo voz sigue siendo el degradado azul con ondas', () => {
        const escuchando = regla('.chat-mic-btn.escuchando');
        expect(escuchando).toContain('#ef4444');
        expect(escuchando).not.toMatch(/#6366f1|#4f46e5/i);
        const voz = regla('.chat-voz-btn');
        expect(voz).toContain('linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)');
        const i = ap.indexOf('className="chat-voz-btn"');
        expect(ap.slice(i, ap.indexOf('</button>', i))).toContain('<AudioLines');
    });
});
