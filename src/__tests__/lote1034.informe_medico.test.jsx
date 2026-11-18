// [P1-PLAN-LOTE-1034 · 2026-11-17] «Informe para tu médico»: la pantalla, el PDF y la entrada del coach.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../context/AssessmentContext', () => ({
    useAssessment: () => ({ session: { user: { id: '11111111-2222-4333-8444-555555555555' } }, userProfile: null }),
}));
vi.mock('../utils/informeMedicoPdf', () => ({ pdfDelInforme: vi.fn(async () => new Blob(['%PDF'], { type: 'application/pdf' })) }));

import { fetchWithAuth } from '../config/api';
import InformeMedico from '../pages/InformeMedico';
import { bloquesDelInforme, bloquesDeLaRedaccion } from '../utils/informeMedicoTexto';
import { aplicarAjustesDelCoach, rutaDePantalla } from '../utils/ajustesDelCoach';

const t = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v && v[k] !== undefined ? v[k] : `{${k}}`));
const DATA = {
    version: 1,
    periodo: { desde: '2026-10-19', hasta: '2026-11-17', dias: 30 },
    persona: { edad: 21, sexo: 'male', talla_cm: 168, peso_declarado_kg: 55.8, objetivo: 'gain_muscle' },
    declarado_por_el_paciente: { condiciones: ['Hipertensión'], alergias: [], medicamentos: [], suplementos: [] },
    adherencia: { dias_con_registro: 22, dias_del_periodo: 30, dias_en_meta: 6, dias_bajo: 9, dias_sobre: 7 },
    energia: { kcal_media: 1985, meta_media: 2050, pct_de_la_meta: 97, kcal_min: 1400, kcal_max: 2700, desviacion: 410,
        por_semana: [{ numero: 9, kcal_media: 2390, dias: 5 }, { numero: 10, kcal_media: 1800, dias: 6 }] },
    micronutrientes: { dias_con_datos: 12, dias_con_registro: 22, bajo_la_meta: [{ nutriente: 'calcium', media_pct_de_la_meta: 54 }],
        sobre_el_limite: [{ nutriente: 'sodium', media_pct_del_limite: 132 }] },
    limitaciones: ['datos_autorreportados', 'porciones_estimadas', 'dias_sin_registro: 8'],
};
const leer = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');
const ruta = (id = '') => `/dashboard/informe${id ? `?id=${id}` : ''}`;
const montar = (entrada = ruta()) => render(
    <MemoryRouter initialEntries={[entrada]}><Routes><Route path="/dashboard/informe" element={<InformeMedico />} /></Routes></MemoryRouter>,
);
const respuesta = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

beforeEach(() => { vi.mocked(fetchWithAuth).mockReset(); });

describe('[1034] los bloques del informe salen solo de `data`', () => {
    it('pinta las cifras tal cual y omite las secciones ausentes', () => {
        const b = bloquesDelInforme(DATA, { t, fmt: String });
        const ids = b.map((x) => x.id);
        expect(ids).toEqual(['persona', 'declarado', 'adherencia', 'energia', 'micros', 'limitaciones']);
        const energia = b.find((x) => x.id === 'energia').lineas.join(' | ');
        expect(energia).toContain('1985 kcal');
        expect(energia).toContain('97 % de la meta');
        const micros = b.find((x) => x.id === 'micros').lineas.join(' | ');
        expect(micros).toContain('Calcio: 54 % de su referencia');
        expect(micros).toContain('Sodio: 132 % del límite');
        expect(b.find((x) => x.id === 'declarado').lineas[1]).toBe('Alergias: Ninguno declarado');
        expect(b.find((x) => x.id === 'limitaciones').lineas).toContain('Días sin registro en el periodo: 8');
    });

    it('sin datos no inventa nada', () => {
        expect(bloquesDelInforme(null, { t })).toEqual([]);
        expect(bloquesDeLaRedaccion(null, { t })).toEqual([]);
        expect(bloquesDelInforme({ periodo: DATA.periodo, limitaciones: [] }, { t })).toEqual([]);
    });
});

