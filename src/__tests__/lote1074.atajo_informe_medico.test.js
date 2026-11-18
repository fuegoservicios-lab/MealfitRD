/**
 * [P1-PLAN-LOTE-1074 · 2026-11-17] Atajos del chat: «Anotar comida» sale (el dueño la veía innecesaria: se anota
 * escribiendo o con la foto) y entra «Informe para tu médico», a primera vista. Abre la MISMA hoja del calendario.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { atajosDelChat } from '../utils/atajosDelChat';

const t = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (_, k) => v[k]) : s);
const AGENT = readFileSync(resolve(process.cwd(), 'src/pages/AgentPage.jsx'), 'utf8');

describe('[1074] el atajo del informe', () => {
    it('va segundo, detrás de «Escanear mi plato», con el hilo corto y con el largo; «Anotar comida» ya no está', () => {
        for (const soloAcciones of [false, true]) {
            const a = atajosDelChat({ hora: 21, modoContador: false, comidas: [], soloAcciones, t });
            expect(a.slice(0, 2).map((x) => x.texto)).toEqual(['Escanear mi plato', 'Informe para tu médico']);
            expect(a.map((x) => x.texto)).not.toContain('Anotar comida');
        }
    });

    it('tocarlo abre la hoja del informe (no envía un mensaje al coach)', () => {
        expect(AGENT).toMatch(/a\.accion === 'informe'\) \{[\s\S]{0,400}setInformeAbierto\(true\)/);
        expect(AGENT).toContain("import HojaInformeMedico from '../components/informe/HojaInformeMedico'");
        expect(AGENT).toContain('<HojaInformeMedico abierta={informeAbierto} onCerrar={() => setInformeAbierto(false)} />');
    });
});
