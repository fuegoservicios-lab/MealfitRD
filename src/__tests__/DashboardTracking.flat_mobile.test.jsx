// [P1-PLAN-LOTE-88 · 2026-09-17] Sin «tarjeticas» en el teléfono (contador de seguimiento). El dueño, con captura a
// 392px: «quitamos eso de las tarjeticas en móviles… quiero que sea lo más cómodo visualmente». Medido en un arnés:
// shell 13,6 + página 14,4 + borde 1 + relleno 18,4 = 47,4px perdidos por lado; las barras usaban 297 de 392px y
// ahora 360. El aplanado es OPT-IN (`flatOnMobile`): el dashboard de plan comparte estas tarjetas y no cambia.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8').split(String.fromCharCode(13)).join('');

// Los comentarios del CSS nombran las clases; las reglas se buscan sin ellos.
const sinComentarios = (css) => {
    let out = '';
    let i = 0;
    for (;;) {
        const a = css.indexOf('/*', i);
        if (a < 0) return out + css.slice(i);
        out += css.slice(i, a);
        const b = css.indexOf('*/', a + 2);
        if (b < 0) return out;
        i = b + 2;
    }
};

// El bloque del TELÉFONO que contiene el aplanado: el ÚLTIMO `@media (max-width: 768px)` del fichero.
// [P1-PLAN-LOTE-92 · 2026-09-17] Era el de 480px y no casaba en el teléfono del dueño (con el zoom del sitio por
// debajo del 100 %, su viewport CSS pasa de 480). El corte es ahora el mismo que usa el armazón para el teléfono.
const bloquePlano = (rel) => {
    const css = sinComentarios(src(rel));
    const i = css.lastIndexOf('@media (max-width: 768px) {');
    expect(i).toBeGreaterThan(-1);
    // Nada del aplanado vive fuera de ese bloque: en tableta y escritorio las tarjetas siguen siendo tarjetas.
    expect(css.slice(0, i)).not.toContain('flatMobile');
    return css.slice(i).split(/\s+/).join(' ');
};

describe('contador sin tarjeticas en el teléfono', () => {
    it('solo el contador pide las secciones planas; el dashboard de plan no', () => {
        const tracking = src('src/components/dashboard/DashboardTracking.jsx');
        expect(tracking).toContain('<TrackingProgress planData={metasMacros} userId={userProfile?.id} flatOnMobile />');
        expect(tracking).toContain('<MicrosTracker userId={userProfile?.id} flatOnMobile />');
        expect(tracking).toContain("|| 'guest'} flatOnMobile />");
        // [P1-PLAN-LOTE-103] el dashboard del plan ya no monta el contador: vive en la pestaña «Progreso»
        const dash = src('src/pages/Dashboard.jsx');
        expect(dash).not.toContain('flatOnMobile');
        expect(dash).not.toContain('<TrackingProgress');
        expect(dash).not.toContain('<WaterTracker');
        expect(src('src/pages/ProgressPage.jsx')).toContain('<DashboardTracking modo="plan" />');
        // opt-in: sin la prop, la clase no se añade
        expect(src('src/components/dashboard/TrackingProgress.jsx')).toContain('flatOnMobile = false');
        expect(src('src/components/dashboard/WaterTracker.jsx')).toContain('flatOnMobile = false');
    });

    it('plano = sin borde, fondo, sombra ni relleno, y también en oscuro', () => {
        const tp = bloquePlano('src/components/dashboard/TrackingProgress.module.css');
        // la regla oscura comparte selector: `html[data-theme="dark"] .card` (0,2,1) le ganaría a `.card.flatMobile` (0,2,0)
        expect(tp).toContain('.card.flatMobile, :global(html[data-theme="dark"]) .card.flatMobile {');
        for (const decl of ['padding: 0;', 'border: 0;', 'border-radius: 0;', 'background: none;', 'box-shadow: none;', 'overflow: visible;']) {
            expect(tp).toContain(decl);
        }
        const agua = bloquePlano('src/components/dashboard/WaterTracker.module.css');
        for (const decl of ['background: none;', 'border: 0;', 'box-shadow: none;', '.card.flatMobile .inner { padding: 0; gap: 0; }']) {
            expect(agua).toContain(decl);
        }
        // sin marco, la sección se presenta por su título: la cabecera va antes del vaso
        expect(agua).toContain('.card.flatMobile .body { display: contents; }');
        expect(agua).toContain('.card.flatMobile .head { order: -1; }');
    });

    it('la página: canal de 16px, UNA línea entre secciones y la invitación sigue siendo tarjeta', () => {
        const pagina = bloquePlano('src/components/dashboard/DashboardTracking.module.css');
        expect(pagina).toContain('.page { padding: 0.35rem 0.15rem 0.5rem; gap: 1.5rem; }');
        // `:not(:empty)`: con la hidratación apagada el componente devuelve null y la línea colgaría sobre nada
        expect(pagina).toContain('.sideCol:not(:empty) { border-top: 1px solid var(--border,');
        const base = sinComentarios(src('src/components/dashboard/DashboardTracking.module.css'));
        const card = base.slice(base.indexOf('.turnOnCard {'), base.indexOf('}', base.indexOf('.turnOnCard {')));
        expect(card).toContain('border: 1px solid');
        expect(pagina).not.toContain('border: 0');
    });
});
