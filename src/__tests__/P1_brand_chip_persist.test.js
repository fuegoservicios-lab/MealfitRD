/* [P1-BRAND-CHIP-PERSIST · 2026-08-14] Los chips «Genérico» (el selector de
 * marca de cada fila de la Nevera) desaparecían unos milisegundos en cada
 * refresh.
 *
 * Causa, la misma familia que P1-URGENT-FLASH-UNKNOWN pero en el sentido
 * contrario: `brandCache` arranca en `{}` y se llena con un POST en lote
 * (debounced) a /api/supermarket/match. Mientras ese POST va en camino, la
 * fila evalúa `if (!_brands.length && !item.brand) return null` — o sea,
 * «todavía no sé qué marcas hay» se resuelve como «no hay marcas» y el chip
 * NO se pinta. Cuando la respuesta llega, aparece de golpe.
 *
 * Antes el aviso rojo salía y se retiraba; aquí el chip falta y aparece. El
 * defecto es el mismo: un estado de carga indistinguible del estado vacío.
 *
 * El arreglo NO es un placeholder: reservar el hueco en todas las filas
 * cambiaría el pop-in por un pop-out en las que de verdad no tienen marca. Lo
 * que se arregla es la CAUSA — el catálogo del súper es cuasi-inmutable (no
 * cambia entre dos refrescos), así que se cachea como ya se hace con el
 * masterList y los platos criollos: al refrescar, las marcas están en el
 * primer frame y el chip nunca llega a faltar. La primera visita absoluta
 * sigue teniendo un pop-in — no hay forma de saber las marcas antes de
 * preguntarlas, y ahí sí sería honesto.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    getCachedBrands, setCachedBrands, _resetPantryCacheForTests,
} from '../utils/pantryCache';

const SRC = fs.readFileSync(path.resolve(__dirname, '../pages/Pantry.jsx'), 'utf8')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const MAPA = { 'leche descremada': { loading: false, brands: [{ brand: 'Rica', price: 90 }] } };

describe('[P1-BRAND-CHIP-PERSIST] las marcas sobreviven al refresh', () => {
    beforeEach(() => { _resetPantryCacheForTests(); });

    it('sin cache devuelve undefined (y NO un objeto vacío que finja saber)', () => {
        // `{}` diría «no hay marcas para nadie»; undefined dice «no sé»,
        // que es lo que permite al llamador decidir.
        expect(getCachedBrands()).toBeUndefined();
    });

    it('lo guardado se recupera', () => {
        setCachedBrands(MAPA);
        expect(getCachedBrands()).toEqual(MAPA);
    });

    it('sobrevive a un reload (se persiste fuera de memoria)', () => {
        setCachedBrands(MAPA);
        // Se lee el disco directamente: usar el reset para «simular el reload»
        // no valdría, porque el reset limpia también el disco (aislamiento
        // entre tests). Lo que importa aquí es que el dato ESTÉ fuera de la
        // memoria del módulo, que es lo único que sobrevive a un F5.
        const crudo = localStorage.getItem('mealfit_pantry_brands_cache_v1');
        expect(crudo, 'las marcas no se persistieron: en cada F5 vuelve el pop-in').toBeTruthy();
        expect(JSON.parse(crudo).value).toEqual(MAPA);
    });

    it('caducado no se sirve (el caso real: F5 con un cache de hace días)', () => {
        // Se escribe la entrada vencida a mano en disco en vez de pasar un TTL
        // negativo: en este módulo `ttl <= 0` significa «sin expiración» —
        // contrato de sus tres hermanos— y confundirlos probaría otra cosa.
        localStorage.setItem('mealfit_pantry_brands_cache_v1', JSON.stringify({
            value: MAPA, expiresAt: Date.now() - 1000,
        }));
        expect(getCachedBrands()).toBeUndefined();
        expect(localStorage.getItem('mealfit_pantry_brands_cache_v1'),
            'la entrada vencida debe barrerse, no quedarse ocupando disco').toBeNull();
    });

    it('ignora payloads que no son un mapa (fail-open, nunca reventar la Nevera)', () => {
        setCachedBrands(null);
        setCachedBrands([1, 2, 3]);
        expect(getCachedBrands()).toBeUndefined();
    });

    it('Pantry hidrata el estado desde el cache en el mount', () => {
        expect(SRC, 'brandCache debe arrancar del cache, no de {} vacío')
            .toMatch(/useState\(\s*\(\)\s*=>\s*getCachedBrands\(\)\s*\|\|\s*\{\}\s*\)/);
    });

    it('Pantry persiste lo que trae el prefetch (si no, el cache nunca se llena)', () => {
        const i = SRC.indexOf('/api/supermarket/match');
        expect(i).toBeGreaterThan(-1);
        // Ventana semántica y no un número de caracteres: desde el POST hasta
        // el `return p;` que cierra el updater que fusiona el lote. Un tamaño
        // fijo se queda corto en cuanto alguien añade tres líneas en medio.
        const fin = SRC.indexOf('return p;', i);
        expect(fin, 'no se encontró el updater del prefetch').toBeGreaterThan(i);
        const bloque = SRC.slice(i, fin);
        expect(bloque, 'el prefetch no guarda nada: el chip volvería a faltar en cada F5')
            .toMatch(/setCachedBrands\(/);
        // Y guarda el mapa YA FUSIONADO (`p`), no el `prev`: persistir el
        // anterior dejaría el disco siempre una tanda por detrás.
        expect(bloque).toMatch(/setCachedBrands\(p\)/);
    });
});
