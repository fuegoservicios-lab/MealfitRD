// [P1-PLAN-LOTE-1174 · 2026-11-27] La portada del coach también con AVISOS del coach en el hilo.
// El dueño: «¿por qué a Sherwin de Android se le ve así y a mí no?». No era la plataforma: su chat del día tenía un aviso
// (la notificación del almuerzo) y la portada solo salía con el saludo a solas. Mientras el usuario no escriba, es portada.
// 2ª vuelta («mira cómo se ve en móvil, y en PC peor»): el aviso como burbuja empujaba el saludo fuera de la pantalla en
// el teléfono y lo montaba sobre la cabecera en PC. Ahora es una tarjeta compacta dentro de la portada y el centrado es
// `safe center` (lo que no cabe se desplaza, no se corta).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { PortadaSaludo, textoDeAviso } from '../components/agent/PortadaDelCoach';

const SRC = readFileSync(resolve(__dirname, '../pages/AgentPage.jsx'), 'utf8');
const CSS = readFileSync(resolve(__dirname, '../components/agent/PortadaDelCoach.module.css'), 'utf8');

describe('lote 1174 · portada con avisos del coach', () => {
    it('la portada depende de que todo el hilo sea del coach, no de tener un solo mensaje', () => {
        expect(SRC).toContain("const _soloDelCoach = messages.length > 0 && messages.every((m) => m?.role === 'model'");
        expect(SRC).toContain('const enPortada = !isLoadingHistory && !chatDeOtroDia && !isTurnActive && _soloDelCoach && !_dudasDeEsteChat;');
    });

    it('sin saludo en el hilo, la portada genera uno; los avisos van DENTRO de la portada', () => {
        expect(SRC).toContain('return generateIntelligentWelcome(userProfile, formData, planData, resumenHoy);');
        expect(SRC).toContain('<PortadaSaludo saludo={saludoDePortada}');
        expect(SRC).toContain('avisos={avisosDePortada} />');
        expect(SRC).not.toContain('burbujasDelHilo.filter(');
    });

    it('el saludo de portada se calcula DESPUÉS de resumenHoy (si no, ReferenceError al pintar)', () => {
        const iResumen = SRC.indexOf('const resumenHoy = useResumenDeHoy(');
        const iSaludo = SRC.indexOf('const saludoDePortada = useMemo(');
        expect(iResumen).toBeGreaterThan(0);
        expect(iSaludo).toBeGreaterThan(iResumen);
    });

    it('lo que no cabe se desplaza en vez de cortarse por arriba', () => {
        expect(SRC).toContain("justifyContent: enPortada && !isMobile ? 'safe center' : undefined,");
        expect(SRC).toContain("flex: enPortada && !isMobile ? '0 1 auto' : 1,");
        expect(SRC).toContain("justifyContent: enPortada ? 'safe center' : 'flex-start',");
    });

    it('el aviso se pinta como tarjeta, sin formato, solo los 2 últimos', () => {
        render(<PortadaSaludo saludo="¡Buenas, angelo! Aún sin registros hoy." metas={{ calories: 2050, protein: 134 }}
            avisos={[{ content: 'uno' }, { content: 'Desayuna **avena**' }, { content: 'Almuerza arroz con pollo.' }]} />);
        expect(screen.queryByText('uno')).toBeNull();
        expect(screen.getByText('Desayuna avena')).toBeTruthy();
        expect(screen.getByText('Almuerza arroz con pollo.')).toBeTruthy();
        expect(screen.getAllByText('Aviso del coach').length).toBe(2);
        expect(textoDeAviso('## **Hola**')).toBe('Hola');
    });

    it('en el teléfono, con aviso, el párrafo del saludo se oculta para que quepa', () => {
        expect(CSS).toContain('.compacto.conAvisos .resto { display: none; }');
    });
});
