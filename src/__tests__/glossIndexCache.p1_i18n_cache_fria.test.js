/**
 * [P1-I18N-GLOSS-INERTE-EN-CARGA-NUEVA-POR-CACHE-FRIA · 2026-08-23] El respaldo del gloss
 * leía una caché que la pantalla del PDF nunca llena.
 *
 * `P3-I18N-PDF-GLOSS-PLANES-VIEJOS` añadió un respaldo: si el ítem de la lista no trae
 * `display_name_en` embebido, el gloss se resuelve contra el catálogo cacheado. Pero
 * `getCachedMasterList()` era SOLO memoria y la llenaban cinco sitios —Pantry,
 * QPantryBuilder, QStapleFoods, StapleFoodsPanel, LogMealModal— y **ninguno es el
 * Dashboard**, donde vive el botón de descarga. Quien abre la app (o recarga) y descarga
 * su lista sin pasar antes por la Nevera recibía `buildGlossIndex([])`: un índice vacío.
 *
 * MEDIDO contra los 3.605 ítems de producción: **2.742 (76,1 %) dependen exclusivamente
 * de ese índice**. No era un caso raro; era el camino por defecto. El comentario del cierre
 * lo llegaba a decir —«vacío si el catálogo aún no está cacheado: el gloss cae al nombre
 * español»— o sea que se vio y no se midió.
 *
 * EL DISEÑO, Y POR QUÉ NO ES «PERSISTIR EL CATÁLOGO COMO EL INVENTARIO»: medido contra
 * Neon, el catálogo entero son **567 KB** (54 columnas × 347 filas); el índice del gloss
 * —solo `name` + `name_en`— son **17 KB**. `localStorage` tiene cuota y la comparte toda la
 * app, así que se persiste el ÍNDICE, no el catálogo. Y como el índice sirve a un fichero
 * que el usuario se lleva al súper, se publica desde donde ya se tiene el catálogo (los
 * cinco sitios) y se lee desde el Dashboard.
 *
 * NO se toca `getCachedMasterList`: los cinco consumidores siguen usándola igual.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const CATALOGO = [
    { name: 'Habichuelas rojas', name_en: 'Red beans', kcal: 330, category: 'legumbre' },
    { name: 'Plátano verde', name_en: 'Green plantain', kcal: 120 },
    { name: 'Cilantro', name_en: 'Cilantro' },
    { name: 'Sin gloss', name_en: '' },
];

describe('[P1-I18N-GLOSS-INERTE-EN-CARGA-NUEVA-POR-CACHE-FRIA]', () => {
    beforeEach(() => {
        vi.resetModules();
        localStorage.clear();
    });

    it('EL CASO: tras recargar la app, el indice del gloss sigue disponible', async () => {
        // Sesión 1: alguien pasó por la Nevera y el catálogo se cacheó.
        const s1 = await import('../utils/pantryCache');
        s1.setCachedMasterList(CATALOGO);

        // Sesión 2: recarga. El módulo se re-evalúa y la memoria arranca vacía — que es lo
        // que le pasa al Dashboard en cualquier carga nueva.
        vi.resetModules();
        const s2 = await import('../utils/pantryCache');
        expect(s2.getCachedMasterList(), 'control: la memoria SÍ se perdió con el reload').toBeUndefined();

        const idx = s2.getCachedGlossIndex();
        expect(idx, 'el índice del gloss no sobrevivió al reload: el PDF sale en español').toBeTruthy();
        expect(idx.get('habichuelas rojas')).toBe('Red beans');
        expect(idx.get('platano verde'), 'se indexa sin acentos, igual que buildGlossIndex').toBe('Green plantain');
    });

    it('el indice persistido lleva SOLO name + name_en, nunca el catalogo entero', async () => {
        const m = await import('../utils/pantryCache');
        m.setCachedMasterList(CATALOGO);
        const raw = localStorage.getItem(m.GLOSS_INDEX_LS_KEY);
        expect(raw, 'no se persistió nada').toBeTruthy();
        expect(raw, 'se persistió el catálogo entero: 567 KB en una cuota compartida').not.toContain('kcal');
        expect(raw).not.toContain('category');
    });

    it('una fila sin name_en no entra en el indice', async () => {
        const m = await import('../utils/pantryCache');
        m.setCachedMasterList(CATALOGO);
        expect(m.getCachedGlossIndex().has('sin gloss')).toBe(false);
    });

    it('sin nada cacheado devuelve un Map vacio, no revienta', async () => {
        const m = await import('../utils/pantryCache');
        const idx = m.getCachedGlossIndex();
        expect(idx instanceof Map).toBe(true);
        expect(idx.size).toBe(0);
    });

    it('un indice caducado no se sirve', async () => {
        const m = await import('../utils/pantryCache');
        m.setCachedMasterList(CATALOGO, 1);            // TTL de 1 ms
        await new Promise((r) => setTimeout(r, 5));
        vi.resetModules();
        const m2 = await import('../utils/pantryCache');
        expect(m2.getCachedGlossIndex().size, 'se sirvió un índice caducado').toBe(0);
    });

    it('localStorage roto no tumba nada (iOS Safari en privado)', async () => {
        const m = await import('../utils/pantryCache');
        localStorage.setItem(m.GLOSS_INDEX_LS_KEY, '{no es json');
        expect(() => m.getCachedGlossIndex()).not.toThrow();
        expect(m.getCachedGlossIndex().size).toBe(0);
    });
});

// ---------------------------------------------------------------------------------
// El CONSUMIDOR. De nada sirve persistir el índice si el Dashboard sigue leyendo sólo la
// memoria. Se ancla por PROPIEDAD: en la función que genera el PDF, el índice del gloss
// tiene que poder venir de `getCachedGlossIndex` cuando la memoria está fría.
// ---------------------------------------------------------------------------------
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

describe('[P1-I18N-GLOSS-INERTE-EN-CARGA-NUEVA-POR-CACHE-FRIA] el Dashboard lo consume', () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dirname, '..', 'pages', 'Dashboard.jsx'), 'utf-8');

    it('la construccion del indice del PDF cae al persistido cuando la memoria esta fria', () => {
        // Se localiza por ESTRUCTURA (la única asignación de `_glossIdx`), no por el copy.
        const i = src.indexOf('const _glossIdx');
        expect(i, 'desapareció la construcción del índice del gloss del PDF').toBeGreaterThan(0);
        const ventana = src.slice(i, src.indexOf(';', i) + 1);
        expect(ventana, 'el respaldo persistido no se consulta: en carga nueva el PDF sale en español')
            .toMatch(/getCachedGlossIndex\s*\(/);
        expect(ventana, 'la memoria, cuando existe, sigue mandando (tiene el catálogo entero y fresco)')
            .toMatch(/buildGlossIndex\s*\(/);
    });
});
