// [P1-PLAN-LOTE-224 · 2026-09-24] El sistema de idiomas, al 100 % para producción.
//
// Un tester con la app en inglés: «What is it?: Un tazón de avena cocida con leche» en el escáner y «Other (e.g. Maní,
// Fresa...)» en el paso de alergias. El dueño: «el sistema de idiomas no está al 100 %, vamos a dejarlo al 100 % listo
// para producción». La forma se repetía en todo el producto —el título traducido y, debajo, lo que escribe el
// servidor o el modelo en español— y este archivo vigila cada pieza del arreglo en el cliente:
//
//   1. Los alimentos se LEEN en el idioma del usuario (nombre, línea de ingrediente, buscador, lista de compras) y se
//      GUARDAN en español (el identificador del motor).
//   2. Los avisos del servidor se recomponen en el idioma del usuario: calidad del día y del plato, ahorro, frases
//      fijas de «Acción requerida», micronutrientes, errores de cupón / Nevera, observaciones del revisor.
//   3. Los nombres del diario (platos del plan, «Comida registrada», alimentos del catálogo).
//   4. El plan del invitado: qué falta, cuándo no repetir la petición y cómo fusionar sin pegar una traducción sobre
//      un plato que cambió.
//   5. El texto libre fuera del plan (recuerdos, suplementos): se pide una vez y se guarda.
//
// Las anclas del backend están en `test_p1_plan_lote_224.py` (que también lee este archivo para saber qué árbol es).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadLocale, t } from '../i18n';
import { setCachedMasterList, invalidateMasterListCache } from '../utils/pantryCache';
import { nombreDeFila, nombreDelAlimento, formasDeBuscar, lineaDeIngredienteVisible, esAlimentoDelCatalogo } from '../utils/nombresDeAlimentos';
import { searchFoods } from '../utils/foodSearch';
import { glossShoppingItemName } from '../utils/shoppingHelpers';
import { etiquetaMicro, notaMicro, textoSuplemento, alimentosSuplemento, avisoMicro, NOTAS_MICRO, SUFIJO_PISO_ESTIMADO } from '../utils/microsCopy';
import { avisoDeCalidadDelDia, avisoDeCalidadDelPlato, AVISO_PLATO_LEJOS_DE_PROTEINA } from '../utils/avisosDeCalidad';
import { sugerenciaDePresupuesto, sustitucionDePresupuesto } from '../utils/avisosDePresupuesto';
import { textoDelServidor, TEXTOS_FIJOS_DEL_SERVIDOR } from '../utils/textosDelServidor';
import { nombreDeRegistro } from '../utils/nombreDeRegistro';
import { faltaTraduccion, firmaDeTraduccion, fusionarTraduccion, traducirPlanDelInvitado, _reiniciarParaPruebas } from '../utils/traduccionInvitado';
import { reviewIssueLegible } from '../utils/clinicalNoteGloss';
import { mensajeDelServidor } from '../utils/errorCopy';
import { useTextosTraducidos } from '../hooks/useTextosTraducidos';
import { fetchWithAuth } from '../config/api';

vi.mock('../config/api', () => ({ fetchWithAuth: vi.fn() }));

const src = (rel) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

const POLLO = { id: 1, name: 'Pechuga de pollo', name_en: 'Chicken breast',
    names: { 'en-US': 'Chicken breast', 'pt-BR': 'Peito de frango', 'fr-FR': 'Blanc de poulet', 'it-IT': 'Petto di pollo' },
    aliases: ['pechuga'] };
const HUEVO = { id: 2, name: 'Huevo', name_en: 'Egg',
    names: { 'en-US': 'Egg', 'pt-BR': 'Ovo', 'fr-FR': 'Œuf', 'it-IT': 'Uovo' } };
const ARROZ = { id: 3, name: 'Arroz blanco', name_en: 'White rice',
    names: { 'en-US': 'White rice', 'pt-BR': 'Arroz branco', 'fr-FR': 'Riz blanc', 'it-IT': 'Riso bianco' } };

beforeEach(() => {
    setCachedMasterList([POLLO, HUEVO, ARROZ]);
    fetchWithAuth.mockReset();
});

