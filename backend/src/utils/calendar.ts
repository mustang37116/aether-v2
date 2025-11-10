import { Trade } from '@prisma/client';
import { computeDirectionalPnl } from './pnl.js';

export function groupPnLByDay(trades: Trade[]) {
  const map: Record<string, number> = {};
  for (const t of trades) {
    if (!t.exitPrice) continue;
    const day = t.entryTime.toISOString().split('T')[0];
  const pnl = computeDirectionalPnl(Number(t.entryPrice), Number(t.exitPrice), Number(t.size), (t as any).direction || 'LONG', (t as any).symbol, 0);
    map[day] = (map[day] || 0) + pnl;
  }
  return map;
}
