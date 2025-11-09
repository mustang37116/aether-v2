import { prisma } from '../prisma.js';
const cache = new Map();
function cacheKey(d, base, quote) {
    const day = d.toISOString().slice(0, 10);
    return `${day}|${base}|${quote}`;
}
export async function getRateAt(date, base, quote) {
    if (base === quote)
        return 1;
    const key = cacheKey(date, base, quote);
    if (cache.has(key))
        return cache.get(key);
    // Try direct
    const direct = await prisma.exchangeRate.findFirst({
        where: { base, quote, date: { lte: date } },
        orderBy: { date: 'desc' }
    });
    if (direct) {
        cache.set(key, Number(direct.rate));
        return Number(direct.rate);
    }
    // Try inverse
    const inverse = await prisma.exchangeRate.findFirst({
        where: { base: quote, quote: base, date: { lte: date } },
        orderBy: { date: 'desc' }
    });
    if (inverse) {
        const r = 1 / Number(inverse.rate);
        cache.set(key, r);
        return r;
    }
    return null;
}
export async function convertAmount(date, amount, from, to) {
    if (from === to)
        return { amount, rate: 1, fallback: false };
    const rate = await getRateAt(date, from, to);
    if (!rate)
        return { amount, rate: 1, fallback: true };
    return { amount: amount * rate, rate, fallback: false };
}
