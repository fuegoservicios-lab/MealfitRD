// [P1-PLAN-LOTE-418 · 2026-09-27] El modo libre ya no promete «No mira tu Nevera».
//
// Auditoría formulario→backend (otra sesión), verificada: la frase era literal «mientras el inventario se inyecte SOLO en
// modo pantry», y su propio comentario pedía cambiarla el día que el modo libre lo consultara. Ese día llegó hace tiempo:
// los bloques 2+ de CUALQUIER plan refrescan la Nevera en vivo (`cron_tasks._refresh_chunk_pantry`, sin mirar el modo),
// el cambio de plato la usa por defecto y «Actualizar platos» pide 10 alimentos. Solo el PRIMER bloque la ignora (la lista
// nace del plan). La tarjeta dice ahora lo que es cierto desde el primer día: elige libre y te da la lista para comprarlo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const VIEJO = 'Diseña tu plan libremente, con lo que mejor encaje en tus metas. No mira tu Nevera.';
const NUEVO = 'Diseña tu plan libremente, con lo que mejor encaje en tus metas, y te da la lista para comprarlo.';

describe('[418] la tarjeta del modo libre no niega la Nevera', () => {
    it('QPlanSource usa el texto nuevo y ya no dice «No mira tu Nevera»', () => {
        const src = leer('src/components/assessment/questions/QPlanSource.jsx');
        expect(src).toContain(`t('${NUEVO}')`);
        expect(src).not.toMatch(/t\('[^']*No mira tu Nevera/);
    });

    it('los cuatro catálogos traducen el nuevo y no guardan el viejo', () => {
        for (const loc of ['en-US', 'pt-BR', 'fr-FR', 'it-IT']) {
            const cat = JSON.parse(leer(`src/i18n/locales/${loc}.json`));
            expect(cat[VIEJO], loc).toBeUndefined();
            expect(cat[NUEVO], loc).toBeTruthy();
        }
    });
});
