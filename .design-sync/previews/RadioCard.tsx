import { RadioCard, ProteinIcon, FlameMacroIcon } from 'mealfit-rd-ia';

// Selectable card for single-choice flows (the assessment goal/diet pickers).
// `checked` toggles the highlighted state; `icon` takes any of the macro icons.

export const Unchecked = () => (
  <div style={{ maxWidth: 340 }}>
    <RadioCard
      name="goal"
      value="muscle"
      label="Ganar músculo"
      desc="Aumentar masa magra con superávit calórico"
      icon={ProteinIcon}
      checked={false}
      onChange={() => {}}
    />
  </div>
);

export const Checked = () => (
  <div style={{ maxWidth: 340 }}>
    <RadioCard
      name="goal"
      value="muscle"
      label="Ganar músculo"
      desc="Aumentar masa magra con superávit calórico"
      icon={ProteinIcon}
      checked={true}
      onChange={() => {}}
    />
  </div>
);

export const Group = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 340 }}>
    <RadioCard name="g" value="muscle" label="Ganar músculo" desc="Superávit + alta proteína" icon={ProteinIcon} checked onChange={() => {}} />
    <RadioCard name="g" value="lose" label="Bajar grasa" desc="Déficit calórico controlado" icon={FlameMacroIcon} checked={false} onChange={() => {}} />
  </div>
);
