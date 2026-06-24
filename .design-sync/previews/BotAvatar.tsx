import { BotAvatar } from 'mealfit-rd-ia';

// Agent avatar: a glossy 3D orb (SVG). Props `{ size=36, float, thinking,
// style, className }`. `thinking` animates the antenna glow + pupils;
// `float` adds a subtle bob. Centered with padding so the orb breathes.

export const Default = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 24, maxWidth: 460 }}>
    <BotAvatar size={56} />
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 28, padding: 24, maxWidth: 460 }}>
    <BotAvatar size={36} />
    <BotAvatar size={56} />
    <BotAvatar size={80} />
  </div>
);

export const Thinking = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 24, maxWidth: 460 }}>
    <BotAvatar size={64} thinking={true} />
  </div>
);
