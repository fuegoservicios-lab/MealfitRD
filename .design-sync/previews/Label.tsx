import { Label, Input } from 'mealfit-rd-ia';

// Form field label — the styled <label> used above every assessment input.
// Shown in real usage (paired with an Input) since a bare label has no
// meaningful state axis on its own.

export const WithInput = () => (
  <div style={{ maxWidth: 360 }}>
    <Label htmlFor="nombre">Nombre completo</Label>
    <Input id="nombre" placeholder="Ej: María Rodríguez" />
  </div>
);

export const RequiredField = () => (
  <div style={{ maxWidth: 360 }}>
    <Label htmlFor="peso">Peso actual (kg)</Label>
    <Input id="peso" type="number" defaultValue={68} />
  </div>
);

export const Standalone = () => (
  <div style={{ maxWidth: 360 }}>
    <Label htmlFor="objetivo">¿Cuál es tu objetivo?</Label>
  </div>
);
