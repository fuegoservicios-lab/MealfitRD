// [P1-COMPARTIR-DIA · 2026-09-23] La hoja: vista previa, compartir con imagen, WhatsApp, copiar y privacidad.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../utils/tarjetaDelDia', () => ({ dibujarTarjetaDelDia: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) }));
vi.mock('../config/platform', async (orig) => ({ ...(await orig()), isNativeApp: () => false }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import ShareDaySheet from '../components/dashboard/ShareDaySheet';

const props = {
    onClose: vi.fn(),
    consumed: { calories: 1205, protein: 73, carbs: 125, fats: 42, meals: [{ meal_name: 'Mangú con huevo', calories: 510 }], micros: null, microsCoverage: { con_datos: 0, total: 1 } },
    metas: { calories: 2050, protein: 134, carbs: 251, fats: 57 },
    microMetas: null,
};

beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x');
    globalThis.URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('ShareDaySheet', () => {
    it('pinta la vista previa y comparte imagen + texto', async () => {
        const share = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true, clipboard: { writeText: vi.fn() } });
        render(<ShareDaySheet {...props} />);
        await waitFor(() => expect(screen.getByRole('img', { name: /mi día/i })).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /^compartir$/i }));
        await waitFor(() => expect(share).toHaveBeenCalled());
        const arg = share.mock.calls[0][0];
        expect(arg.files).toHaveLength(1);
        expect(arg.text).toContain('Bioboros');
    });

    it('WhatsApp siempre disponible, con el texto codificado y sin las comidas por defecto', async () => {
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: vi.fn() } });
        render(<ShareDaySheet {...props} />);
        const wa = await screen.findByRole('link', { name: /whatsapp/i });
        expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
        expect(decodeURIComponent(wa.getAttribute('href'))).not.toContain('Mangú');
        fireEvent.click(screen.getByRole('checkbox', { name: /incluir lo que comí/i }));
        await waitFor(() => expect(decodeURIComponent(screen.getByRole('link', { name: /whatsapp/i }).getAttribute('href'))).toContain('Mangú'));
    });

    it('copiar texto usa el portapapeles', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText } });
        render(<ShareDaySheet {...props} />);
        fireEvent.click(await screen.findByRole('button', { name: /copiar texto/i }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('kcal')));
    });

    it('en la web sin hoja de archivos ofrece descargar la imagen', async () => {
        vi.stubGlobal('navigator', { ...navigator, share: undefined, canShare: undefined, clipboard: { writeText: vi.fn() } });
        render(<ShareDaySheet {...props} />);
        expect(await screen.findByRole('button', { name: /descargar imagen/i })).toBeInTheDocument();
    });
});

describe('TrackingProgress · compartir', () => {
    it('la tarjeta ofrece compartir solo con comidas y carga la hoja bajo demanda', () => {
        const src = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'dashboard', 'TrackingProgress.jsx'), 'utf8');
        expect(src).toContain("lazy(() => import('./ShareDaySheet'))");
        expect(src).toMatch(/_todaysMeals\.length > 0[\s\S]{0,200}aria-label=\{t\('Compartir mi día'\)\}/);
    });

    it('el botón de compartir es un cuadrado fijo con la piel de «Registrar comida», que sigue llenando la fila', () => {
        // P2-SCANBTN-PAIR-MOBILE pide re-anclar el reparto flex si vuelve un segundo botón a `.logButtons`: dos
        // botones que estiran desbordan la fila, y el `overflow: hidden` de la tarjeta decapita al segundo. Y como la
        // regla de `.scanBtn` es UNA (P1-SCAN-BTN-ACCENT), la piel de `.shareBtn` es una copia: que no se separe.
        const css = fs.readFileSync(path.resolve(__dirname, '..', 'components', 'dashboard', 'TrackingProgress.module.css'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '');
        const reglas = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), cuerpo: m[2] }));
        const primera = (sel) => reglas.find((r) => r.sel === sel)?.cuerpo ?? '';   // la de la base va antes que la del @media
        const decl = (cuerpo, prop) => new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);`).exec(cuerpo)?.[1].trim();

        const deCompartir = reglas.filter((r) => /\.shareBtn$/.test(r.sel)).map((r) => r.cuerpo);
        expect(deCompartir.length).toBeGreaterThan(0);
        for (const cuerpo of deCompartir) {
            expect(cuerpo).not.toMatch(/(?<!-)width\s*:\s*100%/);
            expect(cuerpo).not.toMatch(/(?<![\w-])flex(-grow)?\s*:\s*1\b/);
        }
        expect(decl(primera('.shareBtn'), 'width')).toBe('38px');

        const OSCURO = ':global(html[data-theme="dark"]) ';
        for (const [scan, share] of [
            ['.scanBtn', '.shareBtn'], ['.scanBtn svg', '.shareBtn svg'], ['.scanBtn:hover', '.shareBtn:hover'],
            [`${OSCURO}.scanBtn`, `${OSCURO}.shareBtn`], [`${OSCURO}.scanBtn svg`, `${OSCURO}.shareBtn svg`],
            [`${OSCURO}.scanBtn:hover`, `${OSCURO}.shareBtn:hover`],
        ]) {
            expect(primera(share), `falta la regla ${share}`).not.toBe('');
            for (const prop of ['border', 'border-color', 'border-radius', 'background', 'color']) {
                expect(decl(primera(share), prop), `${share} { ${prop} }`).toBe(decl(primera(scan), prop));
            }
        }
    });
});
