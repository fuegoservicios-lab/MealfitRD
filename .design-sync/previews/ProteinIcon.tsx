import { ProteinIcon } from 'mealfit-rd-ia';

// Macro icon (mancuerna = protein/strength). Pure SVG, fills via currentColor —
// set `color` on a parent to tint it. Sized via the `size` prop (px).

export const Default = () => (
  <div style={{ color: '#3B82F6' }}>
    <ProteinIcon size={40} />
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20, color: '#0D9488' }}>
    <ProteinIcon size={16} />
    <ProteinIcon size={24} />
    <ProteinIcon size={32} />
    <ProteinIcon size={48} />
  </div>
);

export const Colors = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
    <span style={{ color: '#3B82F6' }}><ProteinIcon size={36} /></span>
    <span style={{ color: '#2DD4BF' }}><ProteinIcon size={36} /></span>
    <span style={{ color: '#F59E0B' }}><ProteinIcon size={36} /></span>
    <span style={{ color: '#F43F5E' }}><ProteinIcon size={36} /></span>
    <span style={{ color: '#0F172A' }}><ProteinIcon size={36} /></span>
  </div>
);
