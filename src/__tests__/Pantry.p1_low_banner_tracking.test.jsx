/**
 * [P1-PANTRY-LOW-BANNER-TRACKING · 2026-08-14] El banner de «nevera baja» no
 * promete compras automáticas cuando la generación de planes está apagada.
 *
 * EL BUG, que el dueño confirmó con captura. Con la Nevera bajo mínimos y el modo
 * contador activo, el banner ámbar decía:
 *
 *   «Tu nevera está baja (tienes 0 alimentos). Te recomendamos tener ~20 para que
 *    tus planes aprovechen mejor tu nevera. Mientras tanto, tus próximas listas de
 *    mantenimiento comprarán lo que falte automáticamente.»
 *
 * Ninguna de esas dos promesas ocurre en modo contador: las listas de
 * mantenimiento las produce el `_chunk_worker`, cuyo pickup `PICKUP_GATE_SQL`
 * cierra con `AND NOT EXISTS (… plan_mode='tracking')`. El usuario deja la nevera
 * baja confiando en que la app repone, y la app no repone.
 *
 * `Pantry.jsx` no leía el modo en ninguna de sus ~3.600 líneas (0 menciones), y la
 * Nevera sigue en la nav del contador a propósito — es una de sus tres pantallas.
 *
 * DOS SHELLS, DOS TEXTOS DISTINTOS. El escritorio llevaba las dos frases; el móvil
 * solo la primera («para que tus planes aprovechen mejor tu nevera»), igual de
 * falsa. Arreglar solo el de la captura habría dejado el otro vivo — por eso el
 * copy se extrae a UN helper y los dos shells lo consumen: es la única forma de
 * que no vuelvan a driftear.
 *
 * LO QUE NO SE HACE: esconder el banner. El hecho —tu nevera está baja— es
 * verdad en los dos modos y sigue siendo útil en el contador (menos que registrar,
 * menos que escanear). Lo que se cae es la RAZÓN prestada al plan y la promesa de
 * reposición automática.
 */
import { describe, it, expect } from 'vitest';
import { textoNeveraBaja } from '../pages/pantryLowBannerCopy';

const ESTADO = { meaningful_count: 0, recommended_target: 20 };

describe('[P1-PANTRY-LOW-BANNER-TRACKING] el copy del banner', () => {
    it('en modo contador NO promete listas ni compras automáticas', () => {
        const t = textoNeveraBaja(ESTADO, true);
        expect(t).not.toMatch(/lista/i);
        expect(t).not.toMatch(/autom/i);
        expect(t).not.toMatch(/comprar/i);
    });

    it('en modo contador NO presta la razón al plan', () => {
        // «para que tus planes aprovechen mejor tu nevera» es la mitad que
        // sobrevivía en el shell móvil.
        const t = textoNeveraBaja(ESTADO, true);
        expect(t).not.toMatch(/plan/i);
    });

    it('en modo contador sigue diciendo el HECHO, que sí es verdad', () => {
        const t = textoNeveraBaja(ESTADO, true);
        expect(t).toMatch(/0/);
        expect(t.length).toBeGreaterThan(30);
    });

    it('con el plan activo conserva el copy de siempre, promesa incluida', () => {
        const t = textoNeveraBaja(ESTADO, false);
        expect(t).toMatch(/listas de mantenimiento/i);
        expect(t).toMatch(/autom/i);
        expect(t).toMatch(/planes/i);
    });

    it('respeta el objetivo recomendado que manda el backend', () => {
        expect(textoNeveraBaja({ meaningful_count: 3, recommended_target: 14 }, false)).toMatch(/14/);
        // Sin dato del backend, el fallback histórico.
        expect(textoNeveraBaja({ meaningful_count: 3 }, false)).toMatch(/20/);
    });

    it('singulariza «alimento» — un contador que dice «1 alimentos» se lee a máquina', () => {
        expect(textoNeveraBaja({ meaningful_count: 1 }, true)).toMatch(/1 alimento\b/);
        expect(textoNeveraBaja({ meaningful_count: 2 }, true)).toMatch(/2 alimentos\b/);
    });
});

describe('[P1-PANTRY-LOW-BANNER-TRACKING] los dos shells', () => {
    it('ninguno de los dos escribe el copy a mano', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const src = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Pantry.jsx'), 'utf-8');
        const codigo = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
        expect(codigo).not.toMatch(/listas de mantenimiento/i);
        expect(codigo).not.toMatch(/aprovechen mejor tu nevera/i);
        // Y ambos shells consumen el helper: dos call sites, no uno.
        expect((codigo.match(/textoNeveraBaja\(/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    it('Pantry consulta el SSOT del modo, no reimplementa el suyo', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const src = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Pantry.jsx'), 'utf-8');
        expect(src).toMatch(/isTrackingMode/);
    });
});
