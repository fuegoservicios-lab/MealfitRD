/**
 * [P1-PLAN-LOTE-300 · 2026-09-25] Push nativa en iOS (APNs directo). Lo que el binario de iOS necesita para recibirla:
 * la capacidad `aps-environment`, el AppDelegate que entrega el token a Capacitor, y que con la app DELANTE el sistema
 * no pinte la push (la pinta la app como aviso local, salvo «solo si no mira»): si no, salía dos veces.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RAIZ = (rel) => readFileSync(resolve(__dirname, '..', '..', rel), 'utf8');

describe('[300] el binario de iOS recibe push', () => {
    it('lleva la capacidad aps-environment de producción', () => {
        const ent = RAIZ('ios/App/App/App.entitlements');
        expect(ent).toMatch(/<key>aps-environment<\/key>\s*<string>production<\/string>/);
        expect(ent).toContain('com.apple.developer.applesignin');   // lo que ya había sigue
    });

    it('el AppDelegate entrega el token (o el error) a Capacitor', () => {
        const ad = RAIZ('ios/App/App/AppDelegate.swift');
        expect(ad).toContain('didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data');
        expect(ad).toContain('.capacitorDidRegisterForRemoteNotifications');
        expect(ad).toContain('.capacitorDidFailToRegisterForRemoteNotifications');
    });

    it('con la app delante el sistema no pinta la push (la pinta la app una sola vez)', () => {
        expect(RAIZ('capacitor.config.ts')).toContain('PushNotifications: { presentationOptions: [] }');
    });
});

// ── Detalles menores de los suplementos (pedido del dueño, 25-sep) ──────────────────────────────────────────────────
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import GrupoSuplementos from '../components/pantry/GrupoSuplementos';

const SRC = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('[300] M3: borrar y editar un pote en la Alacena', () => {
    const pote = { id: 7, nombre: 'Creatina', marca: null, porciones: 0, unidad: 'g', etiqueta: null, fuente: null };

    it('cada pote trae «Porciones» y «Quitar», y avisan con su id', () => {
        const cambios = [];
        const borrados = [];
        render(React.createElement(GrupoSuplementos, {
            potes: [pote], soloDelPlan: [],
            onCambiarPorciones: (id, n) => cambios.push([id, n]), onBorrar: (id) => borrados.push(id),
        }));
        fireEvent.change(screen.getByLabelText('Porciones de Creatina'), { target: { value: '60' } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar porciones de Creatina' }));
        fireEvent.click(screen.getByRole('button', { name: 'Quitar Creatina' }));
        expect(cambios).toEqual([[7, 60]]);
        expect(borrados).toEqual([7]);
    });

    it('la Nevera los conecta a los endpoints de siempre', () => {
        const p = SRC('pages/Pantry.jsx');
        expect(p).toContain('onCambiarPorciones={cambiarPorcionesSuplemento}');
        expect(p).toContain('onBorrar={borrarSuplemento}');
    });
});

describe('[300] M2: el menú se entera al instante de que la Nevera se encendió', () => {
    it('al refrescar la Nevera desde el chat, se relee el perfil si estaba apagada', () => {
        const ctx = SRC('context/AssessmentContext.jsx');
        expect(ctx).toContain("window.addEventListener('mealfit:refresh-inventory', releerSiNeveraApagada)");
    });
});
