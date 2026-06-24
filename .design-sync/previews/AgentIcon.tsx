import { AgentIcon } from 'mealfit-rd-ia';

// Robot "Agent" icon (lucide-compatible). Strokes + filled eyes use `color`
// which defaults to currentColor — set `color` on a parent to tint. Supports
// `strokeWidth`.

export const Default = () => (
  <div style={{ color: '#3B82F6' }}>
    <AgentIcon size={40} />
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20, color: '#3B82F6' }}>
    <AgentIcon size={16} />
    <AgentIcon size={24} />
    <AgentIcon size={32} />
    <AgentIcon size={48} />
  </div>
);

export const Colors = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
    <span style={{ color: '#3B82F6' }}><AgentIcon size={36} /></span>
    <span style={{ color: '#2DD4BF' }}><AgentIcon size={36} /></span>
    <span style={{ color: '#F59E0B' }}><AgentIcon size={36} /></span>
    <span style={{ color: '#F43F5E' }}><AgentIcon size={36} /></span>
    <span style={{ color: '#0F172A' }}><AgentIcon size={36} /></span>
  </div>
);

export const Strokes = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20, color: '#0F172A' }}>
    <AgentIcon size={40} strokeWidth={1.5} />
    <AgentIcon size={40} strokeWidth={2} />
    <AgentIcon size={40} strokeWidth={2.6} />
  </div>
);
