// [P1-PLAN-LOTE-690 · 2026-09-28] Las dudas de la foto se contestan ANTES de que hable el coach.
// Caso vivo: «Mi cena» + foto (plátano con huevos revueltos y salami, dos dudas). El coach contestó sin las respuestas
// (propuso OTRA cena) y «2 huevos · Maduro» llegó en un segundo turno sin la foto: «¿Ya te los comiste?». Nada anotado.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import RespuestasDeLaFoto from '../components/agent/RespuestasDeLaFoto';
import {
    ajusteDeRespuestas, eleccionesSupuestas, hayQueEsperarRespuestas, respuestasElegidas, textoDelTurno,
} from '../utils/fotoAntesDelCoach';
import { hayTurnoQueRescatar } from '../utils/rescateDelTurno';

const DUDAS = [
    {
        sobre: 'huevo', pregunta: '¿Cuántos huevos usaste en el revuelto?',
        opciones: [
            { texto: '1 huevo', supuesta: false, ajuste: { calories: -72, protein: -6, carbs: 0, healthy_fats: -5 } },
            { texto: '2 huevos', supuesta: true, ajuste: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 } },
            { texto: '3 huevos', supuesta: false, ajuste: { calories: 72, protein: 6, carbs: 0, healthy_fats: 5 } },
        ],
    },
    {
        sobre: 'plátano', pregunta: '¿El plátano era verde o maduro?',
        opciones: [
            { texto: 'Verde', supuesta: true, ajuste: { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 } },
            { texto: 'Maduro', supuesta: false, ajuste: { calories: 18, protein: 0, carbs: 5, healthy_fats: 0 } },
        ],
    },
];

describe('[690] utilidades', () => {
    it('el ajuste suma lo que cambia cada opción elegida', () => {
        expect(ajusteDeRespuestas(DUDAS, { 0: 2, 1: 1 })).toEqual({ calories: 90, protein: 6, carbs: 5, healthy_fats: 5 });
        expect(ajusteDeRespuestas(DUDAS, {})).toEqual({ calories: 0, protein: 0, carbs: 0, healthy_fats: 0 });
    });
    it('«Omitir» se queda con lo supuesto (o la primera si ninguna lo es)', () => {
        expect(eleccionesSupuestas(DUDAS)).toEqual({ 0: 1, 1: 0 });
        expect(eleccionesSupuestas([{ opciones: [{ texto: 'a' }, { texto: 'b' }] }])).toEqual({ 0: 0 });
        expect(respuestasElegidas(DUDAS, eleccionesSupuestas(DUDAS)).texto).toBe('2 huevos · Verde');
    });
    it('la burbuja guarda su texto y, debajo, las respuestas', () => {
        expect(textoDelTurno('Mi cena', '2 huevos · Maduro')).toBe('Mi cena\n2 huevos · Maduro');
        expect(textoDelTurno('', '2 huevos')).toBe('2 huevos');
        expect(textoDelTurno('Mi cena', '')).toBe('Mi cena');
    });
    it('solo espera el turno de la foto, con dudas, y no la reanudación', () => {
        expect(hayQueEsperarRespuestas({ dudas: DUDAS, reanudando: false })).toBe(true);
        expect(hayQueEsperarRespuestas({ dudas: DUDAS, reanudando: true })).toBe(false);
        expect(hayQueEsperarRespuestas({ dudas: [], reanudando: false })).toBe(false);
        expect(hayQueEsperarRespuestas({ dudas: DUDAS, reanudando: false, activo: false })).toBe(false);
    });
    it('una foto esperando sus respuestas no es un turno huérfano que rescatar', () => {
        const foto = { role: 'user', content: 'Mi cena', isImage: true, _esperaDudas: true };
        expect(hayTurnoQueRescatar({ mensajes: [foto], ocupado: false, cargandoHistorial: false })).toBe(false);
        expect(hayTurnoQueRescatar({ mensajes: [{ ...foto, _esperaDudas: false }], ocupado: false, cargandoHistorial: false })).toBe(true);
    });
});

