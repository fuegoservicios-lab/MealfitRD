import { MicronutrientPanel } from 'mealfit-rd-ia';

// Diagnostic panel: estimates the micronutrients a plan's meals deliver vs. the
// daily target, each gap stated in plain language with a severity chip. Driven
// by `report.gaps[]` and optional `advice.items[]` (supplement suggestions).

const report = {
  gaps: [
    { nutriente: 'Vitamina D', valor: 4.4, unidad: 'mcg', piso: 15, status: 'bajo' },
    { nutriente: 'Calcio', valor: 828.7, unidad: 'mg', piso: 1000, status: 'bajo' },
    { nutriente: 'Magnesio', valor: 395.4, unidad: 'mg', piso: 420, status: 'casi' },
  ],
};

const advice = {
  items: [
    {
      nutriente: 'Vitamina D',
      dosis_sugerida: '600–800 UI/día (15–20 mcg)',
      suplemento: 'Vitamina D3',
      primero_alimentos: 'pescado graso (salmón/sardina 1–2×/sem), yema de huevo, lácteo fortificado, sol 10–15 min',
    },
    {
      nutriente: 'Calcio',
      dosis_sugerida: '500 mg/día solo si no alcanzas con la dieta',
      suplemento: 'Calcio (citrato o carbonato)',
      primero_alimentos: 'yogur/queso, sardina con espina, hoja verde, sésamo/ajonjolí, tofu',
    },
  ],
};

export const WithSuggestions = () => (
  <div style={{ maxWidth: 420 }}>
    <MicronutrientPanel report={report} advice={advice} planId="demo" onAsk={() => {}} />
  </div>
);

export const GapsOnly = () => (
  <div style={{ maxWidth: 420 }}>
    <MicronutrientPanel
      report={{ gaps: report.gaps.slice(0, 2) }}
      advice={{ items: [] }}
      planId="demo2"
    />
  </div>
);
