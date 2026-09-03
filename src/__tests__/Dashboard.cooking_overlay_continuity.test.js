// [P2-COOKING-OVERLAY-CONTINUITY · 2026-09-03] El overlay «cocinando» de la meal-card
// «desaparecía unos milisegundos» a mitad del swap. Causa: la card lleva key={meal.name};
// cuando el plato nuevo llega (antes del persist + recálculo, con el overlay aún activo)
// React reemplaza la card y el overlay se vuelve a montar: fade-in desde opacity 0, etapa
// de vuelta a la primera, ola y barra saltando de fase. El reloj de arranque vive ahora en
// la card padre (ref por índice) y el overlay deriva de él su etapa, su fase y si anima
// la entrada. Parser-based: la regla vive en el JSX y en el CSS embebido.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = readFileSync(resolve(process.cwd(), 'src/pages/Dashboard.jsx'), 'utf8')
    .split(String.fromCharCode(13)).join('');

function cssBlock(selectorLine) {
    const i = SRC.indexOf(selectorLine);
    expect(i, selectorLine).toBeGreaterThan(0);
    return SRC.slice(i, SRC.indexOf('}', i));
}

describe('overlay cocinando: continuidad a través del remount de la card', () => {
    it('el reloj de arranque vive en la card padre, por índice, y se pasa al overlay', () => {
        expect(SRC).toContain('const _cookingStartRef = useRef({});');
        expect(SRC).toContain('if (!m[index]) m[index] = Date.now();');
        expect(SRC).toContain("if (!on) { if (m[index]) delete m[index]; return null; }");
        const i = SRC.indexOf('P2-DAYREGEN-OVERLAY-SCOPE] el overlay del día solo en SU tab');
        expect(i).toBeGreaterThan(0);
        const gate = SRC.slice(i, i + 900);
        expect(gate).toContain('const _cooking = regeneratingId === index || (isDayUpdating');
        expect(gate).toContain('dayRegenIndex == null || dayRegenIndex === activeDayIndex');
        expect(gate).toContain('const _startedAt = _cookingStartedAt(index, _cooking);');
        expect(gate).toContain('startedAt={_startedAt}');
    });

    it('el overlay fija UNA vez por montaje lo transcurrido y arranca en su etapa', () => {
        const i = SRC.indexOf('function MealCookingOverlay({');
        const body = SRC.slice(i, SRC.indexOf('\n}\n', i));
        expect(body).toContain("startedAt = null");
        // reloj de montaje en un inicializador perezoso de useState (el lint de pureza del
        // React Compiler rechaza Date.now() y lecturas de ref en el render)
        expect(body).toContain('const [_mount] = useState(() => {');
        expect(body).toContain('const _elapsed = startedAt ? Math.max(0, Date.now() - startedAt) : 0;');
        expect(body).toContain('return { elapsed: _elapsed, entering: _elapsed < 350 };');
        expect(body).toContain('useState(() => Math.floor(_mount.elapsed / 4000))');
        expect(body).not.toContain('_mount.current');
        // el primer cambio de etapa se alinea al reloj compartido
        expect(body).toContain('const _rest = 4000 - (_mount.elapsed % 4000);');
        // fase compartida y entrada condicionada
        expect(body).toContain("style={{ '--cook-elapsed': `-${_mount.elapsed}ms` }}");
        expect(body).toContain("(_mount.entering ? ' is-entering' : '')");
        // el texto anima al entrar o al cambiar de etapa, no en un remount con la misma
        expect(body).toContain('const _textAnim = _mount.entering || label !== _firstLabel;');
        expect(body).toContain("(_textAnim ? ' is-new' : '')");
    });

    it('CSS: fade-in solo al entrar, fase por animation-delay, texto sin apagón', () => {
        expect(cssBlock('.meal-cooking-overlay {')).not.toContain('cookFadeIn');
        expect(SRC).toContain('.meal-cooking-overlay.is-entering { animation: cookFadeIn 0.25s ease-out; }');
        const delays = SRC.split('animation-delay: var(--cook-elapsed, 0ms);').length - 1;
        expect(delays, 'ola, barra, chip e icono').toBe(4);
        expect(cssBlock('.meal-cooking-text {')).not.toContain('animation:');
        expect(SRC).toContain('.meal-cooking-text.is-new { animation: cookTextIn 0.4s ease-out; }');
        expect(cssBlock('@keyframes cookTextIn {')).toContain('from { opacity: 0.35;');
    });
});
