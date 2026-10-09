// AMDR adult upper bounds: National Academies (2024), Table 3-1.
// Planning reference at the plan's energy level, NOT a tolerable upper intake
// level or a personal safety allowance. Never derive one from fallback goals.
// https://www.nationalacademies.org/read/27957/chapter/5
export function macroReferences(plan, profile) {
    const age = Number(profile?.age);
    const calories = parseFloat(plan?.calories);
    const hasCondition = (values) => (Array.isArray(values) ? values : values ? [values] : [])
        .some(value => !/^(ningun[oa]|none)$/i.test(String(value).trim()));
    if (!Number.isFinite(age) || age < 19 || age > 100
        || !Number.isFinite(calories) || calories <= 0
        || hasCondition(profile?.medicalConditions) || hasCondition(profile?.medications)
        || String(profile?.otherConditions || '').trim()) return {};

    const result = {};
    for (const [key, energyShare, kcalPerGram] of [
        ['protein', 0.35, 4], ['carbs', 0.65, 4], ['fats', 0.35, 9],
    ]) {
        const goal = parseFloat(plan?.macros?.[key]);
        const grams = calories * energyShare / kcalPerGram;
        // A specialized goal above the general range needs individual review,
        // rather than a contradictory generic marker presented as its ceiling.
        if (Number.isFinite(goal) && goal > 0 && grams > goal) result[key] = grams;
    }
    return result;
}
