import { HowItWorks } from 'mealfit-rd-ia';

// Marketing section "Así funciona tu transformación" — no props. Wide layout,
// so we cap its width so the card frames the four-step process grid.

export const Default = () => (
  <div style={{ maxWidth: 920 }}>
    <HowItWorks />
  </div>
);
