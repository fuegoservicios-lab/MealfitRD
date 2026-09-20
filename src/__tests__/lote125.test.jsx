// [P1-PLAN-LOTE-125 · 2026-09-19] El micrófono del chat (dictado), el vacío del Historial y la Nevera sin ruido.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import {
    DICTADO_SILENCIO_MS,
    DICTADO_UA_NATIVO,
    dictadoDisponible,
    idiomasDeDictado,
    leerResultados,
    mensajeDeErrorDeDictado,
    unirDictado,
} from '../utils/dictado';
import { useDictado } from '../hooks/useDictado';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');

const resultados = (firmes, provisional = '') => {
    const r = firmes.map((x) => Object.assign([{ transcript: x }], { isFinal: true }));
    if (provisional) r.push(Object.assign([{ transcript: provisional }], { isFinal: false }));
    return r;
};

describe('lote 125 · dónde se ofrece el dictado', () => {
    const Motor = function Motor() {};

    it('sin motor de voz no hay botón', () => {
        expect(dictadoDisponible({ win: {}, doc: {}, esNativa: false, userAgent: '' })).toBe(false);
    });

    it('en la web manda la política de permisos: con `microphone=()` el navegador negaría sin preguntar', () => {
        const win = { webkitSpeechRecognition: Motor };
        expect(dictadoDisponible({ win, doc: { featurePolicy: { allowsFeature: () => false } }, userAgent: '' })).toBe(false);
        expect(dictadoDisponible({ win, doc: { featurePolicy: { allowsFeature: (f) => f === 'microphone' } }, userAgent: '' })).toBe(true);
        expect(dictadoDisponible({ win, doc: {}, userAgent: '' })).toBe(true);
    });

    it('en la app nativa solo si el BINARIO declara los permisos (un paquete OTA también corre sobre binarios viejos)', () => {
        const win = { SpeechRecognition: Motor };
        expect(dictadoDisponible({ win, doc: {}, esNativa: true, userAgent: 'Mozilla/5.0 (iPhone) Mobile/15E148' })).toBe(false);
        expect(dictadoDisponible({ win, doc: {}, esNativa: true, userAgent: `Mozilla/5.0 (iPhone) ${DICTADO_UA_NATIVO}` })).toBe(true);
    });

    it('la marca del binario y los permisos del Info.plist viajan JUNTOS', () => {
        expect(leer('capacitor.config.ts')).toContain(`appendUserAgent: '${DICTADO_UA_NATIVO}'`);
        const plist = leer('ios/App/App/Info.plist');
        expect(plist).toContain('<key>NSMicrophoneUsageDescription</key>');
        expect(plist).toContain('<key>NSSpeechRecognitionUsageDescription</key>');
        for (const lang of ['en', 'fr', 'it', 'pt-BR']) {
            const cadenas = leer(`ios/App/App/${lang}.lproj/InfoPlist.strings`);
            expect(cadenas).toContain('"NSMicrophoneUsageDescription"');
            expect(cadenas).toContain('"NSSpeechRecognitionUsageDescription"');
        }
    });
});

describe('lote 125 · las piezas puras del dictado', () => {
    it('une lo escrito con lo dictado: un espacio, mayúscula al empezar frase y el tope del campo', () => {
        expect(unirDictado('', 'me comí dos huevos')).toBe('Me comí dos huevos');
        expect(unirDictado('Hoy desayuné ', ' dos huevos ')).toBe('Hoy desayuné dos huevos');
        expect(unirDictado('Listo.', 'ahora la cena')).toBe('Listo. Ahora la cena');
        expect(unirDictado('hola', '   ')).toBe('hola');
        expect(unirDictado('', 'a'.repeat(9000))).toHaveLength(8192);
    });

    it('lee TODA la lista de resultados: lo firme y lo que aún puede cambiar', () => {
        expect(leerResultados(resultados(['dos huevos ', 'con yuca'], ' y café'))).toEqual({ finales: 'dos huevos con yuca', provisional: ' y café' });
        expect(leerResultados(undefined)).toEqual({ finales: '', provisional: '' });
    });

    it('es-DO no existe en todos los motores: se proponen vecinos, y cada idioma de la app tiene el suyo', () => {
        expect(idiomasDeDictado('es-DO')).toEqual(['es-DO', 'es-US', 'es-MX', 'es-ES']);
        expect(idiomasDeDictado('pt-BR')[0]).toBe('pt-BR');
        expect(idiomasDeDictado('xx-XX')[0]).toBe('es-DO');
    });

    it('un corte voluntario no es un error; un permiso negado sí se explica', () => {
        expect(mensajeDeErrorDeDictado('aborted')).toBeNull();
        expect(mensajeDeErrorDeDictado('not-allowed')).toBe('Permite el micrófono para dictar');
        expect(mensajeDeErrorDeDictado('service-not-allowed')).toBe('Permite el micrófono para dictar');
        expect(mensajeDeErrorDeDictado('otra-cosa')).toBe('No pude iniciar el dictado');
    });
});

