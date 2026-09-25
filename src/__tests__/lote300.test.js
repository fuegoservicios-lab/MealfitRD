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