describe('[1034] la pantalla', () => {
    it('genera un informe «ready»: resumen redactado, aviso fijo y secciones', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => {
            if (opts?.method === 'POST') {
                expect(JSON.parse(opts.body)).toMatchObject({ dias: 90, con_redaccion: true });
                return respuesta({ id: 'a', status: 'ready', data: DATA, created_at: '2026-11-17T12:00:00Z',
                    narrative: { resumen: 'El paciente registró 22 de 30 días.', hallazgos: [{ texto: 'Sodio en 132 %.', evidencia: ['micronutrientes.sobre_el_limite[0]'] }],
                        preguntas_para_la_consulta: ['¿Reviso mi sodio?', '¿Y el calcio?', '¿Proteína?'] } });
            }
            return respuesta({ informes: [] });
        });
        montar();
        fireEvent.click(screen.getByRole('radio', { name: '90 días' }));
        fireEvent.click(screen.getByRole('button', { name: /generar/i }));
        expect(await screen.findByText('El paciente registró 22 de 30 días.')).toBeInTheDocument();
        expect(screen.getByTestId('informe-aviso').textContent).toMatch(/No es un diagnóstico/);
        expect(screen.queryByTestId('informe-solo-datos')).toBeNull();
        expect(screen.getByText('Hallazgos')).toBeInTheDocument();
        expect(screen.getByText(/Media diaria: 1985 kcal|Media diaria: 1.985 kcal/)).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: /compartir pdf/i })).not.toBeDisabled());
    });

    it('un informe «data_only» lo dice con su motivo y no pinta redacción', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => (opts?.method === 'POST'
            ? respuesta({ id: 'b', status: 'data_only', motivo: 'sin_permiso', data: DATA, narrative: null })
            : respuesta({ informes: [] })));
        montar();
        fireEvent.click(screen.getByRole('button', { name: /generar/i }));
        expect(await screen.findByTestId('informe-solo-datos')).toHaveTextContent(/permiso para usar la IA de terceros/);
        expect(screen.queryByText('Hallazgos')).toBeNull();
    });

    it('el cuarto del día: muestra el aviso del tope', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(async (url, opts) => (opts?.method === 'POST'
            ? respuesta({ detail: 'tope' }, 429) : respuesta({ informes: [] })));
        montar();
        fireEvent.click(screen.getByRole('button', { name: /generar/i }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/3 informes hoy/);
    });

    it('abierto por el coach con `?id=`: lee ese informe', async () => {
        vi.mocked(fetchWithAuth).mockImplementation(async (url) => (String(url).endsWith('/abc-1')
            ? respuesta({ id: 'abc-1', status: 'data_only', data: DATA, narrative: null })
            : respuesta({ informes: [] })));
        montar(ruta('abc-1'));
        expect(await screen.findByTestId('informe-medico')).toBeInTheDocument();
        expect(vi.mocked(fetchWithAuth).mock.calls.some(([u]) => String(u).endsWith('/abc-1'))).toBe(true);
    });
});

describe('[1034] el coach abre el informe que preparó', () => {
    it('`informe` es una pantalla y con id navega a ese informe', () => {
        expect(rutaDePantalla('informe')).toBe('/dashboard/informe');
        const navigate = vi.fn();
        const id = '00000000-0000-4000-8000-000000000000';
        aplicarAjustesDelCoach({ pantalla: 'informe', informe_id: id }, { navigate });
        expect(navigate).toHaveBeenCalledWith(`/dashboard/informe?id=${id}`);
        aplicarAjustesDelCoach({ pantalla: 'informe', informe_id: 'x"><script>' }, { navigate });
        expect(navigate).toHaveBeenLastCalledWith('/dashboard/informe');
    });
});

describe('[1034] jspdf no entra en el arranque', () => {
    const fuentes = (dir) => readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) return n === '__tests__' ? [] : fuentes(p);
        return /\.(jsx?|mjs)$/.test(n) ? [p] : [];
    });
    it('nadie importa jspdf de forma estática; el PDF se carga con import() en la acción', () => {
        const estaticos = fuentes(join(__dirname, '..')).filter((p) => /from\s+['"]jspdf['"]/.test(readFileSync(p, 'utf8')));
        expect(estaticos).toEqual([]);
        expect(leer('utils/informeMedicoPdf.js')).toContain("await import('jspdf')");
        // [P1-PLAN-LOTE-1072] el contenido vive en el panel (hoja y ruta); la hoja lo carga perezoso
        expect(leer('components/informe/InformeMedicoPanel.jsx')).toContain("import('../../utils/informeMedicoPdf')");
        expect(leer('components/informe/HojaInformeMedico.jsx')).toContain("lazy(() => import('./InformeMedicoPanel'))");
        expect(leer('App.jsx')).toContain("const InformeMedico = lazy(() => import('./pages/InformeMedico'))");
    });
});