afterEach(async () => {
    invalidateMasterListCache();
    await loadLocale('es-DO');
});

describe('1 · los alimentos se leen en el idioma del usuario', () => {
    it('nombreDeFila: el propio, el inglés de respaldo y el español en la base', () => {
        expect(nombreDeFila(POLLO, 'fr-FR')).toBe('Blanc de poulet');
        expect(nombreDeFila({ name: 'Yuca', name_en: 'Cassava' }, 'en-US')).toBe('Cassava');
        expect(nombreDeFila({ name: 'Yuca', name_en: 'Cassava' }, 'fr-FR')).toBe('Yuca');
        expect(nombreDeFila(POLLO, 'es-DO')).toBe('Pechuga de pollo');
    });

    it('nombreDelAlimento resuelve sin acentos ni caja y deja lo desconocido tal cual', () => {
        expect(nombreDelAlimento('pechuga de pollo', 'it-IT')).toBe('Petto di pollo');
        expect(nombreDelAlimento('Arroz con pollo', 'en-US')).toBe('Arroz con pollo');
        expect(nombreDelAlimento('Huevo', 'es-DO')).toBe('Huevo');
        expect(esAlimentoDelCatalogo('HUEVO')).toBe(true);
        expect(esAlimentoDelCatalogo('Mangú')).toBe(false);
    });

    it('formasDeBuscar trae los cinco idiomas, los alias y la ligadura sin ligadura', () => {
        const formas = formasDeBuscar(HUEVO);
        expect(formas).toEqual(expect.arrayContaining(['Huevo', 'Egg', 'Œuf', 'Oeuf', 'Uovo', 'Ovo']));
        expect(formasDeBuscar(POLLO)).toContain('pechuga');
    });

    it('el buscador encuentra «poulet» y lo pinta en francés, pero la ref sigue siendo la fila española', async () => {
        await loadLocale('fr-FR');
        const r = searchFoods('poulet', [POLLO, HUEVO], []);
        expect(r[0].label).toBe('Blanc de poulet');
        expect(r[0].ref).toBe('food:1');
        expect(r[0].item.name).toBe('Pechuga de pollo');
    });

    it('la línea de ingrediente del motor se lee entera en el idioma del usuario', async () => {
        await loadLocale('en-US');
        const l = lineaDeIngredienteVisible('2 unidad de Huevo', t, 'en-US');
        expect(l).toContain('Egg');
        expect(l).not.toContain('Huevo');
        expect(lineaDeIngredienteVisible('2 unidad de Huevo', t, 'es-DO')).toBe('2 unidad de Huevo');
    });

    it('la lista de compras glosa en el idioma del usuario (antes era inglés para todos)', () => {
        const indice = new Map([['pechuga de pollo', { name_en: 'Chicken breast', names: POLLO.names }]]);
        expect(glossShoppingItemName('Pechuga de pollo', null, 'fr-FR', indice)).toBe('Blanc de poulet (Pechuga de pollo)');
        expect(glossShoppingItemName('Pechuga de pollo', null, 'en-US', indice)).toBe('Chicken breast (Pechuga de pollo)');
    });
});

