import { Select } from 'mealfit-rd-ia';

// Dropdown primitive — wraps a styled <select> with a custom chevron.
// Pass <option> children and a defaultValue. Axis: which option is selected.

export const Objetivo = () => (
  <div style={{ maxWidth: 360 }}>
    <Select defaultValue="bajar">
      <option value="bajar">Bajar grasa</option>
      <option value="ganar">Ganar músculo</option>
      <option value="mantener">Mantener peso</option>
    </Select>
  </div>
);

export const ActividadFisica = () => (
  <div style={{ maxWidth: 360 }}>
    <Select defaultValue="moderado">
      <option value="sedentario">Sedentario</option>
      <option value="ligero">Actividad ligera</option>
      <option value="moderado">Actividad moderada</option>
      <option value="intenso">Muy activo</option>
    </Select>
  </div>
);

export const Placeholder = () => (
  <div style={{ maxWidth: 360 }}>
    <Select defaultValue="">
      <option value="" disabled>Selecciona una opción…</option>
      <option value="desayuno">Desayuno</option>
      <option value="almuerzo">Almuerzo</option>
      <option value="cena">Cena</option>
    </Select>
  </div>
);
