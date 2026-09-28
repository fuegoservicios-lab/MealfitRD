// [P1-PLAN-LOTE-719 · 2026-09-28] Configuración → «Tarjeta de hidratación» cuando la lectura falla.
//
// Si `GET /api/user/preferences/water-tracker` fallaba, el interruptor se pintaba ENCENDIDO a secas: quien lo había
// apagado lo veía encendido cada vez que la red fallaba. Ahora cae al último valor que confirmó el servidor (la caché
// que el propio panel escribe tras cada lectura y cada cambio); sin caché, encendido, como el backend para perfiles
// legacy. La caché muere con la sesión (`_clearUserScopedCaches`), así que no se hereda entre usuarios.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const leer = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

describe('[P1-PLAN-LOTE-719] hidratación: lectura fallida', () => {
    const settings = leer('src/pages/Settings.jsx');
    const a = settings.indexOf('const fetchWaterTrackerState = async () => {');
    const cuerpo = settings.slice(a, settings.indexOf('fetchWaterTrackerState();', a));

    it('las dos ramas de fallo leen el último valor confirmado, no un true fijo', () => {
        expect(a).toBeGreaterThan(-1);
        expect(cuerpo).not.toMatch(/setWaterTrackerEnabled\(true\)/);
        const lecturas = cuerpo.match(/safeLocalStorageGet\('mealfit_water_tracker_enabled', 'true'\) !== 'false'/g) || [];
        expect(lecturas).toHaveLength(2);
    });

    it('la caché se borra al cerrar sesión', () => {
        expect(leer('src/context/AssessmentContext.jsx')).toMatch(/safeLocalStorageRemove\('mealfit_water_tracker_enabled'\)/);
    });
});