describe('2 · los avisos del servidor, recompuestos', () => {
    it('micronutrientes: nombre por clave, nota exacta con su coletilla, suplementos y avisos', async () => {
        await loadLocale('en-US');
        expect(etiquetaMicro({ key: 'calcium_mg', nutriente: 'Calcio' }, t, 'en-US')).not.toBe('Calcio');
        const nota = NOTAS_MICRO.fiber_g;
        expect(notaMicro(nota, 'fiber_g', t, 'en-US')).not.toBe(nota);
        const conSufijo = `${nota} ${SUFIJO_PISO_ESTIMADO}`;
        const tr = notaMicro(conSufijo, 'fiber_g', t, 'en-US');
        expect(tr).not.toContain('Dato estimado');
        expect(notaMicro('Una nota que nadie conoce.', 'fiber_g', t, 'en-US')).toBe('Una nota que nadie conoce.');
        expect(notaMicro(nota, 'fiber_g', t, 'es-DO')).toBe(nota);
        expect(textoSuplemento('Vitamina D3', t, 'en-US')).not.toBe('Vitamina D3');
        expect(alimentosSuplemento('huevo, lácteos, carne, pescado', t, 'en-US')).not.toContain('lácteos');
        expect(avisoMicro("Estimado desde el catálogo nutricional (cobertura 80%); NO incluye la sal añadida 'al gusto'. Orientativo, no sustituye evaluación de un nutricionista.", t, 'en-US')).toContain('80%');
    });

    it('la nota recompuesta por las alergias se traduce con sus opciones', async () => {
        await loadLocale('en-US');
        const tr = notaMicro('Refuerza con vegetales de hoja verde y sésamo.', 'calcium_mg', t, 'en-US');
        expect(tr).not.toContain('Refuerza');
        expect(tr).not.toContain('sésamo');
    });

    it('el aviso del día se escribe con los datos; en español, la prosa del servidor', async () => {
        const data = {
            day_quality_warning: 'Este día quedó en ~95g de proteína (objetivo ~130g), por debajo de tu objetivo. Tu Nevera puede no tener suficiente para tu objetivo: agrega más ítems y vuelve a generar.',
            day_quality_warning_detail: { kind: 'deficit', pantry_limited: true, deficits: [{ axis: 'protein', value: 95, target: 130 }, { axis: 'kcal', value: 1700, target: 2400 }] },
        };
        expect(avisoDeCalidadDelDia(data, t, 'es-DO')).toBe(data.day_quality_warning);
        await loadLocale('en-US');
        const en = avisoDeCalidadDelDia(data, t, 'en-US');
        expect(en).toContain('95');
        expect(en).toContain('1,700');
        expect(en).not.toMatch(/proteína|Nevera|objetivo/);
        const banda = avisoDeCalidadDelDia({ day_quality_warning: 'x', day_quality_warning_detail: { kind: 'band', precision_pct: 42, pantry_limited: false } }, t, 'en-US');
        expect(banda).toContain('42%');
        const viejo = avisoDeCalidadDelDia({ day_quality_warning: 'Este día quedó raro.' }, t, 'en-US');
        expect(viejo).not.toContain('raro');
        expect(avisoDeCalidadDelDia({}, t, 'en-US')).toBe('');
    });

    it('el aviso del plato es la frase fija, traducida', async () => {
        const meal = { swap_quality_warning: AVISO_PLATO_LEJOS_DE_PROTEINA };
        expect(avisoDeCalidadDelPlato(meal, t, 'es-DO')).toBe(AVISO_PLATO_LEJOS_DE_PROTEINA);
        await loadLocale('fr-FR');
        expect(avisoDeCalidadDelPlato(meal, t, 'fr-FR')).not.toBe(AVISO_PLATO_LEJOS_DE_PROTEINA);
        expect(avisoDeCalidadDelPlato({}, t, 'fr-FR')).toBe('');
    });

    it('ahorro: la sugerencia de marca con sus piezas y la sustitución por el léxico', async () => {
        const fmt = (v) => `RD$${v}`;
        const s = { type: 'marca', item: 'Pechuga de pollo', brand: 'Wala', presentation: 'Funda 650 gr', price_rd: 47, text: 'Pechuga de pollo: la opción más económica del súper es Wala Funda 650 gr (RD$47)' };
        expect(sugerenciaDePresupuesto(s, t, fmt, 'es-DO')).toBe(s.text);
        await loadLocale('en-US');
        const en = sugerenciaDePresupuesto(s, t, fmt, 'en-US');
        expect(en).toContain('Chicken breast');
        expect(en).toContain('Wala Funda 650 gr');
        expect(en).toContain('RD$47');
        expect(sugerenciaDePresupuesto({ type: 'marca', text: 'viejo' }, t, fmt, 'en-US')).toBe('viejo');
        expect(sustitucionDePresupuesto('huevo → Pechuga de pollo', 'en-US')).toBe('Egg → Chicken breast');
    });

    it('frases fijas del servidor: exactas, con la marca como {app}, y lo desconocido tal cual', async () => {
        await loadLocale('en-US');
        expect(textoDelServidor('Tu plan necesita atención', t, 'en-US')).toBe('Your plan needs attention');
        expect(textoDelServidor('Abrir Bioboros', t, 'en-US')).toBe('Open Bioboros');
        expect(textoDelServidor('Un texto nuevo del servidor', t, 'en-US')).toBe('Un texto nuevo del servidor');
        expect(textoDelServidor('Tu plan necesita atención', t, 'es-DO')).toBe('Tu plan necesita atención');
        expect(TEXTOS_FIJOS_DEL_SERVIDOR.some((x) => x.includes('Bioboros'))).toBe(false);
    });

    it('observaciones del revisor: legibles o fuera', async () => {
        await loadLocale('en-US');
        const conocida = 'Día 2, almuerzo: Algunos platos se parecen a los de tus planes recientes — usa «Cambiar Plato» si quieres más variedad.';
        expect(reviewIssueLegible(conocida, t, 'en-US')).not.toContain('Algunos platos');
        expect(reviewIssueLegible('Una observación nueva del modelo.', t, 'en-US')).toBeNull();
        expect(reviewIssueLegible('Una observación nueva del modelo.', t, 'es-DO')).toBe('Una observación nueva del modelo.');
    });

    it('mensajes en prosa sin código: en español tal cual; fuera, la traducción o el genérico', () => {
        const conocidas = ['Este código ha expirado.'];
        expect(mensajeDelServidor('Este código ha expirado.', conocidas, 'fallback', (k) => `T:${k}`, 'es-DO')).toBe('Este código ha expirado.');
        expect(mensajeDelServidor('Este código ha expirado.', conocidas, 'fallback', (k) => `T:${k}`, 'en-US')).toBe('T:Este código ha expirado.');
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(mensajeDelServidor('Otra cosa', conocidas, 'fallback', (k) => k, 'en-US')).toBe('fallback');
        err.mockRestore();
        expect(mensajeDelServidor('', conocidas, 'fallback', (k) => k, 'en-US')).toBe('fallback');
    });
});

