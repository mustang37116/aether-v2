import { Trade } from '@prisma/client';

export function groupPnLByDay(trades: Trade[]) {
  const map: Record<string, number> = {};
  for (const t of trades) {
    if (!t.exitPrice) continue;
    const day = t.entryTime.toISOString().split('T')[0];
    const pnl = (Number(t.exitPrice) - Number(t.entryPrice)) * Number(t.size);
    map[day] = (map[day] || 0) + pnl;
  }
  return map;
}
