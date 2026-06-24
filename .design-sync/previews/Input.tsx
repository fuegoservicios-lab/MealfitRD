import { Input } from 'mealfit-rd-ia';

// Text input primitive — spreads native props (placeholder, defaultValue,
// type) onto a styled <input>. Axis: empty/placeholder vs filled vs typed.

export const Placeholder = () => (
  <div style={{ maxWidth: 360 }}>
    <Input placeholder="Ej: María Rodríguez" />
  </div>
);

export const Filled = () => (
  <div style={{ maxWidth: 360 }}>
    <Input defaultValue="Juan Carlos Peña" />
  </div>
);

export const Email = () => (
  <div style={{ maxWidth: 360 }}>
    <Input type="email" defaultValue="maria@correo.com" />
  </div>
);

export const Number = () => (
  <div style={{ maxWidth: 360 }}>
    <Input type="number" defaultValue={72} />
  </div>
);