describe('3 · los nombres del diario', () => {
    const plan = { days: [{ meals: [{ name: 'Mangú con huevo', _display: { 'en-US': { name: 'Mangú with egg' } } }] }] };

    it('un plato del plan por su _display, «Comida registrada» y alimentos del catálogo', async () => {
        await loadLocale('en-US');
        expect(nombreDeRegistro('Mangú con huevo', plan, t, 'en-US')).toBe('Mangú with egg');
        expect(nombreDeRegistro('Comida registrada', plan, t, 'en-US')).toBe('Logged meal');
        expect(nombreDeRegistro('Pechuga de pollo, Arroz blanco y Huevo', plan, t, 'en-US')).toBe('Chicken breast, White rice, and Egg');
        expect(nombreDeRegistro('Lo que me comí en la boda', plan, t, 'en-US')).toBe('Lo que me comí en la boda');
        expect(nombreDeRegistro('Mangú con huevo', plan, t, 'es-DO')).toBe('Mangú con huevo');
    });
});

describe('4 · el plan del invitado', () => {
    const plan = {
        name: 'Sazón fuerte',
        days: [{ meals: [
            { name: 'Pollo con arroz' },
            { name: 'Mangú', _display: { 'en-US': { name: 'Mangú!', _provisional: true } } },
        ] }],
    };

    it('lo provisional cuenta como que falta, y la firma cambia con los platos y el idioma', () => {
        expect(faltaTraduccion(plan, 'en-US')).toBe(true);
        expect(faltaTraduccion(plan, 'es-DO')).toBe(false);
        expect(firmaDeTraduccion(plan, 'en-US')).not.toBe(firmaDeTraduccion(plan, 'fr-FR'));
    });

    it('fusiona por posición sólo si el plato sigue siendo el mismo, y el nombre del plan aparte', () => {
        const res = {
            meals: [
                { day: 0, meal: 0, name: 'Pollo con arroz', display: { name: 'Chicken with rice', description: 'd', recipe: [], ingredients: [] } },
                { day: 0, meal: 1, name: 'Otro plato que ya no está', display: { name: 'X' } },
            ],
            plan_name: 'Strong flavor', insights: null,
        };
        const f = fusionarTraduccion(plan, res, 'en-US');
        expect(f.days[0].meals[0]._display['en-US'].name).toBe('Chicken with rice');
        expect(f.days[0].meals[1]._display['en-US']._provisional).toBe(true);
        expect(f._display['en-US'].name).toBe('Strong flavor');
        expect(plan.days[0].meals[0]._display).toBeUndefined();
        expect(fusionarTraduccion(plan, { meals: [] }, 'en-US')).toBe(plan);
    });

    it('pide una vez por idioma y platos, y fusiona con el setter', async () => {
        _reiniciarParaPruebas();
        await loadLocale('en-US');
        fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({
            meals: [{ day: 0, meal: 0, name: 'Pollo con arroz', display: { name: 'Chicken with rice' } }], plan_name: null, insights: null,
        }) });
        let estado = plan;
        const setPlanData = (fn) => { estado = fn(estado); };
        await traducirPlanDelInvitado(plan, 'en-US', setPlanData);
        expect(estado.days[0].meals[0]._display['en-US'].name).toBe('Chicken with rice');
        const [url, opts] = fetchWithAuth.mock.calls[0];
        expect(url).toBe('/api/plans/guest-display');
        expect(JSON.parse(opts.body).locale).toBe('en-US');
        await traducirPlanDelInvitado(plan, 'en-US', setPlanData);
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
        await traducirPlanDelInvitado(plan, 'es-DO', setPlanData);
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    });
});

