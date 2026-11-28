import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saludoDelCoach } from '../utils/saludoDelCoach';
import { extraerPerfilAlimentario } from '../utils/filtroAlimentosSaludo';
import { generateIntelligentWelcome } from '../pages/AgentPage';

const t = (s, v = {}) => Object.entries(v).reduce((a, [k, x]) => a.split(`{${k}}`).join(String(x)), s);
const METAS = { calories: 2100, protein: 140, carbs: 230, fats: 60 };
const SEMILLAS = Array.from({ length: 16 }, (_, i) => `seed-${i}`);

function barrerSaludos({ perfil, resumen, horas = [1, 8, 13, 16, 20] }) {
    const out = [];
    for (const hora of horas) {
        for (const semilla of SEMILLAS) {
            out.push(saludoDelCoach({ hora, nombre: 'Angelo', resumen, perfil, semilla, t }));
        }
    }
    return out;
}

describe('Seguridad de alérgenos, dietas y gustos en saludoDelCoach', () => {
    const resumenProteinaGrande = {
        metas: METAS,
        totales: { calories: 950, protein: 42, carbs: 110, fats: 30 }, // faltan 98 g
        comidas: ['almuerzo'],
        nombresComidas: ['Arroz con habichuelas'],
    };
    const resumenProteinaModerada = {
        metas: METAS,
        totales: { calories: 1200, protein: 92, carbs: 140, fats: 35 }, // faltan 48 g
        comidas: ['desayuno', 'almuerzo'],
        nombresComidas: ['Avena con guineo'],
    };
    const resumenProteinaPequena = {
        metas: METAS,
        totales: { calories: 1450, protein: 112, carbs: 160, fats: 40 }, // faltan 28 g
        comidas: ['desayuno', 'almuerzo'],
        nombresComidas: ['Ensalada'],
    };
    const resumenCaloriasJustas = {
        metas: METAS,
        totales: { calories: 1900, protein: 100, carbs: 210, fats: 52 }, // quedan 200 kcal, faltan 40 g
        comidas: ['desayuno', 'almuerzo'],
        nombresComidas: ['Pasta'],
    };

    it('alérgico/intolerante al pescado (caso exacto producción) NUNCA recibe pescado ni atún', () => {
        const perfil = extraerPerfilAlimentario({
            health_profile: {
                allergies: ['Mariscos', 'Pescado', 'Pescado; intolerancia al pescado'],
                medicalConditions: ['Ninguna'],
                dietType: 'balanced',
            },
        });
        for (const resumen of [resumenProteinaGrande, resumenProteinaModerada, resumenProteinaPequena, resumenCaloriasJustas]) {
            const mensajes = barrerSaludos({ perfil, resumen });
            for (const m of mensajes) {
                expect(m).not.toMatch(/pescad|at[uú]n|salm[oó]n|marisc|camar[oó]n/i);
            }
        }
    });

    it('alérgico al huevo NUNCA recibe huevos ni claras (ni de madrugada ni con proteína corta)', () => {
        const perfil = extraerPerfilAlimentario({ health_profile: { allergies: ['Huevo'] } });
        for (const resumen of [resumenProteinaGrande, resumenProteinaModerada, resumenProteinaPequena, resumenCaloriasJustas]) {
            for (const m of barrerSaludos({ perfil, resumen })) {
                expect(m).not.toMatch(/huevo|clara/i);
            }
        }
    });

    it('alérgico/intolerante a lácteos o lactosa NUNCA recibe yogur, leche ni queso', () => {
        for (const chip of ['Lacteos', 'Lactosa']) {
            const perfil = extraerPerfilAlimentario({ health_profile: { allergies: [chip] } });
            for (const resumen of [resumenProteinaGrande, resumenProteinaModerada, resumenProteinaPequena, resumenCaloriasJustas]) {
                for (const m of barrerSaludos({ perfil, resumen })) {
                    expect(m).not.toMatch(/yogur|leche|queso|cottage/i);
                }
            }
        }
    });

    it('dieta vegana NUNCA recibe carnes, aves, pescado, huevo ni lácteos', () => {
        const perfil = extraerPerfilAlimentario({ health_profile: { dietType: 'vegan', allergies: ['Ninguna'] } });
        for (const resumen of [resumenProteinaGrande, resumenProteinaModerada, resumenProteinaPequena, resumenCaloriasJustas]) {
            for (const m of barrerSaludos({ perfil, resumen })) {
                expect(m).not.toMatch(/pollo|pavo|\bres\b|carne|pescad|at[uú]n|huevo|clara|yogur|leche|queso|cottage/i);
            }
        }
    });

    it('dieta vegetariana NUNCA recibe carnes, aves ni pescado', () => {
        const perfil = extraerPerfilAlimentario({ health_profile: { dietType: 'vegetarian', allergies: ['Ninguna'] } });
        for (const resumen of [resumenProteinaGrande, resumenProteinaModerada, resumenProteinaPequena, resumenCaloriasJustas]) {
            for (const m of barrerSaludos({ perfil, resumen })) {
                expect(m).not.toMatch(/pollo|pavo|\bres\b|carne|pescad|at[uú]n/i);
            }
        }
    });

    it('respeta rechazos (dislikes y otherDislikes)', () => {
        const perfil = extraerPerfilAlimentario({
            health_profile: { allergies: ['Ninguna'], dislikes: ['Pescado'], otherDislikes: 'no me gusta el pollo ni el pavo' },
        });
        for (const m of barrerSaludos({ perfil, resumen: resumenProteinaModerada })) {
            expect(m).not.toMatch(/pescad|at[uú]n|pollo|pavo/i);
        }
    });

    it('modo fail-secure ante alergia desconocida o condición delicada (no inventa nombres de alimentos)', () => {
        const perfilDesconocida = extraerPerfilAlimentario({
            health_profile: { otherAllergies: 'Colorante comestible' },
        });
        const perfilDelicada = extraerPerfilAlimentario({
            health_profile: { allergies: ['Pescado'], medicalConditions: ['Cirugía Bariátrica'] },
        });
        for (const perfil of [perfilDesconocida, perfilDelicada]) {
            for (const m of barrerSaludos({ perfil, resumen: resumenProteinaModerada })) {
                expect(m).not.toMatch(/pollo|pavo|pescad|at[uú]n|huevo|yogur|leche|queso|tofu|lentej|fruta|edamame/i);
            }
        }
    });

    it('evita repetir una proteína ya consumida hoy si hay otras opciones seguras', () => {
        const perfil = extraerPerfilAlimentario({
            health_profile: { allergies: ['Pescado', 'Huevo', 'Lacteos', 'Soya', 'Legumbres'], dislikes: ['Res'] },
        });
        // Solo quedan pollo y pavo seguros; si ya comió pollo, debe sugerir pavo y no pollo
        const resumenConPollo = {
            ...resumenProteinaModerada,
            nombresComidas: ['Pechuga de pollo con arroz'],
        };
        const m = saludoDelCoach({ hora: 19, nombre: 'Angelo', resumen: resumenConPollo, perfil, semilla: 's1', t });
        expect(m).toMatch(/pavo/i);
        expect(m).not.toMatch(/pollo/i);
    });
});

