import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    hayTurnoQueRescatar,
    esBurbujaDeCorte,
    debeOcultarBurbujaDeCorte,
    mensajesVisiblesParaElUsuario,
} from '../utils/rescateDelTurno';
import { ESPERA_TRAS_VOLVER_MS } from '../utils/vueltaConTurno';

const _dir = path.dirname(fileURLToPath(import.meta.url));
const _agentPagePath = path.resolve(_dir, '../pages/AgentPage.jsx');

const usuario = (content = 'Este jugo fue parte de la cena') => ({ role: 'user', content });
const modeloCompleto = (content = 'Aquí tienes el cálculo...') => ({ role: 'model', content });
const modeloParcial = (content = 'Aquí...') => ({ role: 'model', content, isIncomplete: true, isStreaming: false });
const corte = (errorStatus = 0) => ({ role: 'model', content: '📡 Sin conexión', _isErrorBubble: true, errorStatus });

describe('rescateDelTurno: ocultar falso "Sin conexión" al volver y rescatar cortes parciales', () => {
    it('rescata aunque hayan llegado chunks parciales antes de suspenderse la app', () => {
        expect(hayTurnoQueRescatar({
            mensajes: [usuario(), modeloParcial(), corte(0)],
            ocupado: false,
            cargandoHistorial: false,
            enLinea: true,
        })).toBe(true);

        expect(hayTurnoQueRescatar({
            mensajes: [usuario(), modeloParcial()],
            ocupado: false,
            cargandoHistorial: false,
            enLinea: true,
        })).toBe(true);
    });

    it('oculta la burbuja de corte (0 / 502) mientras hay red o rescate activo, sin tapar errores reales ni modo offline', () => {
        const conCorte = [usuario(), corte(0)];
        expect(esBurbujaDeCorte(conCorte[1])).toBe(true);

        expect(debeOcultarBurbujaDeCorte({
            mensajes: conCorte,
            recuperando: false,
            ocupado: false,
            cargandoHistorial: false,
            enLinea: true,
            firmaDescartada: false,
        })).toBe(true);

        expect(mensajesVisiblesParaElUsuario(conCorte, true)).toEqual([conCorte[0]]);

        // Si realmente no hay red o si ya se descartó/agotó el rescate, sí se muestra la burbuja con Reintentar
        expect(debeOcultarBurbujaDeCorte({ mensajes: conCorte, enLinea: false })).toBe(false);
        expect(debeOcultarBurbujaDeCorte({ mensajes: conCorte, enLinea: true, firmaDescartada: true })).toBe(false);

        // Errores de cuota / payload (402 / 413) nunca se ocultan
        const conCuota = [usuario(), corte(402)];
        expect(debeOcultarBurbujaDeCorte({ mensajes: conCuota, enLinea: true })).toBe(false);
        expect(mensajesVisiblesParaElUsuario(conCuota, true)).toEqual(conCuota);

        // Error de red tras respuesta ya entregada no se oculta
        const trasRespuesta = [usuario(), modeloCompleto(), corte(0)];
        expect(debeOcultarBurbujaDeCorte({ mensajes: trasRespuesta, enLinea: true })).toBe(false);
    });
});

describe('AgentPage: reanudación instantánea sin flash de "Sin conexión"', () => {
    it('sondea en 0ms tras corte, despierta al volver a primer plano, reusa historial prefetcheado y oculta el error transitorio', () => {
        const src = fs.readFileSync(_agentPagePath, 'utf8');
        expect(src).toContain('setTimeout(_poll, 0)');
        expect(src).toContain('const _despertarAlVolver = () => {');
        expect(src).toContain('_prefetchedHistoryRef.current');
        expect(src).toContain('const visibleMessages = _ocultarCorteEnCurso');
        expect(src).toContain('isLoading={showCoachPensando}');
        expect(ESPERA_TRAS_VOLVER_MS).toBeLessThanOrEqual(1000);
    });
});
