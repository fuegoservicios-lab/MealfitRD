// [P1-PLAN-LOTE-412 · 2026-09-27] El saludo del coach habla de TU día, no solo de la hora.
//
// El dueño (captura a la 1:47): «¡Buenas madrugadas! A esta hora lo ideal es descansar, así que no te recomendaré
// comidas pesadas. ¡Cuéntame si puedo ayudarte en algo más!» — «¿puedes hacerlos más versátiles, que se sientan más
// humanos e inteligentes?». Era una plantilla: saludo de la hora + una de tres frases fijas por franja + «Seguimos
// enfocados en tu meta de…», sin mirar nada del día, y a veces sermoneaba. Ahora el saludo:
//   · usa lo que llevas hoy (lo mismo que leen los atajos del 411): te pasaste, vas alto de grasa, te falta proteína,
//     todavía no anotaste nada, vas redondo…, con TUS números;
//   · no sermonea de madrugada: da algo útil (qué comer si hay hambre de verdad);
//   · en modo plan nombra el plato que toca solo si esa comida no está ya registrada;
//   · cierra con una invitación concreta de la franja, y es neutro en género;
//   · varía, pero de forma estable: la misma semilla (usuario, día, media hora) da el mismo texto, así que no «salta»
//     cuando llegan los datos si no cambiaron.
import { describe, it, expect } from 'vitest';
import { saludoDelCoach } from '../utils/saludoDelCoach';

const t = (s, v = {}) => Object.entries(v).reduce((a, [k, x]) => a.split(`{${k}}`).join(String(x)), s);
const metas = { calories: 2050, protein: 134, carbs: 251, fats: 57 };
const saludo = (o) => saludoDelCoach({ t, nombre: 'Angelo', semilla: 's1', ...o });

describe('[412] de madrugada', () => {
    it('no sermonea, da algo útil, pregunta y es neutro en género', () => {
        for (const semilla of ['a', 'b', 'c', 'd', 'e', 'f']) {
            const s = saludo({ hora: 1, semilla });
            expect(s).not.toMatch(/lo ideal es descansar|no te recomendaré|despiert[oa]/i);
            expect(s).toMatch(/\?/);
            expect(s).toMatch(/ligero|yogur|fruta|huevo/i);
        }
    });
});

describe('[412] con los números del día', () => {
    it('te pasaste de la meta: lo dice sin drama y con la cifra', () => {
        const s = saludo({ hora: 21, resumen: { metas, totales: { calories: 2400, protein: 130, carbs: 250, fats: 60 }, comidas: ['desayuno', 'almuerzo', 'cena'] } });
        expect(s).toContain('350 kcal');
        expect(s).toMatch(/meta/);
    });

    it('alto de grasa: la cifra y qué hacer', () => {
        const s = saludo({ hora: 16, resumen: { metas, totales: { calories: 1367, protein: 88, carbs: 82, fats: 75 }, comidas: ['desayuno', 'almuerzo'] } });
        expect(s).toMatch(/75 de 57 g/);
        expect(s).toMatch(/plancha|horno|hervido|fritura/);
    });

    it('proteína corta por la tarde: cuánto falta y con qué', () => {
        const s = saludo({ hora: 17, resumen: { metas, totales: { calories: 1200, protein: 93, carbs: 140, fats: 40 }, comidas: ['desayuno', 'almuerzo'] } });
        expect(s).toMatch(/41 g/);
        expect(s).toMatch(/proteína/);
    });

    it('nada anotado a mediodía: lo dice e invita a almorzar/anotar', () => {
        const s = saludo({ hora: 13, resumen: { metas, totales: { calories: 0, protein: 0, carbs: 0, fats: 0 }, comidas: [] } });
        expect(s).toMatch(/todavía/i);
        expect(s).toMatch(/almor/);
        expect(s).toMatch(/\?/);
    });

    it('de noche y en su sitio: lo celebra', () => {
        const s = saludo({ hora: 21, resumen: { metas, totales: { calories: 2000, protein: 130, carbs: 240, fats: 55 }, comidas: ['desayuno', 'almuerzo', 'cena'] } });
        expect(s).toMatch(/2000 de 2050 kcal|2,000 de 2,050|2.000 de 2.050/);
    });
});

describe('[412] el plan', () => {
    it('nombra el plato que toca si esa comida no está registrada', () => {
        const s = saludo({ hora: 13, plato: 'Moro de guandules con pollo', resumen: { metas, totales: { calories: 400, protein: 30, carbs: 40, fats: 10 }, comidas: ['desayuno'] } });
        expect(s).toContain('**Moro de guandules con pollo**');
    });

    it('si ya la registró, no la recita', () => {
        const s = saludo({ hora: 13, plato: 'Moro de guandules con pollo', resumen: { metas, totales: { calories: 900, protein: 60, carbs: 90, fats: 25 }, comidas: ['desayuno', 'almuerzo'] } });
        expect(s).not.toContain('Moro de guandules');
    });

    it('en modo contador nunca nombra platos (aunque los pasen)', () => {
        expect(saludo({ hora: 13, modoContador: true, plato: 'Moro de guandules con pollo' })).not.toContain('Moro');
    });
});

describe('[412] forma', () => {
    it('sin nombre no deja comas colgando; con nombre lo usa', () => {
        for (const hora of [1, 8, 13, 17, 21]) {
            const sin = saludoDelCoach({ t, hora, semilla: 'x' });
            expect(sin).not.toMatch(/,\s*[!?.]|¡\s*!|\s{2,}|^\s|\s$/);
            expect(saludo({ hora })).toContain('Angelo');
        }
    });

    it('estable con la misma semilla y variado entre semillas', () => {
        const r = { metas, totales: { calories: 900, protein: 50, carbs: 100, fats: 20 }, comidas: ['desayuno'] };
        expect(saludo({ hora: 15, resumen: r, semilla: 'k' })).toBe(saludo({ hora: 15, resumen: r, semilla: 'k' }));
        const distintos = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((semilla) => saludo({ hora: 15, resumen: r, semilla })));
        expect(distintos.size).toBeGreaterThan(2);
    });
});