describe('[690] la tarjeta', () => {
    it('con las dos dudas tocadas manda UN envío con el texto y el ajuste', () => {
        const onEnviar = vi.fn();
        render(<RespuestasDeLaFoto dudas={DUDAS} onEnviar={onEnviar} titulo="Antes de anotarlo, dime:" />);
        expect(screen.getByText('Antes de anotarlo, dime:')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '3 huevos' }));
        expect(onEnviar).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Maduro' }));
        expect(onEnviar).toHaveBeenCalledTimes(1);
        expect(onEnviar).toHaveBeenCalledWith('3 huevos · Maduro', { calories: 90, protein: 6, carbs: 5, healthy_fats: 5 });
    });
    it('«Omitir preguntas» manda lo supuesto; sin `onOmitir` no hay botón (conducta del 322)', () => {
        const onOmitir = vi.fn();
        const { unmount } = render(<RespuestasDeLaFoto dudas={DUDAS} onEnviar={vi.fn()} onOmitir={onOmitir} />);
        fireEvent.click(screen.getByRole('button', { name: 'Omitir preguntas' }));
        expect(onOmitir).toHaveBeenCalledWith('2 huevos · Verde', { calories: 0, protein: 0, carbs: 0, healthy_fats: 0 });
        unmount();
        render(<RespuestasDeLaFoto dudas={DUDAS} onEnviar={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Omitir preguntas' })).toBeNull();
        expect(screen.getByText('Responde con un toque:')).toBeTruthy();
    });
});

describe('[690] el chat espera a las respuestas', () => {
    const AP = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8').split(String.fromCharCode(13)).join('');
    const tramo = (desde, n = 2500) => { const i = AP.indexOf(desde); expect(i, desde).toBeGreaterThan(-1); return AP.slice(i, i + n); };

    it('con dudas, el turno termina ANTES de abrir el stream del coach', () => {
        const pausa = AP.indexOf('if (hayQueEsperarRespuestas({');
        const stream = AP.indexOf("fetchWithAuth('/api/chat/stream'");
        expect(pausa).toBeGreaterThan(-1);
        expect(pausa).toBeLessThan(stream);
        const t = tramo('if (hayQueEsperarRespuestas({', 900);
        expect(t).toContain('reanudando: !!options.fotoPendiente');
        expect(t).toContain('attachments: _durableRetryAttachments(uploadedAttachments)');
        expect(t).toContain('_esperaDudas: true');
        expect(t).toContain('return;');
    });
    it('la reanudación manda la foto ya subida, el mismo id de mensaje y las respuestas con su ajuste', () => {
        const t = tramo('const _reanudarFoto = (respuestas, ajuste) => {', 1500);
        expect(t).toContain('overrideAttachments: p.attachments');
        expect(t).toContain('clientMessageId: p.clientMessageId');
        expect(t).toContain('respuestasDeLaFoto: { texto, ajuste: ajuste || null }');
        const v = tramo('if (visionPayload && options.respuestasDeLaFoto) {', 400);
        expect(v).toContain('visionPayload.respuestas = options.respuestasDeLaFoto.texto');
        expect(v).toContain('visionPayload.ajuste = options.respuestasDeLaFoto.ajuste');
    });
    it('la reanudación no pinta otra burbuja: la de la foto recibe las respuestas', () => {
        const t = tramo('const _iFoto = options.fotoPendiente', 600);
        expect(t).toContain('content: userMsg, _esperaDudas: false');
        expect(t).toContain('originalUserMessageIndex = _iFoto');
    });
    it('lo que se escriba con la foto pendiente (también tras «Otra…») es la respuesta', () => {
        const t = tramo('const _pendiente = fotoPendienteRef.current;', 1100);
        // [P1-PLAN-LOTE-695] junto a lo ya tocado en la tarjeta
        expect(t).toContain('return _reanudarFoto(respuestaEscrita(_parcial, textToSend.trim()), null);');
        expect(t).toContain('_descartarFotoPendiente();');
    });
    it('la tarjeta de antes del coach reanuda; la de después (knob apagado) manda un mensaje como en el 322', () => {
        const t = tramo('<RespuestasDeLaFoto key=', 700);
        expect(t).toContain("titulo={fotoPendiente ? t('Antes de anotarlo, dime:') : null}");
        expect(t).toContain('fotoPendienteRef.current ? _reanudarFoto(texto, ajuste) : handleSend(texto)');
        expect(t).toContain('onOmitir={fotoPendiente ?');
    });
});