describe('5 · texto libre fuera del plan', () => {
    it('pide sólo lo que falta, una vez, y lo pinta cuando llega', async () => {
        await loadLocale('en-US');
        fetchWithAuth.mockResolvedValue({ ok: true, json: async () => ({ textos: ['Creatine', 'After training'] }) });
        const { result } = renderHook(() => useTextosTraducidos(['Creatina', 'Post-entreno', 'Creatina']));
        await waitFor(() => expect(result.current('Creatina')).toBe('Creatine'));
        expect(result.current('Post-entreno')).toBe('After training');
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
        const [url, opts] = fetchWithAuth.mock.calls[0];
        expect(url).toBe('/api/i18n/textos');
        expect(JSON.parse(opts.body)).toEqual({ locale: 'en-US', textos: ['Creatina', 'Post-entreno'] });
        const { result: otra } = renderHook(() => useTextosTraducidos(['Creatina']));
        expect(otra.current('Creatina')).toBe('Creatine');
        expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    });

    it('en español no pide nada', async () => {
        const { result } = renderHook(() => useTextosTraducidos(['Magnesio']));
        expect(result.current('Magnesio')).toBe('Magnesio');
        expect(fetchWithAuth).not.toHaveBeenCalled();
    });
});

describe('6 · anclas de las pantallas', () => {
    it('el escáner manda el idioma y pinta lo que el servidor nombró para leer', () => {
        const s = src('components/dashboard/ScanMealModal.jsx');
        expect(s).toContain("fd.append('locale', getLocale())");
        expect(src('components/dashboard/scanMealDishes.js')).toContain('it.display_name');
    });

    it('las pestañas de los días traducen el nombre que manda el servidor', () => {
        expect(src('pages/Dashboard.jsx')).toContain('if (day?.day_name) return t(day.day_name);');
    });

    it('cambiar plato no hereda el _display del plato viejo y pide la traducción nueva', () => {
        const s = src('context/AssessmentContext.jsx');
        expect(s).toContain('const { _display: _displayDelPlatoViejo, ...platoAnterior } = updatedMeals[mealIndex] || {};');
        expect(s).toContain("_display: { [_localeSwap]: { name: _nombreVisible, _provisional: true } }");
        expect(s).toContain('esperarTraduccionDelDia(dayIndex);');
        expect(s).toContain("import('../utils/traduccionInvitado')");
        expect(s).toContain('traducirPlanDelInvitado(planData, _localeDelInvitado, setPlanData)');
    });

    it('los recuerdos leen la categoría que escribe el backend (category, no categoria)', () => {
        const s = src('pages/Settings.jsx');
        expect(s).toContain("String(metadata?.category || metadata?.categoria || '')");
        expect(s).toContain('{etiquetaDeRecuerdo(fact.metadata, t)}');
    });
});
