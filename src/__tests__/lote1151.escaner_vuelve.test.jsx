// [P1-PLAN-LOTE-1151 · 2026-11-21] El dueño, con capturas de «Escanear comida» abierto desde la cámara de «Registrar
// comida»: «mejora visualmente lo de escanear comida y quiero que la x le dé para atrás y me devuelva a donde estaba».
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

import ScanMealModal from '../components/dashboard/ScanMealModal';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
const matchMediaWith = (coarse) => vi.fn().mockImplementation((query) => ({
    matches: query === '(pointer: coarse)' ? coarse : false,
    media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
}));

beforeEach(() => { vi.clearAllMocks(); window.matchMedia = matchMediaWith(true); });

describe('lote 1151 · la X del escáner vuelve a «Registrar comida»', () => {
    it('abierto desde el componedor: la X vuelve (no cierra todo) y lo dice', () => {
        const onClose = vi.fn();
        const onBack = vi.fn();
        render(<ScanMealModal isOpen onClose={onClose} onBack={onBack} userId="u-1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Volver a Registrar comida' }));
        expect(onBack).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('abierto por su cuenta: la X sigue cerrando', () => {
        const onClose = vi.fn();
        render(<ScanMealModal isOpen onClose={onClose} userId="u-1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('deslizar, tocar fuera y Escape también vuelven; registrar sigue cerrando todo', () => {
        const s = leer('src/components/dashboard/ScanMealModal.jsx');
        expect(s).toContain('const salir = onBack || onClose;');
        expect(s).toContain('const hoja = useBottomSheet({ containerRef, bodyRef, onClose: salir, disabled: isBusy });');
        expect(s).toContain('        onClose: salir,\n        disableClose: guardando,');
        expect(s).toContain('if (e.target === e.currentTarget && !isBusy) salir();');
        expect(s.match(/onClose\(\);/g)?.length).toBe(2);   // solo los dos finales de «registrado»
    });

    it('los tres sitios que abren el escáner desde el componedor le pasan la vuelta, con la comida y el día', () => {
        const tp = leer('src/components/dashboard/TrackingProgress.jsx');
        expect(tp).toContain('onBack={handleScanBack}');
        expect(tp).toContain("setLogOpen(scanOpen && typeof scanOpen === 'object' ? scanOpen : true);");
        expect(tp).toContain('initialMealType={logOpen?.mealType || null} initialDaysAgo={logOpen?.daysAgo || 0}');
        const d = leer('src/pages/Dashboard.jsx');
        expect(d).toContain("onBack={() => { const d = scanMealOpen; setScanMealOpen(false); setLogMealOpen(d && typeof d === 'object' ? d : true); }}");
        expect(d).toContain('initialDaysAgo={logMealOpen.daysAgo || 0}');
        const h = leer('src/components/dashboard/DiaryHistory.jsx');
        expect(h).toContain('onBack={volverAlComponedor}');
        expect(h).toContain('initialMealType={registrando?.mealType || null} initialDaysAgo={registrando?.daysAgo ?? atras}');
    });
});

describe('lote 1151 · la primera pantalla, con un visor grande', () => {
    it('en el teléfono la cámara es el visor; la galería, la fila de debajo', () => {
        const { baseElement } = render(<ScanMealModal isOpen onClose={vi.fn()} userId="u-1" />);
        const heroes = baseElement.querySelectorAll('[class*="optionHero"]');
        expect(heroes).toHaveLength(1);
        expect(heroes[0].textContent).toContain('Usar la cámara');
    });

    it('en el PC el visor es la galería (la única acción)', () => {
        window.matchMedia = matchMediaWith(false);
        const { baseElement } = render(<ScanMealModal isOpen onClose={vi.fn()} userId="u-1" />);
        const heroes = baseElement.querySelectorAll('[class*="optionHero"]');
        expect(heroes).toHaveLength(1);
        expect(heroes[0].textContent).toContain('Elegir de galería');
    });

    it('lo que se mueve es transform/opacity y se apaga con reduced-motion', () => {
        const css = leer('src/components/dashboard/ScanMealModal.module.css');
        expect(css).toContain('@keyframes smLatido {\n    0% { transform: scale(0.92); opacity: 0.9; }');
        expect(css).toContain('.optionHero .optionIco::after { animation: none; opacity: 0.5; }');
    });
});
