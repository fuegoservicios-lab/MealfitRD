// [P1-PLAN-LOTE-112] La sonda del teclado en la app nativa: `/sonda` en el chat la enciende y la apaga. En la web
// el interruptor sigue siendo solo `?kbprobe` (keyboardProbe.dev_only.test.js).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const plataforma = vi.hoisted(() => ({ nativa: true }));
vi.mock('../config/platform', () => ({ isNativeApp: () => plataforma.nativa }));

import { alternarSondaTecladoNativa, iniciarSondaTeclado, CLAVE_SONDA_NATIVA } from '../utils/keyboardProbe';

const caja = () => [...document.querySelectorAll('pre[aria-hidden="true"]')];

beforeEach(() => {
    plataforma.nativa = true;
    localStorage.clear();
    vi.stubGlobal('visualViewport', { height: 800, offsetTop: 0, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

describe('sonda del teclado nativa', () => {
    it('se enciende, persiste, no se duplica y se apaga', () => {
        expect(alternarSondaTecladoNativa()).toBe(true);
        expect(localStorage.getItem(CLAVE_SONDA_NATIVA)).toBe('1');
        expect(caja()).toHaveLength(1);
        expect(caja()[0].textContent).toContain('[nativa] paquete');
        expect(caja()[0].textContent).toContain('inset recordado');
        iniciarSondaTeclado(); // el arranque de main.jsx con la bandera puesta no pinta una segunda caja
        expect(caja()).toHaveLength(1);
        expect(alternarSondaTecladoNativa()).toBe(false);
        expect(localStorage.getItem(CLAVE_SONDA_NATIVA)).toBeNull();
        expect(caja()).toHaveLength(0);
    });
    it('cada fila lleva milisegundos desde el último toque en la caja de escribir', () => {
        alternarSondaTecladoNativa();
        document.dispatchEvent(new Event('focusin'));
        expect(caja()[0].textContent).toMatch(/\+\s*\d+ focus/);
        alternarSondaTecladoNativa();
    });
    it('en la web la bandera no enciende nada', () => {
        plataforma.nativa = false;
        localStorage.setItem(CLAVE_SONDA_NATIVA, '1');
        expect(alternarSondaTecladoNativa()).toBe(false);
        iniciarSondaTeclado();
        expect(caja()).toHaveLength(0);
    });
    it('el chat intercepta `/sonda` antes de abrir turno, y solo en nativo', () => {
        const src = readFileSync(join(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
        const i = src.indexOf('const handleSend = async (overrideInput = null, options = {}) => {');
        const cuerpo = src.slice(i, i + 1400);
        const j = cuerpo.indexOf("if (isNativeApp() && textToSend.trim().toLowerCase() === '/sonda') {");
        expect(j).toBeGreaterThan(-1);
        expect(j).toBeLessThan(cuerpo.indexOf('turnGateRef.current.begin()') === -1 ? Infinity : cuerpo.indexOf('turnGateRef.current.begin()'));
        expect(cuerpo.slice(j, j + 400)).toContain('return;');
    });
    it('el alto del teclado se recuerda sin depender del paneo ni del modo del WebView', () => {
        const src = readFileSync(join(__dirname, '..', 'pages', 'AgentPage.jsx'), 'utf8');
        expect(src).toContain('if (forzarMedicion && abierto && kb >= KB_UMBRAL_PX && isNativeApp()) {');
        expect(src).toContain('safeLocalStorageSet(CLAVE_INSET_NATIVO, String(kb));');
    });
});
