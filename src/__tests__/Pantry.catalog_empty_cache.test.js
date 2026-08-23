/**
 * [P1-PANTRY-CATALOG-EMPTY-CACHE · 2026-08-22] En el iPhone (PWA) «Pollo» o «Arroz» no
 * autocompletaban NUNCA; en PC, «No encontramos» salía durante segundos y luego aparecían.
 *
 * Tres causas en el cliente (el endpoint tarda 0,6 s y devuelve 347 filas):
 *  1. `masterListLoaded = Boolean(getCachedMasterList())` — `Boolean([])` es true. Un
 *     fetch que volvió sin items dejaba la PWA (que vive en memoria días) sin catálogo
 *     y sin volver a pedirlo.
 *  2. Nada pedía el catálogo al abrir el buscador: solo el Promise.all de fetchData.
 *  3. El estado vacío no distinguía «cargando» de «no existe».
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { setCachedMasterList, getCachedMasterList, invalidateMasterListCache } from '../utils/pantryCache';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf-8');

describe('[P1-PANTRY-CATALOG-EMPTY-CACHE] pantryCache', () => {
    it('un catálogo vacío NO se cachea (vacío = no cargado)', () => {
        invalidateMasterListCache();
        setCachedMasterList([]);
        expect(getCachedMasterList()).toBeUndefined();
        setCachedMasterList([{ id: '1', name: 'Pollo' }]);
        expect(getCachedMasterList()).toHaveLength(1);
        invalidateMasterListCache();
    });
});

describe('[P1-PANTRY-CATALOG-EMPTY-CACHE] Pantry.jsx', () => {
    const src = read('pages/Pantry.jsx');
    it('«cargado» exige filas, no un array', () => {
        expect(src).toMatch(/masterListLoaded = useRef\(\(getCachedMasterList\(\) \|\| \[\]\)\.length > 0\)/);
        expect(src).not.toMatch(/useRef\(Boolean\(getCachedMasterList\(\)\)\)/);
    });
    it('el buscador pide el catálogo al abrirse y al teclear (ensureCatalog)', () => {
        expect(src).toMatch(/if \(showAddMenu\) ensureCatalog\(\)/);
        expect(src).toMatch(/if \(addItemSearch\.trim\(\)\) ensureCatalog\(\)/);
        // y no vuelve a marcar cargado con una lista vacía
        expect(src).toMatch(/if \(rows\.length > 0\) \{\s*setMasterList\(rows\)/);
    });
    it('«No encontramos» solo con catálogo cargado; mientras baja, «Cargando catálogo…»', () => {
        const i = src.indexOf("t('No encontramos \"{consulta}\"'");
        expect(i).toBeGreaterThan(0);
        const antes = src.slice(i - 700, i);
        expect(antes).toMatch(/!catalogLoading && masterList\.length > 0 && \(/);
        expect(src).toMatch(/t\('Cargando catálogo…'\)/);
    });
});

describe('[P1-PANTRY-SHEET-NOTCH] la hoja «Añade a tu Nevera» no sube bajo el reloj con el teclado', () => {
    it('con teclado (kbInset > 0) el maxHeight descuenta env(safe-area-inset-top)', () => {
        const src = read('pages/Pantry.jsx');
        const i = src.indexOf('maxHeight: kbInset > 0');
        expect(i).toBeGreaterThan(0);
        expect(src.slice(i, i + 200)).toMatch(/calc\(\$\{Math\.max\(300, vvHeight - 10\)\}px - env\(safe-area-inset-top, 0px\)/);
    });
});
