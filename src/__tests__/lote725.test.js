// [P1-PLAN-LOTE-725 · 2026-09-28 · actualizado BB-046] El micrófono del dictado y el botón del modo voz no pueden competir.
//
// El dueño (BB-046): «no me gusta el diseño de cuando activo el microfono normal (rojo), deberia ser muy distinto al
// azul que esta alado, debe tener un diseño diferente mas parecido como el de chatgpt o gemini». Ahora el dictado
// muestra un botón de parada oscuro con halo azul y cuadrado blanco (estilo ChatGPT/Gemini), y el botón del modo voz
// se oculta mientras se dicta para no competir con el botón de detener.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ap = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8').split(String.fromCharCode(13)).join('');
const regla = (sel) => {
    const i = ap.indexOf(`${sel} {`);
    return i < 0 ? '' : ap.slice(i, ap.indexOf('}', i));
};

describe('dictado ≠ modo voz', () => {
    it('el dictado muestra botón de parada (Square) al escuchar y micrófono al estar apagado', () => {
        const i = ap.indexOf('className={`chat-mic-btn');
        const boton = ap.slice(i, ap.indexOf('</button>', i));
        expect(boton).toContain('<Mic size={21} strokeWidth={2.1} aria-hidden="true" />');
        expect(boton).toContain('isListening ? (');
        expect(boton).toContain('<Square size={13}');
        expect(ap).not.toContain('chat-mic-ondas');
    });

    it('dictando es estilo ChatGPT (oscuro con halo azul); el modo voz se oculta mientras se dicta', () => {
        const escuchando = regla('.chat-mic-btn.escuchando');
        expect(escuchando).toContain('#1e293b');
        expect(escuchando).toContain('#3b82f6');
        const voz = regla('.chat-voz-btn');
        expect(voz).toContain('linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)');
        const i = ap.indexOf('className="chat-voz-btn"');
        expect(ap.slice(i, ap.indexOf('</button>', i))).toContain('<AudioLines');
        expect(ap).toContain('!isListening && !input.trim()');
    });
});
