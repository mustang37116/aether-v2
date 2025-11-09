export function calcRiskRewardR(entry: number, stop: number, target: number, size: number) {
  const risk = Math.abs(entry - stop) * size;
  const reward = Math.abs(target - entry) * size;
  const R = risk === 0 ? null : reward / risk;
  return { risk, reward, R };
}
