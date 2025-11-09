export function calcRiskRewardR(entry, stop, target, size) {
    const risk = Math.abs(entry - stop) * size;
    const reward = Math.abs(target - entry) * size;
    const R = risk === 0 ? null : reward / risk;
    return { risk, reward, R };
}
