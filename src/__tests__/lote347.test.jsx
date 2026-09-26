/**
 * [P1-PLAN-LOTE-347 · 2026-09-26] «Otra…»: cuando ninguna opción de la duda encaja.
 *
 * El dueño (captura: «2 huevos / 3 huevos / Solo claras»): «quiero una opción más flexible por si no son ninguna de
 * esas opciones». En el escáner, «Otra…» abre un campo y «Recalcular» vuelve a analizar la MISMA foto con lo escrito;
 * en el chat, pone el cursor en la caja con la pregunta como pista (el coach lee la respuesta y corrige).
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import DudasDeLaFoto from '../components/common/DudasDeLaFoto';

const DUDAS = [{ pregunta: '¿De cuántos huevos preparaste la tortilla?', opciones: [
    { texto: '2 huevos', supuesta: true, ajuste: {} }, { texto: '3 huevos', supuesta: false, ajuste: {} },
] }];
const leer = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('[347] «Otra…» en los botones de la duda', () => {
    // [P1-PLAN-LOTE-360] el dueño: «que se guarde en automático» — sin botón: se recalcula al terminar de escribir
    // (Intro/«Listo» o al salir del campo), nunca a media palabra (un análisis por letra gastaría de más).
    it('con campo (escáner): Intro recalcula solo, sin botón', () => {
        const otras = [];
        render(<DudasDeLaFoto dudas={DUDAS} respuestas={{ 0: 0 }} confirmadas={{}} onElegir={() => {}}
            otraConCampo onOtra={(i, texto) => otras.push([i, texto])} />);
        fireEvent.click(screen.getByRole('button', { name: 'Otra…' }));
        expect(screen.queryByRole('button', { name: 'Recalcular' })).toBeNull();
        const campo = screen.getByLabelText('Tu respuesta: ¿De cuántos huevos preparaste la tortilla?');
        expect(campo.getAttribute('enterkeyhint')).toBe('done');
        fireEvent.change(campo, { target: { value: ' 4 huevos con queso ' } });
        fireEvent.keyDown(campo, { key: 'Enter' });
        expect(otras).toEqual([[0, '4 huevos con queso']]);
    });

    it('con campo (escáner): cerrar el teclado / salir del campo también recalcula; vacío no', () => {
        const otras = [];
        render(<DudasDeLaFoto dudas={DUDAS} respuestas={{ 0: 0 }} confirmadas={{}} onElegir={() => {}}
            otraConCampo onOtra={(i, texto) => otras.push([i, texto])} />);
        fireEvent.click(screen.getByRole('button', { name: 'Otra…' }));
        const campo = screen.getByLabelText('Tu respuesta: ¿De cuántos huevos preparaste la tortilla?');
        fireEvent.blur(campo);
        expect(otras).toEqual([]);
        fireEvent.click(screen.getByRole('button', { name: 'Otra…' }));
        const campo2 = screen.getByLabelText('Tu respuesta: ¿De cuántos huevos preparaste la tortilla?');
        fireEvent.change(campo2, { target: { value: 'solo claras' } });
        fireEvent.blur(campo2);
        expect(otras).toEqual([[0, 'solo claras']]);
    });

    it('al abrir el campo, se centra a la vista (el teclado no lo tapa)', async () => {
        vi.useFakeTimers();
        const centrar = vi.fn();
        Element.prototype.scrollIntoView = centrar;
        try {
            render(<DudasDeLaFoto dudas={DUDAS} respuestas={{}} confirmadas={{}} onElegir={() => {}} otraConCampo onOtra={() => {}} />);
            fireEvent.click(screen.getByRole('button', { name: 'Otra…' }));
            vi.advanceTimersByTime(400);
            expect(centrar).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
        } finally { vi.useRealTimers(); }
    });

    it('sin campo (chat): «Otra…» avisa al momento con la pregunta', () => {
        const otras = [];
        render(<DudasDeLaFoto dudas={DUDAS} respuestas={{}} confirmadas={{}} onElegir={() => {}} onOtra={(i) => otras.push(i)} />);
        fireEvent.click(screen.getByRole('button', { name: 'Otra…' }));
        expect(otras).toEqual([0]);
    });

    it('sin onOtra no hay botón «Otra…» (compatibilidad)', () => {
        render(<DudasDeLaFoto dudas={DUDAS} respuestas={{}} confirmadas={{}} onElegir={() => {}} />);
        expect(screen.queryByRole('button', { name: 'Otra…' })).toBeNull();
    });
});

describe('[347] cableado', () => {
    it('el escáner re-analiza la misma foto con la aclaración', () => {
        const src = leer('components/dashboard/ScanMealModal.jsx');
        expect(src).toContain("if (aclaracion) fd.append('aclaracion', aclaracion);");
        expect(src).toContain('onOtra={(texto) => { const x = platosRef.current.find((q) => q.id === p.id); if (x?.file) void analizar(p.id, x.file, texto); }}');
    });

    it('el chat pone el cursor en la caja con la pregunta como pista', () => {
        const ap = leer('pages/AgentPage.jsx');
        expect(ap).toContain('onOtra={(pregunta) => { setPistaDeRespuesta(pregunta); chatInputRef.current?.focus(); }}');
        // el micrófono manda (lote 125); después, la pista de «Otra…»
        expect(ap).toContain("placeholder={isListening ? t('Te escucho…') : (pistaDeRespuesta || micErrorMsg");
    });
});
