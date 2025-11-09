import { prisma } from '../prisma.js';

type RateCacheKey = `${string}|${string}|${string}`; // yyyy-mm-dd|base|quote
const cache = new Map<RateCacheKey, number>();

function cacheKey(d: Date, base: string, quote: string): RateCacheKey {
  const day = d.toISOString().slice(0,10);
  return `${day}|${base}|${quote}`;
}

export async function getRateAt(date: Date, base: string, quote: string): Promise<number | null> {
  if (base === quote) return 1;
  const key = cacheKey(date, base, quote);
  if (cache.has(key)) return cache.get(key)!;
  // Try direct
  const direct = await prisma.exchangeRate.findFirst({
    where: { base, quote, date: { lte: date } },
    orderBy: { date: 'desc' }
  });
  if (direct) { cache.set(key, Number(direct.rate)); return Number(direct.rate); }
  // Try inverse
  const inverse = await prisma.exchangeRate.findFirst({
    where: { base: quote, quote: base, date: { lte: date } },
    orderBy: { date: 'desc' }
  });
  if (inverse) { const r = 1/Number(inverse.rate); cache.set(key, r); return r; }
  return null;
}

export async function convertAmount(date: Date, amount: number, from: string, to: string): Promise<{ amount: number; rate: number; fallback: boolean }>{
  if (from === to) return { amount, rate: 1, fallback: false };
  const rate = await getRateAt(date, from, to);
  if (!rate) return { amount, rate: 1, fallback: true };
  return { amount: amount * rate, rate, fallback: false };
}
