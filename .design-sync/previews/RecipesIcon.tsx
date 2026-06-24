import { RecipesIcon } from 'mealfit-rd-ia';

// Open cookbook icon (lucide-compatible). Strokes use `color` which defaults
// to currentColor — set `color` on a parent to tint. Supports `strokeWidth`.

export const Default = () => (
  <div style={{ color: '#0D9488' }}>
    <RecipesIcon size={40} />
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20, color: '#0D9488' }}>
    <RecipesIcon size={16} />
    <RecipesIcon size={24} />
    <RecipesIcon size={32} />
    <RecipesIcon size={48} />
  </div>
);

export const Colors = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
    <span style={{ color: '#2DD4BF' }}><RecipesIcon size={36} /></span>
    <span style={{ color: '#3B82F6' }}><RecipesIcon size={36} /></span>
    <span style={{ color: '#F59E0B' }}><RecipesIcon size={36} /></span>
    <span style={{ color: '#F43F5E' }}><RecipesIcon size={36} /></span>
    <span style={{ color: '#0F172A' }}><RecipesIcon size={36} /></span>
  </div>
);

export const Strokes = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 20, color: '#0F172A' }}>
    <RecipesIcon size={40} strokeWidth={1} />
    <RecipesIcon size={40} strokeWidth={2} />
    <RecipesIcon size={40} strokeWidth={3} />
  </div>
);
