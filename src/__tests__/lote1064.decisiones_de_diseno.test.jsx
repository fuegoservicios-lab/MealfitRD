/**
 * [P1-PLAN-LOTE-1064 · 2026-11-17] Las cuatro decisiones de diseño del dueño (auditoría docs/diseno/auditoria_2026-11-17.md):
 * 1. «Cambiar plato» secundario neutro (antes naranja sólido en oscuro) y en frase normal.
 * 2. Un botón común (`components/ui/Button`), principal ÍNDIGO SÓLIDO; «Actualizar platos» sin su degradado violeta.
 * 3. Los emojis que hacían de iconos → lucide (chat, avisos, modal de pago).
 * 4. Al pulsar, todos los controles encogen a 0,97.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Button from '../components/ui/Button';
import IconoDelChat from '../components/agent/IconoDelChat';
import { iconoDeAviso } from '../utils/iconoDeAviso';

const leer = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');
const DASH = leer('src/pages/Dashboard.jsx');
const CSS_BTN = leer('src/components/ui/Button.module.css');

describe('[1064] botón común', () => {
    it('pinta la variante pedida y cae a principal si no existe', () => {
        render(<><Button variant="secondary">A</Button><Button variant="rara">B</Button></>);
        expect(screen.getByText('A').getAttribute('data-variant')).toBe('secondary');
        expect(screen.getByText('B').getAttribute('data-variant')).toBe('primary');
        expect(screen.getByText('A').getAttribute('type')).toBe('button');
    });
    it('el principal es índigo sólido y al pulsar encoge a 0,97; al pasar el ratón no se mueve', () => {
        expect(CSS_BTN).toMatch(/\.primary\s*\{\s*background:\s*var\(--primary-fill\)/);
        expect(CSS_BTN).not.toMatch(/gradient/);
        expect(CSS_BTN).toMatch(/:active:not\(:disabled\)\s*\{\s*transform:\s*scale\(0\.97\)/);
        for (const m of CSS_BTN.matchAll(/:hover[^{]*\{([^}]*)\}/g)) expect(m[1]).not.toMatch(/transform/);
    });
});

describe('[1064] Cambiar plato y Actualizar platos', () => {
    it('«Cambiar plato» usa el secundario y ya no lleva el naranja', () => {
        const i = DASH.indexOf('data-testid="swap-label"');
        const bloque = DASH.slice(DASH.lastIndexOf('<Button', i), i);
        expect(bloque).toContain('variant="secondary"');
        expect(bloque).not.toMatch(/#C2410C|#9A3412|#FFF7ED|#FED7AA|#EA580C/i);
        expect(DASH).not.toContain("t('Cambiar Plato')");
    });
    it('«Actualizar platos» ya no es un degradado violeta propio', () => {
        expect(DASH).not.toContain("linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)");
        expect(DASH).not.toContain("linear-gradient(135deg, #3B82F6 0%, #06B6D4 100%)");
    });
});

describe('[1064] iconos lucide en vez de emojis', () => {
    const EMOJI = /icon:\s*['"]\p{Extended_Pictographic}/u;
    it.each([
        'src/pages/AgentPage.jsx', 'src/pages/Dashboard.jsx', 'src/pages/Pantry.jsx',
        'src/context/AssessmentContext.jsx', 'src/components/dashboard/PaymentModal.jsx',
    ])('%s no usa emojis como icono', (f) => {
        expect(EMOJI.test(leer(f).replace(/icon: '✓'/g, ''))).toBe(false);
    });
    it('el error del chat ya no pega un emoji al texto', () => {
        expect(leer('src/pages/AgentPage.jsx')).not.toContain('content: `${entry.icon} ${entry.text}`');
    });
    it('los nombres pintan un svg y un nombre desconocido no pinta nada', () => {
        const { container } = render(<><IconoDelChat nombre="sin_red" /><IconoDelChat nombre="nada" /></>);
        expect(container.querySelectorAll('svg')).toHaveLength(1);
        expect(iconoDeAviso('nevera')).toBeTruthy();
        expect(iconoDeAviso('nada')).toBeUndefined();
    });
});

describe('[1064] al pulsar, todos igual', () => {
    it('ningún botón encoge distinto de 0,97 (las tarjetas grandes conservan su encogido mínimo)', () => {
        const ficheros = [
            'src/components/agent/AttachmentSourceSheet.css', 'src/components/common/DudasDeLaFoto.module.css',
            'src/components/dashboard/BottomTabBar.module.css', 'src/components/dashboard/DiaryHistory.module.css',
            'src/components/dashboard/SemanaEnProgreso.module.css', 'src/components/dashboard/WaterTracker.module.css',
            'src/components/layout/Header.module.css', 'src/pages/History.module.css', 'src/pages/Pantry.fridge.module.css',
            'src/index.css', 'src/pages/AgentPage.jsx', 'src/components/plan/RenewalCheckinModal.jsx',
        ];
        const malos = [];
        for (const f of ficheros) {
            for (const m of leer(f).matchAll(/([^{}]*:active[^{}]*)\{([^{}]*)\}/g)) {
                const s = m[2].match(/scale\(\s*([0-9.]+)\s*\)/);
                if (s && Number(s[1]) !== 0.97) malos.push(`${f}: ${m[1].trim().split('\n').pop()} → ${s[1]}`);
            }
        }
        expect(malos).toEqual([]);
        expect(leer('src/components/dashboard/SemanaEnProgreso.jsx')).toContain('whileTap={futuro ? undefined : { scale: 0.97 }}');
        expect(leer('src/index.css')).toMatch(/:where\(button:not\(:disabled\):active/);
    });
});
