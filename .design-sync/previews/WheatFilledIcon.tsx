import { WheatFilledIcon } from 'mealfit-rd-ia';

// Filled wheat sprig for the Carbs macro chip. Grain leaves fill via
// currentColor — set `color` on a parent to tint. The stem is a fixed
// bright green; the leaf veins are the `vein` prop (dark, for contrast).

export const Default = () => (
  <div style={{ color: '#10B981' }}>
    <WheatFilledIcon size={40} />
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20, color: '#10B981' }}>
    <WheatFilledIcon size={16} />
    <WheatFilledIcon size={24} />
    <WheatFilledIcon size={32} />
    <WheatFilledIcon size={48} />
  </div>
);

export const Colors = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
    <span style={{ color: '#10B981' }}><WheatFilledIcon size={36} /></span>
    <span style={{ color: '#2DD4BF' }}><WheatFilledIcon size={36} /></span>
    <span style={{ color: '#F59E0B' }}><WheatFilledIcon size={36} /></span>
    <span style={{ color: '#84CC16' }}><WheatFilledIcon size={36} /></span>
  </div>
);

export const Veins = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20, color: '#34D399' }}>
    <WheatFilledIcon size={40} vein="#022C22" />
    <WheatFilledIcon size={40} vein="#047857" />
    <WheatFilledIcon size={40} vein="#FFFFFF" />
  </div>
);
