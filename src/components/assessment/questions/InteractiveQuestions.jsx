// [P2-4 · 2026-07-09] BARREL de re-export — split mecánico del monolito del wizard.
// Los 19 componentes Q* vivían en este archivo (~1700 LOC) SIN acople de estado
// entre sí (cada Q* consume useAssessment() de forma independiente); ahora cada
// uno vive en su propio archivo hermano (./QGender.jsx … ./QSupplements.jsx),
// el CTA compartido en ./NextButton.jsx y los helpers internos (handleActivationKey,
// DietOption, ChipOption, GoalCard, toggleArrayWithExclusiveSentinel,
// PREGNANCY_CHIP_LABELS) en ./_shared.jsx — estos últimos NO se re-exportan aquí,
// igual que antes del split (eran module-private).
// Este barrel preserva TODOS los exports históricos para no romper los imports
// existentes (InteractiveAssessmentFlow.jsx, src/__tests__/*). Imports NUEVOS
// deben apuntar DIRECTO al archivo del Q* correspondiente, no a este barrel.
export { NextButton } from './NextButton';
export { QGender } from './QGender';
export { QMeasurements } from './QMeasurements';
export { QActivityLevel } from './QActivityLevel';
export { QSchedule } from './QSchedule';
export { QSleep } from './QSleep';
export { QStress } from './QStress';
export { QHabits } from './QHabits';
export { QCookingTime } from './QCookingTime';
export { QBudget, sanitizeBudgetAmount, BUDGET_AMOUNT_MAX } from './QBudget';
export { QDietType } from './QDietType';
export { QAllergies } from './QAllergies';
export { QDislikes } from './QDislikes';
export { QMedical } from './QMedical';
export { QMainGoal } from './QMainGoal';
export { QGoalTarget } from './QGoalTarget';
export { QStruggles } from './QStruggles';
export { QMotivation } from './QMotivation';
export { QHousehold } from './QHousehold';
export { QSupplements } from './QSupplements';
export { QPlanSource } from './QPlanSource';
