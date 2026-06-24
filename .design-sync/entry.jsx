/* design-sync barrel entry — curated MealfitRD UI subset (23 components).
   esbuild bundles this into _ds_bundle.js → window.MealfitUI.<Name>.
   Scope is controlled here (only these import-clean, presentational pieces)
   and mirrored in .design-sync/config.json's componentSrcMap. */

// ── Icons (default exports) ───────────────────────────────────────────────
export { default as ProteinIcon } from '../src/components/icons/ProteinIcon.jsx';
export { default as FlameMacroIcon } from '../src/components/icons/FlameMacroIcon.jsx';
export { default as FatDropIcon } from '../src/components/icons/FatDropIcon.jsx';
export { default as WheatFilledIcon } from '../src/components/icons/WheatFilledIcon.jsx';
export { default as RecipesIcon } from '../src/components/icons/RecipesIcon.jsx';
export { default as AgentIcon } from '../src/components/icons/AgentIcon.jsx';

// ── Form UI primitives (named exports) ────────────────────────────────────
export { Label, Input, Select, RadioCard, Checkbox, TextArea } from '../src/components/common/FormUI.jsx';

// ── Common ────────────────────────────────────────────────────────────────
export { default as Modal } from '../src/components/common/Modal.jsx';
export { default as EmptyState } from '../src/components/common/EmptyState.jsx';
export { default as OptionPickerModal } from '../src/components/common/OptionPickerModal.jsx';

// ── Dashboard widgets ─────────────────────────────────────────────────────
export { default as MicronutrientPanel } from '../src/components/dashboard/MicronutrientPanel.jsx';
export { default as RestockNudge } from '../src/components/dashboard/RestockNudge.jsx';
export { default as GuestAppearanceToggle } from '../src/components/dashboard/GuestAppearanceToggle.jsx';
export { default as LogoutConfirmModal } from '../src/components/dashboard/LogoutConfirmModal.jsx';

// ── Avatars ─────────────────────────────────────────────────────────────--
export { default as BotAvatar } from '../src/components/agent/BotAvatar.jsx';
export { MinimalAvatar } from '../src/components/avatars/minimalAvatars.jsx';

// ── Other presentational ──────────────────────────────────────────────────
export { default as HowItWorks } from '../src/components/home/HowItWorks.jsx';
export { default as AuthBackground } from '../src/components/auth/AuthBackground.jsx';
