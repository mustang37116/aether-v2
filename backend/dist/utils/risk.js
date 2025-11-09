// Direction-aware risk/reward calculation.
// For LONG: risk = (entry - stop) * size (if stop below entry), reward = (target - entry) * size.
// For SHORT: risk = (stop - entry) * size (if stop above entry), reward = (entry - target) * size.
// Always returns positive risk/reward magnitudes; R = reward / risk.
export function calcRiskRewardR(entry, stop, target, size, direction = 'LONG') {
    const isShort = direction === 'SHORT';
    const rawRisk = isShort ? (stop - entry) : (entry - stop);
    const rawReward = isShort ? (entry - target) : (target - entry);
    const risk = Math.abs(rawRisk) * size;
    const reward = Math.abs(rawReward) * size;
    const R = risk === 0 ? null : reward / risk;
    return { risk, reward, R };
}
