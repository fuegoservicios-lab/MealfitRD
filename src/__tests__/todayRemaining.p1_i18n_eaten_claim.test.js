/**
 * [P1-I18N-EATEN-CLAIM-FRASE-FABRICADA · 2026-08-23] El único motivo por el que un control
 * está bloqueado se pintaba como un párrafo español fabricado a mano.
 *
 * Cuando el usuario ya registró la comida de ese horario, «Cambiar Plato» y «Me gusta» se
 * bloquean y al tocarlos aparece un toast que explica por qué. `eatenClaimForSlot`
 * CONCATENABA cadenas españolas:
 *
 *     «Registraste «X» (~450 kcal) como tu almuerzo de hoy. Bórralo en «Progreso en Tiempo
 *      Real» para desbloquear.»
 *
 * Nada pasaba por `t()`, y arrastraba dos defectos más dentro: el sustantivo del horario
 * era la CLAVE canónica española (`canonicalSlotKey` → 'almuerzo'), y la frase remitía a
 * una sección de la interfaz POR SU NOMBRE ESPAÑOL —«Progreso en Tiempo Real»— que en la
 * pantalla del usuario se llama de otra manera. Su hermana en el MISMO fichero,
 * `eatenChipLabel`, sí se tradujo (`P2-I18N-TODAY-REMAINING`), 26 líneas más arriba, el
 * mismo día. Media parte del espejo.
 *
 * Y un tercero que el gap no listaba: `joinNamesEsDo` —«A, B y C»— también fabrica prosa.
 * La conjunción es idioma («and», «et», «e»), y `Intl.ListFormat` existe para esto.
 *
 * Se prueba por CONDUCTA con el catálogo real de fr-FR cargado: lo que un francés lee.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadLocale } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n/locales';
import { eatenClaimForSlot, joinNamesEsDo } from '../utils/todayRemaining';

const COMIDAS = [
    { meal_type: 'almuerzo', meal_name: 'Arroz con pollo', calories: 450 },
];

describe('[P1-I18N-EATEN-CLAIM-FRASE-FABRICADA]', () => {
    beforeEach(async () => { await loadLocale('fr-FR'); });
    afterEach(async () => { await loadLocale(DEFAULT_LOCALE); });

    it('EL CASO: el motivo del bloqueo se lee en el idioma del usuario', () => {
        const claim = eatenClaimForSlot(COMIDAS, 'almuerzo', 'unlock');
        expect(claim, 'sigue fabricado en español').not.toMatch(/Registraste|Bórralo|de hoy/);
        expect(claim, 'el nombre del plato (identificador) viaja intacto').toContain('Arroz con pollo');
        expect(claim, 'la cifra sobrevive').toContain('450');
    });

    it('el horario se traduce para PINTAR, no la clave canónica', () => {
        const claim = eatenClaimForSlot(COMIDAS, 'almuerzo', 'none');
        // 'almuerzo' es la clave que EMPAREJA el diario con el plan y no debe salir en la
        // frase de un francés; su traducción sí.
        expect(claim).not.toMatch(/\balmuerzo\b/);
    });

    it('la seccion a la que remite se nombra como el usuario la VE', () => {
        const claim = eatenClaimForSlot(COMIDAS, 'almuerzo', 'unlock');
        // La cabecera de la sección es `t('Progreso en Tiempo Real')`; el toast tiene que
        // decir lo MISMO que pone en la pantalla, o manda al usuario a buscar algo que no
        // existe con ese nombre.
        expect(claim).not.toContain('Progreso en Tiempo Real');
    });

    it('joinNamesEsDo usa la conjuncion del idioma, no « y » clavada', () => {
        const s = joinNamesEsDo(['A', 'B', 'C']);
        expect(s, 'la conjunción sigue en español').not.toMatch(/\by\b/);
        expect(s).toContain('A');
        expect(s).toContain('C');
    });
});

describe('[P1-I18N-EATEN-CLAIM-FRASE-FABRICADA] en es-DO nada cambia', () => {
    it('el copy español es byte-identico al de antes', async () => {
        await loadLocale(DEFAULT_LOCALE);
        expect(eatenClaimForSlot(COMIDAS, 'almuerzo', 'unlock')).toBe(
            'Registraste «Arroz con pollo» (~450 kcal) como tu almuerzo de hoy. Bórralo en «Progreso en Tiempo Real» para desbloquear.',
        );
        expect(joinNamesEsDo(['A', 'B', 'C'])).toBe('A, B y C');
    });
});
