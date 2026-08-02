// [P1-PANTRY-STRICT-CONSENT · 2026-08-02] Modal "Tu Nevera no alcanza" — el punto de
// consentimiento del flujo "Nevera estricta + consentimiento": nombra el/los ingrediente(s)
// que el chef necesita fuera de la Nevera real (nombre + cantidad + precio RD$ estimado) y
// ofrece 3 salidas honestas. Componente self-contained (sin AssessmentContext/auth), así que
// a diferencia de la mayoría de los tests parser-based de este directorio, este SÍ monta con
// @testing-library/react (mismo patrón que PantryScanButton.p1_pantry_scan_pc_upload.test.jsx).
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PantryConsentModal from '../components/common/PantryConsentModal';

const MISSING = [
    { name: 'Yuca', qty_needed: 150, unit: 'g', est_price_rd: 107 },
];

describe('P1-PANTRY-STRICT-CONSENT · PantryConsentModal', () => {
    it('no renderiza nada cuando open=false', () => {
        const { container } = render(<PantryConsentModal open={false} missing={MISSING} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renderiza el nombre, cantidad y precio del ingrediente faltante', () => {
        render(<PantryConsentModal open missing={MISSING} message="El chef necesita Yuca 150 g (~RD$107) — no está en tu Nevera." />);
        expect(screen.getByText('Yuca')).toBeInTheDocument();
        expect(screen.getAllByText(/150 g/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/RD\$107/).length).toBeGreaterThan(0);
    });

    it('omite el precio honestamente cuando est_price_rd es null (sin inventar un número)', () => {
        render(<PantryConsentModal open missing={[{ name: 'Ñame', qty_needed: 200, unit: 'g', est_price_rd: null }]} />);
        expect(screen.getByText('precio no disp.')).toBeInTheDocument();
    });

    it('"Añadir a la lista y continuar" invoca onConfirm', async () => {
        const onConfirm = vi.fn();
        const user = userEvent.setup();
        render(<PantryConsentModal open missing={MISSING} onConfirm={onConfirm} />);
        await user.click(screen.getByRole('button', { name: /Añadir a la lista y continuar/i }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('"Buscar otra opción" invoca onRetry (no onConfirm)', async () => {
        const onConfirm = vi.fn();
        const onRetry = vi.fn();
        const user = userEvent.setup();
        render(<PantryConsentModal open missing={MISSING} onConfirm={onConfirm} onRetry={onRetry} />);
        await user.click(screen.getByRole('button', { name: /Buscar otra opción/i }));
        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('"Cancelar" y la X invocan onClose', async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(<PantryConsentModal open missing={MISSING} onClose={onClose} />);
        await user.click(screen.getByRole('button', { name: /^Cancelar$/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
        await user.click(screen.getByRole('button', { name: /Cerrar/i }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('busy=true deshabilita los 3 botones de acción — cero doble-tap durante la llamada', () => {
        render(<PantryConsentModal open missing={MISSING} busy />);
        expect(screen.getByRole('button', { name: /Añadiendo…/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /Buscar otra opción/i })).toBeDisabled();
        expect(screen.getByRole('button', { name: /^Cancelar$/i })).toBeDisabled();
    });

    it('busy=true NO invoca onConfirm/onRetry/onClose al hacer click (guard interno, no solo disabled)', async () => {
        const onConfirm = vi.fn();
        const user = userEvent.setup();
        render(<PantryConsentModal open missing={MISSING} busy onConfirm={onConfirm} />);
        // pointer-events sigue activo en jsdom pese a `disabled`; el guard `if (!busy)` es la
        // defensa real (mismo patrón que EvaluarDeNuevoModal.jsx).
        await user.click(screen.getByRole('button', { name: /Añadiendo…/i })).catch(() => {});
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('sin `message` explícito, arma un fallback honesto con los nombres faltantes', () => {
        render(<PantryConsentModal open missing={MISSING} message="" />);
        expect(screen.getAllByText(/Yuca/).length).toBeGreaterThan(0);
    });
});
