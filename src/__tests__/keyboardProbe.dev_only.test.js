/**
 * [P1-KB-SONDA · 2026-08-23 → P1-KB-SONDA-EN-PRODUCCION · mismo día] La sonda del teclado
 * es una herramienta de diagnóstico: pinta números encima de la interfaz y escribe en
 * sessionStorage en cada evento del viewport.
 *
 * EL CONTRATO CAMBIÓ, A SABIENDAS. Nació prohibida en producción. Pero el teclado de iOS
 * no se reproduce desde un escritorio, y el mismo síntoma («al cerrar va lento») sobrevivió
 * a cuatro arreglos decididos por hipótesis: el quinto sin números del dispositivo del
 * dueño habría sido otra hipótesis. Una sonda que sólo funciona donde el defecto no ocurre
 * no es una sonda.
 *
 * Lo que NO cambia es que nadie se la encuentre puesta. En producción el único interruptor
 * es `?kbprobe` en la URL: hay que teclearlo a propósito y desaparece al navegar. El
 * `localStorage`, que sí vale en desarrollo, queda FUERA del camino de producción —
 * persiste entre sesiones, y esa es justo la diferencia entre una sonda y una fuga.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');

describe('[P1-KB-SONDA] la sonda no se enciende sola', () => {
    it('sin opt-in explícito el módulo retorna antes de crear NADA', () => {
        const src = read('utils/keyboardProbe.js');
        const cuerpo = src.slice(src.indexOf('export function iniciarSondaTeclado'));
        const i = cuerpo.indexOf('if (!activa) return');
        expect(i, 'falta el corte por opt-in').toBeGreaterThan(0);
        // Nada de DOM ni de storage ANTES de ese corte: si se crea la caja o se escribe
        // sessionStorage arriba, el «no existe» deja de ser cierto para quien no la pidió.
        const antes = cuerpo.slice(0, i);
        expect(antes).not.toMatch(/createElement|appendChild|sessionStorage\.setItem/);
    });

    it('en PRODUCCIÓN el único interruptor es ?kbprobe (localStorage sólo en DEV)', () => {
        const src = read('utils/keyboardProbe.js');
        expect(src).toMatch(/has\('kbprobe'\)/);
        // La forma que codifica la regla: el ternario reparte DEV vs producción y sólo la
        // rama DEV mira el storage. Si alguien aplana esto a un `||`, la sonda queda
        // encendible de forma persistente en producción.
        const i = src.indexOf('activa = import.meta.env.DEV');
        expect(i, 'el reparto DEV/producción desapareció').toBeGreaterThan(0);
        const ternario = src.slice(i, src.indexOf(';', i));
        expect(ternario).toMatch(/\?\s*\(pedida \|\| safeLocalStorageGet\('mfKbProbe'\)/);
        expect(ternario).toMatch(/:\s*pedida/);
    });

    it('main.jsx la arranca una sola vez y sin gate propio (el gate vive dentro)', () => {
        const src = read('main.jsx');
        const llamadas = src.split('\n').filter((l) => /iniciarSondaTeclado\(\)/.test(l) && !/^\s*\/\//.test(l));
        expect(llamadas).toHaveLength(1);
        // Dos gates en dos ficheros fue el diseño anterior y se contradecían al cambiar
        // uno: ahora la condición es una sola, dentro del módulo que la implementa.
        expect(llamadas[0]).not.toMatch(/import\.meta\.env\.DEV/);
    });

    it('la sonda mide el CONTENEDOR y la CAJA, que es lo que faltaba para el retraso', () => {
        // Sin `cont` y `caja` no se puede distinguir «el navegador resuelve 100dvh tarde»
        // de «nuestro JS llega tarde», y ese es exactamente el diagnóstico pendiente.
        const src = read('utils/keyboardProbe.js');
        expect(src).toMatch(/cont=\$\{alto\}/);
        expect(src).toMatch(/caja=\$\{fondo\}/);
        expect(src).toMatch(/querySelector\('\.agent-container'\)/);
    });
});
