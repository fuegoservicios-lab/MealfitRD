import { FatDropIcon } from 'mealfit-rd-ia';

// Two-tone droplet for the Fats macro chip. Body fills via currentColor —
// set `color` on a parent to tint. Glossy reflection is the `highlight` prop.

export const Default = () => (
  <div style={{ color: '#F59E0B' }}>
    <FatDropIcon size={40} />
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20, color: '#F59E0B' }}>
    <FatDropIcon size={16} />
    <FatDropIcon size={24} />
    <FatDropIcon size={32} />
    <FatDropIcon size={48} />
  </div>
);

export const Colors = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
    <span style={{ color: '#F59E0B' }}><FatDropIcon size={36} /></span>
    <span style={{ color: '#2DD4BF' }}><FatDropIcon size={36} /></span>
    <span style={{ color: '#3B82F6' }}><FatDropIcon size={36} /></span>
    <span style={{ color: '#F43F5E' }}><FatDropIcon size={36} /></span>
    <span style={{ color: '#0F172A' }}><FatDropIcon size={36} /></span>
  </div>
);

export const Highlight = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20, color: '#3B82F6' }}>
    <FatDropIcon size={40} highlight="rgba(255,255,255,0.5)" />
    <FatDropIcon size={40} highlight="rgba(255,255,255,0.85)" />
    <FatDropIcon size={40} highlight="rgba(255,255,255,0.15)" />
  </div>
);
