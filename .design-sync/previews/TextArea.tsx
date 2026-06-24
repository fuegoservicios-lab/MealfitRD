import { TextArea } from 'mealfit-rd-ia';

// Multi-line text input — spreads native props (placeholder, rows,
// defaultValue) onto a styled <textarea>. Axis: empty vs filled.

export const Placeholder = () => (
  <div style={{ maxWidth: 360 }}>
    <TextArea
      rows={4}
      placeholder="Cuéntanos cualquier detalle adicional sobre tu alimentación…"
    />
  </div>
);

export const Filled = () => (
  <div style={{ maxWidth: 360 }}>
    <TextArea
      rows={4}
      defaultValue={
        'Me encanta el sancocho los domingos.\n' +
        'No como cerdo por motivos personales.\n' +
        'Prefiero el desayuno bien temprano.'
      }
    />
  </div>
);
