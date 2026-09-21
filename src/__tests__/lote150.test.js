// [P1-PLAN-LOTE-150 · 2026-09-21] El recordatorio llega a TU hora, y tú decides si lo quieres.
//
// El dueño: «solo avisa al rato después del horario… quiero que a las 8:45 me anime a desayunarme si todavía no he
// registrado ningún desayuno» y «quiero que se pueda desactivar y activar en configuraciones esa opción, ya que con
// eso tendría la opción de tener más tranquilidad al tener menos notificaciones».
//
// Se MOVIÓ el aviso, no se añadió otro: dos por comida serían ocho al día con los del agua, y en iOS quien se harta
// apaga TODAS las notificaciones de la app desde el sistema y se lleva por delante las que importan.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const leer = (rel) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
const S = leer('src/pages/Settings.jsx');

describe('lote 150 · los dos interruptores de avisos', () => {
    it('son DOS, separados, y viven en el perfil (no en este dispositivo)', () => {
        expect(S).toContain("const [avisosComida, setAvisosComida] = useState(() => _prefAvisos('avisos_comida'));");
        expect(S).toContain("const [avisosAgua, setAvisosAgua] = useState(() => _prefAvisos('avisos_agua'));");
        expect(S).toContain("safeUpdateHealthProfile({ [clave]: valor })");
        // en el perfil y no en localStorage: apagarlo tiene que callar TAMBIÉN al cron del servidor
        expect(S).not.toContain("safeLocalStorageSet('mealfit_avisos_comida'");
    });

    it('ausente ⇒ ENCENDIDO: nadie pierde los avisos que ya tenía por un despliegue', () => {
        expect(S).toContain("const _prefAvisos = (clave) => (userProfile?.health_profile || {})[clave] !== false;");
    });

    it('al cambiarlo, el teléfono reprograma, y si el perfil no está se revierte en vez de mentir', () => {
        const i = S.indexOf('const cambiarPrefDeAviso');
        const cuerpo = S.slice(i, i + 900);
        expect(cuerpo).toContain('poner(!valor);');
        expect(cuerpo).toContain('await sincronizarAvisosLocales();');
        expect(S).toContain("sincronizarAvisosLocales } from '../utils/avisosDeComida';");
    });

    it('solo se pintan donde hay algo que afinar: con las alertas encendidas y un canal vivo', () => {
        expect(S).toContain("{pushEnabled && !isPushBlocked && (canalAvisos === 'web-push' || canalAvisos === 'local') && (");
    });

    it('los cuatro textos están en los cuatro catálogos', () => {
        for (const loc of ['en-US', 'pt-BR', 'fr-FR', 'it-IT']) {
            const cat = JSON.parse(leer(`src/i18n/locales/${loc}.json`));
            for (const k of ['Recordatorios de comida', 'Recordatorios de agua',
                'Un aviso por comida, justo antes de tu hora habitual.',
                'Avisos para que no se te olvide beber durante el día.']) {
                expect(cat[k], `${loc}: falta «${k}»`).toBeTruthy();
            }
        }
    });
});
