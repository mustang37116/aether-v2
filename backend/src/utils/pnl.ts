// Utilities for PnL with instrument point value multipliers

export function futuresPointValue(symbol?: string): number {
  const s = (symbol || '').toUpperCase();
  // Common CME equity index futures (mini/micro)
  if (s.startsWith('MES')) return 5;   // Micro E-mini S&P 500
  if (s.startsWith('ES')) return 50;   // E-mini S&P 500
  if (s.startsWith('MNQ')) return 2;   // Micro E-mini Nasdaq-100
  if (s.startsWith('NQ')) return 20;   // E-mini Nasdaq-100
  if (s.startsWith('MYM')) return 0.5; // Micro E-mini Dow
  if (s.startsWith('YM')) return 5;    // E-mini Dow
  if (s.startsWith('M2K')) return 5;   // Micro E-mini Russell 2000
  if (s.startsWith('RTY')) return 50;  // E-mini Russell 2000
  // Topstep "MET" family observed in CSV (e.g., METX5 -> normalized METX25.CME): ~$0.10 per point
  if (s.startsWith('MET')) return 0.1;
  // Default equity/crypto/forex stocks behave as $1 per point
  return 1;
}

export function computeDirectionalPnl(entry: number, exit: number, qty: number, direction: 'LONG'|'SHORT'|null|undefined, symbol?: string, fees?: number) {
  const dir = direction === 'SHORT' ? -1 : 1;
  const pv = futuresPointValue(symbol);
  const gross = dir * (Number(exit) - Number(entry)) * Number(qty) * pv;
  return gross - Number(fees || 0);
}
