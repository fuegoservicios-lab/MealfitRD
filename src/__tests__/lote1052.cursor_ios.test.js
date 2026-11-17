// [P1-PLAN-LOTE-1052] iOS dejaba el cursor del cuadro de escribir donde estaba cuando la caja se movía con el campo
// enfocado (teclado animándose, panel de adjuntar abriéndose y cerrándose). Se recoloca cuando todo se asienta.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refrescarCursor, programarRefrescoDelCursor } from '../utils/cursorIOS';

const campo = (texto = 'hola') => {
    const t = document.createElement('textarea');
    t.value = texto;
    document.body.appendChild(t);
    return t;
};
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); vi.restoreAllMocks(); });

describe('[1052] refrescarCursor', () => {
    it('en iOS, con el campo enfocado, le da capa un fotograma y deja la MISMA selección (no toca el texto ni el foco)', () => {
        const raf = [];
        vi.stubGlobal('requestAnimationFrame', (f) => { raf.push(f); return raf.length; });
        const t = campo('hola mundo');
        t.focus();
        t.setSelectionRange(2, 5);
        const fijar = vi.spyOn(t, 'setSelectionRange');
        expect(refrescarCursor(t, { ios: true })).toBe(true);
        expect(t.style.webkitTransform).toBe('translateZ(0)');
        raf.forEach((f) => f());
        expect(t.style.webkitTransform).toBe('');
        expect(fijar).toHaveBeenCalledWith(2, 5, expect.any(String));
        expect(t.value).toBe('hola mundo');
        expect(document.activeElement).toBe(t);
        vi.unstubAllGlobals();
    });

    it('no hace nada fuera de iOS ni con el campo sin foco', () => {
        const t = campo();
        expect(refrescarCursor(t, { ios: false })).toBe(false);
        expect(refrescarCursor(t, { ios: true })).toBe(false);   // sin foco
        expect(t.style.webkitTransform).toBe('');
    });

    it('programado: solo actúa una vez, tras el ÚLTIMO aviso (el teclado manda decenas seguidos)', () => {
        vi.useFakeTimers();
        const t = campo();
        t.focus();
        const obtener = vi.fn(() => t);
        for (let i = 0; i < 20; i++) { programarRefrescoDelCursor(obtener, 300, { ios: true }); vi.advanceTimersByTime(50); }
        expect(obtener).not.toHaveBeenCalled();
        vi.advanceTimersByTime(300);
        expect(obtener).toHaveBeenCalledTimes(1);
    });

    it('nunca hace blur/focus (cerraría el teclado de iOS)', () => {
        const src = readFileSync(join(__dirname, '..', 'utils', 'cursorIOS.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
        expect(src).not.toMatch(/\.blur\(|\.focus\(/);
    });

    it('el chat lo llama al mover la caja con el teclado y al abrir/cerrar el panel de adjuntar', () => {
        const src = readFileSync(join(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
        expect(src).toMatch(/: '';\s*\/\/ \[P1-PLAN-LOTE-1052\][^\n]*\n\s*if \(abierto\) programarRefrescoDelCursor\(\(\) => chatInputRef\.current\);/);
        expect(src).toContain('useEffect(() => { programarRefrescoDelCursor(() => chatInputRef.current, 260); }, [showAttachmentSource]);');
    });
});
