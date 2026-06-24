import { Checkbox } from 'mealfit-rd-ia';

// Styled checkbox with custom box + label + optional desc. The native input
// is hidden; .checkboxCustom renders the visible box (check appears when
// `checked`). Axis: unchecked vs checked.

export const Unchecked = () => (
  <div style={{ maxWidth: 360 }}>
    <Checkbox
      name="restricciones"
      value="sin_gluten"
      label="Sin gluten"
      desc="Evitar trigo, cebada y avena no certificada"
      checked={false}
      onChange={() => {}}
    />
  </div>
);

export const Checked = () => (
  <div style={{ maxWidth: 360 }}>
    <Checkbox
      name="restricciones"
      value="sin_lactosa"
      label="Sin lactosa"
      desc="Sustituir lácteos por opciones vegetales"
      checked={true}
      onChange={() => {}}
    />
  </div>
);

export const Group = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
    <Checkbox name="alergias" value="mani" label="Maní" desc="Excluir maní y derivados" checked onChange={() => {}} />
    <Checkbox name="alergias" value="mariscos" label="Mariscos" desc="Camarones, langosta y moluscos" checked={false} onChange={() => {}} />
    <Checkbox name="alergias" value="huevo" label="Huevo" desc="Excluir huevo de las recetas" checked={false} onChange={() => {}} />
  </div>
);
