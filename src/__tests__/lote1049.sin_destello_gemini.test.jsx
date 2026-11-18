// [P1-PLAN-LOTE-1049] Fuera el destello de cuatro puntas de lucide (`Sparkles`, «parece el logo de Gemini», el dueño):
// en su lugar el brote de la marca con el capullo encendido (`BroteChispa`). Y el formato de la imagen dice qué es.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import BroteChispa from '../components/common/BroteChispa';

const SRC = path.resolve(__dirname, '..');
const todos = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : todos(p);
    return /\.(jsx?|tsx?)$/.test(e.name) ? [p] : [];
});

describe('[1049] sin el destello tipo Gemini', () => {
    it('ningún fichero de la app importa Sparkles ni WandSparkles de lucide', () => {
        const culpables = todos(SRC).filter((f) => {
            const s = fs.readFileSync(f, 'utf8');
            const imp = s.match(/import\s*\{[^}]*\}\s*from\s*['"]lucide-react['"]/g) || [];
            return imp.some((i) => /\b(Sparkles|Sparkle|WandSparkles)\b/.test(i));
        }).map((f) => path.relative(SRC, f));
        expect(culpables).toEqual([]);
    });

    it('BroteChispa se pinta como un icono de lucide: tamaño, trazo, currentColor y oculto al lector', () => {
        const { container } = render(<BroteChispa size={18} strokeWidth={2.5} className="x" />);
        const svg = container.querySelector('svg');
        expect(svg.getAttribute('width')).toBe('18');
        expect(svg.getAttribute('stroke-width')).toBe('2.5');
        expect(svg.getAttribute('stroke')).toBe('currentColor');
        expect(svg.getAttribute('aria-hidden')).toBe('true');
        expect(svg.getAttribute('class')).toBe('brote-chispa x');
    });

    it('los sitios que tenían el destello usan ahora el brote', () => {
        // [1090] la invitación de la foto de «Compartir» ya no lleva destello (una flecha): sale de la lista
        for (const f of ['components/dashboard/ScanMealModal.jsx',
            'components/home/DashboardShowcase.jsx', 'pages/FeaturesPage.jsx', 'pages/History.jsx']) {
            expect(fs.readFileSync(path.join(SRC, f), 'utf8'), f).toMatch(/BroteChispa/);
        }
    });
});

describe('[1049] el formato dice qué es', () => {
    it('Publicación es 4:5 y Historia 9:16, con su destino', () => {
        const s = fs.readFileSync(path.join(SRC, 'components/dashboard/ShareDaySheet.jsx'), 'utf8');
        expect(s).toContain("t('4:5 · chats y feed')");
        expect(s).toContain("t('9:16 · historias y estados')");
    });
});
