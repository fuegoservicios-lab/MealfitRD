// [P1-STORE-HYGIENE · 2026-08-10] Grupo 7 (último) de la auditoría de listo-para-tienda.
// Cuatro cosas pequeñas, una de ellas con olor a rechazo.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { humanizeAuthError } from '../utils/authErrors';

const leer = (p) => fs.readFileSync(p, 'utf-8');

describe('[P1-LOGIN-LEGAL-TERMS] el consentimiento nombra los DOS documentos', () => {
    it('el login enlaza Términos de Uso además de la Política de Privacidad', () => {
        // Apple lo comprueba de forma vinculante. La ruta `/terms` y el helper del
        // dominio ya existían: enlazar solo privacidad era una omisión, no una decisión.
        const src = leer('src/pages/Login.jsx');
        // [P1-LEGAL-UNA-SOLA-COPIA . 2026-08-19] El helper se llamaba
        // `landingLegalUrl` y vivia dentro de este fichero; ahora es
        // `config/site.js::apexUrl`, compartido con el pie. Lo que este caso
        // vigila --que el consentimiento nombre los DOS documentos y ambos salgan
        // al apex-- no cambia.
        expect(src).toMatch(/apexUrl\('\/terms'\)/);
        expect(src).toMatch(/apexUrl\('\/privacy'\)/);
    });
});

describe('[P1-AUTH-ERRORS-ES] ningún error crudo llega a la pantalla', () => {
    it('un mensaje del proveedor en inglés NO se muestra tal cual', () => {
        // El caso que lo motivó: un usuario dominicano viendo «Invalid session token»
        // o un volcado con el código HTTP interpolado. Un mensaje que no se entiende
        // no informa: da sensación de app rota, y en la primera pantalla.
        const msg = humanizeAuthError({ message: 'Unexpected upstream failure xyz-42' });
        expect(msg).not.toMatch(/Unexpected upstream failure/);
        expect(msg).toMatch(/[áéíóúñ¿]/i); // está en español
    });

    it('clasifica por familia: el usuario sabe qué hacer', () => {
        expect(humanizeAuthError({ message: 'HTTP 503 Service Unavailable' })).toMatch(/servidor/i);
        expect(humanizeAuthError({ message: 'invalid session' })).toMatch(/sesión/i);
        expect(humanizeAuthError({ message: 'HTTP 400 malformed' })).toMatch(/datos/i);
    });

    it('el crudo NO se pierde: va a la consola para el diagnóstico', () => {
        // La información técnica sigue disponible donde sirve (Sentry la recoge);
        // solo deja de mostrarse a quien no puede usarla.
        const src = leer('src/utils/authErrors.js');
        expect(src).toMatch(/console\.error/);
    });

    it('sigue reconociendo los casos que ya traducía', () => {
        // Un arreglo de la última rama no puede llevarse por delante las anteriores.
        expect(humanizeAuthError({ message: 'rate limit exceeded' })).toMatch(/intentos/i);
        expect(humanizeAuthError({ code: 'request_timeout', message: 'x' })).toMatch(/tardó/i);
    });

    it('un mensaje que YA viene bueno en español se respeta tal cual', () => {
        // Nuestro propio backend manda copy accionable. Uniformarlo hacia un genérico
        // sería perder información: el objetivo es frenar el inglés y los volcados
        // técnicos, no aplanar todo. Este caso lo cazó la suite, no yo — mi primera
        // versión de la rama se llevaba por delante «Código inválido o expirado.».
        expect(humanizeAuthError({ message: 'Código inválido o expirado.' }))
            .toBe('Código inválido o expirado.');
        expect(humanizeAuthError({ message: 'Ese correo no está registrado.' }))
            .toBe('Ese correo no está registrado.');
    });
});

describe('[P1-SKIPLINK-ANCHOR] «Saltar al contenido» tiene destino', () => {
    it('el wizard y el login declaran el ancla que el enlace busca', () => {
        // El enlace es el PRIMER control de la página para quien navega con teclado.
        // Apuntaba a un id que no existe en estas dos pantallas: no hacía nada.
        expect(leer('src/components/assessment/InteractiveAssessmentLayout.jsx')).toMatch(/id="main-content"/);
        expect(leer('src/pages/Login.jsx')).toMatch(/id="main-content"/);
    });

    it('el destino es enfocable, o el salto no deposita el foco', () => {
        const wiz = leer('src/components/assessment/InteractiveAssessmentLayout.jsx');
        expect(wiz).toMatch(/id="main-content" tabIndex=\{-1\}/);
    });
});

describe('[P1-AUTOADVANCE-CLEANUP] el avance automático no sobrevive al usuario', () => {
    it('el temporizador se guarda y se cancela', () => {
        // Suelto, sobrevivía al desmontaje y podía DESHACER un «atrás»: disparaba
        // `nextStep` 300ms después de que el usuario decidiera retroceder. Con el gesto
        // atrás de Android ya conectado, esa ventana dejó de ser teórica.
        const src = leer('src/components/assessment/InteractiveAssessmentFlow.jsx');
        expect(src).toMatch(/autoAdvanceTimerRef/);
        const cancelaciones = src.match(/clearTimeout\(autoAdvanceTimerRef\.current\)/g) || [];
        // Al reprogramar, al cambiar de paso y al desmontar.
        expect(cancelaciones.length).toBeGreaterThanOrEqual(3);
    });
});
