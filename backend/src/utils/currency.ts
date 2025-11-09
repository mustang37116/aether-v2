import { prisma } from '../prisma.js';

export async function convert(amount: number, from: string, to: string, date: Date): Promise<number> {
  if (from === to) return amount;
  const rate = await prisma.exchangeRate.findFirst({ where: { base: from, quote: to, date } });
  if (!rate) {
    // naive fallback: assume 1 for now; later implement fetch or stored historical
    return amount;
  }
  return amount * Number(rate.rate);
}