describe('lote 125 · el ciclo de vida del micrófono', () => {
    let motores;

    beforeEach(() => {
        vi.useFakeTimers();
        motores = [];
        class MotorFalso {
            constructor() { motores.push(this); this.parado = false; this.abortado = false; }
            start() { this.onstart?.(); }
            stop() { this.parado = true; }
            abort() { this.abortado = true; }
        }
        window.SpeechRecognition = MotorFalso;
    });

    afterEach(() => {
        delete window.SpeechRecognition;
        vi.useRealTimers();
    });

    const montar = (inicial = '') => {
        const escrito = { valor: inicial };
        const vista = renderHook(({ valor }) => useDictado({ valor, alCambiar: (v) => { escrito.valor = v; }, locale: 'es-DO' }), { initialProps: { valor: inicial } });
        const pintar = () => vista.rerender({ valor: escrito.valor });
        return { vista, escrito, pintar };
    };

    it('escribe MIENTRAS se habla, sobre lo que ya había', () => {
        const { vista, escrito, pintar } = montar('Hoy');
        expect(vista.result.current.disponible).toBe(true);
        act(() => vista.result.current.alternar());
        expect(vista.result.current.escuchando).toBe(true);
        expect(motores[0].lang).toBe('es-DO');
        expect(motores[0].interimResults).toBe(true);
        act(() => motores[0].onresult({ results: resultados([], 'me comí') }));
        expect(escrito.valor).toBe('Hoy me comí');
        pintar();
        act(() => motores[0].onresult({ results: resultados(['me comí dos huevos']) }));
        expect(escrito.valor).toBe('Hoy me comí dos huevos');
        pintar();
        expect(vista.result.current.escuchando).toBe(true);
    });

    it('ENVIAR cancela: un resultado que llega tarde no vuelve a escribir en la caja', () => {
        const { vista, escrito, pintar } = montar('');
        act(() => vista.result.current.alternar());
        act(() => motores[0].onresult({ results: resultados(['hola coach']) }));
        pintar();
        act(() => vista.result.current.cancelar());
        expect(motores[0].abortado).toBe(true);
        expect(vista.result.current.escuchando).toBe(false);
        escrito.valor = '';
        act(() => motores[0].onresult({ results: resultados(['hola coach', 'texto tardío']) }));
        expect(escrito.valor).toBe('');
    });

    it('si el usuario toca el texto a mano, manda él: el dictado se apaga con su texto intacto', () => {
        const { vista, escrito } = montar('');
        act(() => vista.result.current.alternar());
        act(() => motores[0].onresult({ results: resultados(['dos huevos']) }));
        vista.rerender({ valor: 'Dos huevos' });
        act(() => motores[0].onresult({ results: resultados(['dos huevos'], ' con') }));
        expect(vista.result.current.escuchando).toBe(true);
        // la caja cambia y no fue el dictado: el siguiente resultado NO la pisa y el micrófono se apaga
        escrito.valor = 'Dos huevo';
        vista.rerender({ valor: 'Dos huevo' });
        act(() => motores[0].onresult({ results: resultados(['dos huevos'], ' con yuca') }));
        expect(escrito.valor).toBe('Dos huevo');
        expect(vista.result.current.escuchando).toBe(false);
        expect(motores[0].abortado).toBe(true);
    });

    it('un micrófono olvidado se apaga solo, y si el motor nunca avisa se cierra a la fuerza', () => {
        const { vista, pintar } = montar('');
        act(() => vista.result.current.alternar());
        act(() => motores[0].onresult({ results: resultados(['hola']) }));
        pintar();
        act(() => { vi.advanceTimersByTime(DICTADO_SILENCIO_MS + 10); });
        expect(motores[0].parado).toBe(true);
        act(() => { vi.advanceTimersByTime(2000); });
        expect(vista.result.current.escuchando).toBe(false);
    });

    it('si el motor rechaza el idioma se prueba el siguiente; un permiso negado se dice y se apaga', () => {
        const { vista } = montar('');
        act(() => vista.result.current.alternar());
        act(() => { motores[0].onerror({ error: 'language-not-supported' }); motores[0].onend(); });
        expect(motores).toHaveLength(2);
        expect(motores[1].lang).toBe('es-US');
        act(() => { motores[1].onerror({ error: 'not-allowed' }); motores[1].onend(); });
        expect(vista.result.current.escuchando).toBe(false);
        expect(vista.result.current.error).toBe('Permite el micrófono para dictar');
    });
});

