import { GuestAppearanceToggle } from 'mealfit-rd-ia';

// Inline theme picker (Sistema / Claro / Oscuro) shown in the guest account
// menu. No required props — it reads/writes the theme pref from localStorage.

export const Default = () => (
  <div style={{ maxWidth: 420 }}>
    <GuestAppearanceToggle />
  </div>
);
