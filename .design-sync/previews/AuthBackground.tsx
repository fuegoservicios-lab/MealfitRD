import { AuthBackground } from 'mealfit-rd-ia';

// Full-bleed animated login canvas (3D wireframe "molecules" over a dark teal
// field). It fills its parent via an absolutely-positioned canvas, so we give
// it a sized, relative, dark box with hidden overflow to frame the effect.

export const Default = () => (
  <div
    style={{
      position: 'relative',
      width: '100%',
      height: 380,
      background: '#0a0e1a',
      overflow: 'hidden',
      borderRadius: 12,
    }}
  >
    <AuthBackground />
  </div>
);
