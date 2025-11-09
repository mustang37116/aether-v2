export function calcRiskRewardR(entry: number, stop: number, target: number, size: number, direction: 'LONG'|'SHORT' = 'LONG') {
  const isShort = direction === 'SHORT';
  const rawRisk = isShort ? (stop - entry) : (entry - stop);
  const rawReward = isShort ? (entry - target) : (target - entry);
  const risk = Math.abs(rawRisk) * size;
  const reward = Math.abs(rawReward) * size;
  const R = risk === 0 ? null : reward / risk;
  return { risk, reward, R };
}
