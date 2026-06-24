import { MinimalAvatar } from 'mealfit-rd-ia';

// Minimalist profile avatars (Anthropic-style): a warm color disc with a simple
// cream geometric mark. Props `{ id, size=48, className, style }`. `id` matches
// one of the 12 built-in avatar ids (clay-disc, sage-ring, slate-half, ...).

const FIRST_SIX = ['clay-disc', 'sage-ring', 'slate-half', 'amber-moon', 'plum-arc', 'teal-tri'];
const LAST_SIX = ['rust-dots', 'dusty-tri', 'sand-plus', 'moss-target', 'rose-bars', 'steel-pie'];

export const Gallery = () => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 14,
      justifyContent: 'center',
      padding: 20,
      maxWidth: 460,
    }}
  >
    {FIRST_SIX.map((id) => (
      <MinimalAvatar key={id} id={id} size={56} />
    ))}
  </div>
);

export const MoreAvatars = () => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 14,
      justifyContent: 'center',
      padding: 20,
      maxWidth: 460,
    }}
  >
    {LAST_SIX.map((id) => (
      <MinimalAvatar key={id} id={id} size={56} />
    ))}
  </div>
);

export const Sizes = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      padding: 20,
      maxWidth: 460,
    }}
  >
    <MinimalAvatar id="clay-disc" size={32} />
    <MinimalAvatar id="sage-ring" size={48} />
    <MinimalAvatar id="amber-moon" size={64} />
    <MinimalAvatar id="teal-tri" size={88} />
  </div>
);