describe('Naturalidad e inteligencia contextual en saludoDelCoach', () => {
    it('día en blanco a las 20:00 NO grita «faltan 140 g de proteína»: reconoce que el diario sigue vacío', () => {
        const resumenVacio = {
            metas: METAS,
            totales: { calories: 0, protein: 0, carbs: 0, fats: 0 },
            comidas: [],
            nombresComidas: [],
        };
        for (const semilla of SEMILLAS.slice(0, 6)) {
            const m = saludoDelCoach({ hora: 20, nombre: 'Angelo', resumen: resumenVacio, semilla, t });
            expect(m).not.toMatch(/140 g|corto de proteína/i);
            expect(m).toMatch(/blanco|anotadas|cenar|cenaste/i);
            expect(m).toMatch(/\?/);
        }
    });

    it('brecha gigante de 98 g (con comidas anotadas) es realista y ofrece cuadrar si faltó anotar algo', () => {
        const resumen98 = {
            metas: METAS,
            totales: { calories: 900, protein: 42, carbs: 100, fats: 30 },
            comidas: ['almuerzo'],
            nombresComidas: ['Arroz con pollo'],
        };
        const m = saludoDelCoach({ hora: 20, nombre: 'Angelo', resumen: resumen98, semilla: 's1', t });
        expect(m).toContain('98 g');
        expect(m).toMatch(/sin anotar|pásamela|cuadramos/i);
        expect(m).not.toMatch(/son lo más rápido para cerrarla/i);
    });

    it('presupuesto calórico justo + proteína pendiente avisa para no pasarse de calorías', () => {
        const resumenJusto = {
            metas: METAS,
            totales: { calories: 1900, protein: 100, carbs: 210, fats: 52 },
            comidas: ['desayuno', 'almuerzo'],
            nombresComidas: ['Pasta'],
        };
        const m = saludoDelCoach({ hora: 19, nombre: 'Angelo', resumen: resumenJusto, semilla: 's1', t });
        expect(m).toMatch(/200 kcal/);
        expect(m).toMatch(/40 g/);
        expect(m).toMatch(/magr/i);
    });

    describe('integración end-to-end con generateIntelligentWelcome', () => {
        beforeEach(() => {
            window.localStorage.clear();
            vi.useFakeTimers();
            vi.setSystemTime(new Date(2026, 10, 22, 20, 0, 0));
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it('generateIntelligentWelcome respeta alergias del perfil y del formulario', () => {
            const userProfile = {
                id: 'u-fish-allergy',
                full_name: 'Carlos',
                plan_mode: 'tracking',
                health_profile: {
                    allergies: ['Mariscos', 'Pescado'],
                    otherAllergies: 'intolerancia al pescado',
                },
            };
            const resumen = {
                metas: { ok: true, calories: 2100, macros: { protein: 140, carbs: 230, fats: 60 } },
                totales: { calories: 1000, protein: 42, carbs: 120, fats: 30 },
                comidas: ['almuerzo'],
            };
            const msg = generateIntelligentWelcome(userProfile, { allergies: ['Pescado'] }, null, resumen);
            expect(msg).not.toMatch(/pescad|at[uú]n|salm[oó]n|marisc/i);
            expect(msg).toContain('98 g');
        });
    });
});
