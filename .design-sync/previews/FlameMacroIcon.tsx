import { FlameMacroIcon } from 'mealfit-rd-ia';

// Two-tone flame for the Calories macro chip. Body fills via currentColor —
// set `color` on a parent to tint. Hot core highlight is the `highlight` prop.

export const Default = () => (
  <div style={{ color: '#F59E0B' }}>
    <FlameMacroIcon size={40} />
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20, color: '#F59E0B' }}>
    <FlameMacroIcon size={16} />
    <FlameMacroIcon size={24} />
    <FlameMacroIcon size={32} />
    <FlameMacroIcon size={48} />
  </div>
);

export const Colors = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
    <span style={{ color: '#F59E0B' }}><FlameMacroIcon size={36} /></span>
    <span style={{ color: '#F43F5E' }}><FlameMacroIcon size={36} /></span>
    <span style={{ color: '#2DD4BF' }}><FlameMacroIcon size={36} /></span>
    <span style={{ color: '#3B82F6' }}><FlameMacroIcon size={36} /></span>
    <span style={{ color: '#0F172A' }}><FlameMacroIcon size={36} /></span>
  </div>
);

export const Highlight = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20, color: '#F43F5E' }}>
    <FlameMacroIcon size={40} highlight="rgba(255,255,255,0.55)" />
    <FlameMacroIcon size={40} highlight="rgba(255,224,130,0.9)" />
    <FlameMacroIcon size={40} highlight="rgba(255,255,255,0.15)" />
  </div>
);