describe('lote 125 · el chat, el Historial y la Nevera', () => {
    it('el chat pinta el micrófono solo donde puede funcionar, y enviar CANCELA (no «detiene»)', () => {
        const ap = leer('src/pages/AgentPage.jsx');
        expect(ap).toContain("const dictado = useDictado({ valor: input, alCambiar: setInput, locale: getLocale(), esNativa: isNativeApp() });");
        expect(ap).toContain('{dictado.disponible && !isCallModeActive && (');
        // [P1-PLAN-LOTE-127] el clic pasa por handleMicClick (recuerda si había teclado) y de ahí a dictado.alternar()
        expect(ap).toContain('onClick={handleMicClick}');
        expect(ap).toContain('dictado.alternar();');
        expect(ap).toContain('onPointerDown={(e) => e.preventDefault()}');
        expect(ap).toMatch(/if \(isListening\) \{\n\s+dictado\.cancelar\(\);/);
        expect(ap).toContain("placeholder={isListening ? t('Te escucho…') :");
        expect(ap).toContain('onChange={(e) => { if (isListening) dictado.cancelar(); setInput(e.target.value); }}');
        const css = ap.slice(ap.indexOf('.chat-mic-btn {'), ap.indexOf('.chat-offline-status {'));
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).not.toContain('`');
    });

    it('el vacío del Historial enseña lo que va a haber y ya no es una caja punteada', () => {
        const h = leer('src/pages/History.jsx');
        expect(h).toContain('<div className={`${styles.emptyState} ${styles.emptyStateArt}`} role="status">');
        expect(h.match(/className=\{styles\.emptyGhost\}/g)).toHaveLength(3);
        const css = leer('src/pages/History.module.css');
        expect(css).not.toContain('border: 2px dashed #CBD5E1;');
        expect(css).toMatch(/\.emptyStateArt \{\n\s+min-height: calc\(100dvh/);
    });

    it('con la Nevera vacía no se ofrece lo que no puede hacer nada, y «Borrar todos» no pesa como el botón principal', () => {
        const p = leer('src/pages/Pantry.jsx');
        expect(p).toContain('const neveraVacia = inventory.length === 0;');
        // [P1-PLAN-LOTE-137] +1: el botón «Vaciar la nevera» del shell de ESCRITORIO (paridad con el teléfono)
        expect(p.match(/\{!neveraVacia && \(/g)).toHaveLength(3);
        expect(p).toContain('{tempZoneCount > 0 && (');
        expect(p).toContain('{pantryStatus?.is_below && !neveraVacia && (');
        const css = leer('src/pages/Pantry.mobileFridge.module.css');
        expect(css).toContain('.clear { flex: 0 0 auto;');
        expect(css).not.toContain('border: 1px dashed var(--border); background: var(--bg-page); border-radius: 16px; margin: 10px 2px;');
    });
});
