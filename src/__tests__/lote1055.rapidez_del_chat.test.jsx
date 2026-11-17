// [P1-PLAN-LOTE-1055 · 2026-11-17] El chat repinta la página entera en cada tecla y en cada trozo de la respuesta. Medido
// en un arnés de producción (CPU ×4, 40 mensajes): el autoajuste de la caja descolocaba la página dos veces por tecla,
// «Recientes» se repintaba entera, la lista de mensajes se recorría entera y `formatDate` construía un `Intl` nuevo por
// llamada. Estas pruebas fijan los cuatro arreglos.
import React, { useRef, useState, useEffect } from 'react';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formateadorDeFecha, formateadorDeNumero, _vaciarFormateadores, _tamanoDeLaCache } from '../i18n/formateadores';
import { formatDate, formatNumber } from '../i18n';
import { useAutosizeTextarea } from '../utils/autosizeTextarea';
import { SidebarRecientes } from '../components/agent/SidebarRecientes';

const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('[1055] formateadores de Intl reutilizados', () => {
    beforeEach(() => _vaciarFormateadores());

    it('mismo locale y opciones ⇒ el MISMO formateador; otro locale u opciones ⇒ otro', () => {
        const a = formateadorDeFecha('es-DO', { day: 'numeric', month: 'long' });
        expect(formateadorDeFecha('es-DO', { day: 'numeric', month: 'long' })).toBe(a);
        expect(formateadorDeFecha('fr-FR', { day: 'numeric', month: 'long' })).not.toBe(a);
        expect(formateadorDeFecha('es-DO', { hour: '2-digit' })).not.toBe(a);
        expect(formateadorDeNumero('es-DO')).toBe(formateadorDeNumero('es-DO'));
        expect(formateadorDeNumero('es-DO')).not.toBe(formateadorDeFecha('es-DO'));
    });

    it('formatea byte a byte igual que un Intl recién construido', () => {
        const d = new Date(2026, 7, 24, 14, 32);
        const op = { weekday: 'long', day: 'numeric', month: 'long' };
        expect(formatDate(d, op)).toBe(new Intl.DateTimeFormat('es-DO', op).format(d));
        expect(formatDate(d, op)).toBe(formatDate(d, op));
        expect(formatNumber(1404.5, { maximumFractionDigits: 1 })).toBe(new Intl.NumberFormat('es-DO', { maximumFractionDigits: 1 }).format(1404.5));
    });

    it('unas opciones inválidas siguen fallando como antes y no se guardan', () => {
        expect(() => formateadorDeNumero('es-DO', { style: 'currency' })).toThrow();
        expect(_tamanoDeLaCache()).toBe(0);
        expect(formatNumber(5, { style: 'currency' })).toBe('5');   // su red de siempre: el número a secas
    });

    it('se vacía al volver a la app (el huso horario pudo cambiar en un viaje)', () => {
        formateadorDeFecha('es-DO', { hour: '2-digit' });
        expect(_tamanoDeLaCache()).toBe(1);
        act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        expect(_tamanoDeLaCache()).toBe(0);
    });

    it('i18n ya no construye un DateTimeFormat/NumberFormat por llamada', () => {
        const src = sinComentarios(leer('i18n/index.js'));
        expect(src).not.toMatch(/new Intl\.DateTimeFormat\(/);
        expect(src).not.toMatch(/new Intl\.NumberFormat\(_locale, options\)/);
    });
});

describe('[1055] autoajuste: al teclear al final, solo MIRA', () => {
    const LINEA = 24;
    const lecturas = [];
    beforeAll(() => {
        Object.defineProperty(window.HTMLTextAreaElement.prototype, 'scrollHeight', {
            configurable: true,
            get() { lecturas.push(this.style.height); return (this.value === '' ? 1 : this.value.split('\n').length) * LINEA; },
        });
        Object.defineProperty(window.HTMLTextAreaElement.prototype, 'clientHeight', {
            configurable: true, get() { return parseFloat(this.style.height) || 0; },
        });
        Object.defineProperty(window.HTMLTextAreaElement.prototype, 'clientWidth', { configurable: true, get() { return 300; } });
    });
    afterAll(() => {
        for (const k of ['scrollHeight', 'clientHeight', 'clientWidth']) delete window.HTMLTextAreaElement.prototype[k];
    });

    function Caja({ onReady }) {
        const ref = useRef(null);
        const [v, setV] = useState('');
        useAutosizeTextarea(ref, v);
        useEffect(() => { onReady(setV); }, [onReady]);
        return <textarea ref={ref} rows={1} value={v} onChange={(e) => setV(e.target.value)} data-testid="c" />;
    }

    it('crece y encoge como siempre, pero una letra más que cabe no pone `height:auto`', () => {
        const api = { set: null };
        const onReady = (setter) => { api.set = setter; };
        const { getByTestId } = render(<Caja onReady={onReady} />);
        const el = getByTestId('c');
        act(() => { api.set('h'); });
        expect(el.style.height).toBe(`${LINEA}px`);
        lecturas.length = 0;
        act(() => { api.set('ho'); });
        act(() => { api.set('hol'); });
        expect(lecturas.length).toBeGreaterThan(0);
        expect(lecturas.every((h) => h === `${LINEA}px`)).toBe(true);   // midió sin descolocar
        act(() => { api.set('hol\na'); });                                // no cabe: camino completo
        expect(el.style.height).toBe(`${2 * LINEA}px`);
        act(() => { api.set('hol'); });                                   // borrar: camino completo, encoge
        expect(el.style.height).toBe(`${LINEA}px`);
        act(() => { api.set(''); });                                      // enviar
        expect(el.style.height).toBe(`${LINEA}px`);
    });
});

describe('[1055] el chat no repinta lo que no cambió al escribir', () => {
    it('«Recientes» va memorizado', () => {
        expect(SidebarRecientes.$$typeof).toBe(Symbol.for('react.memo'));
    });

    it('el chat le pasa funciones estables y grupos memorizados', () => {
        const src = leer('pages/AgentPage.jsx');
        const uso = src.slice(src.indexOf('<SidebarRecientes'), src.indexOf('/>', src.indexOf('<SidebarRecientes')));
        for (const prop of ['handleNewChat={handleNewChatEstable}', 'onVolverAHoy={handleVolverAHoyEstable}',
            'setCurrentSessionId={setCurrentSessionIdEstable}', 'handleDeleteChat={handleDeleteChatEstable}']) {
            expect(uso).toContain(prop);
        }
        expect(src).toMatch(/const gruposConEtiqueta = useMemo\(/);
    });

    it('las burbujas del hilo salen de un useMemo (no de un .map en cada render)', () => {
        const src = leer('pages/AgentPage.jsx');
        expect(src).toMatch(/const burbujasDelHilo = useMemo\(\(\) => visibleMessages\.map\(/);
        expect(src).toContain(') : burbujasDelHilo}');
        const deps = src.slice(src.indexOf('const burbujasDelHilo'), src.indexOf('const showCoachPensando'));
        for (const d of ['visibleMessages', 'currentSessionId', 'localeActivo', 'welcomeClockKey']) expect(deps).toContain(d);
        expect(src).toMatch(/const visibleMessages = useMemo\(/);
    });
});
