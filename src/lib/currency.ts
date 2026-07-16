// Live currency conversion to BDT, called directly from the browser — no
// signup/key needed. Frankfurter/ECB rates don't cover BDT, so this uses
// open.er-api.com instead, which does.

interface RateResponse {
  result: string;
  rates: Record<string, number>;
}

const rateCache = new Map<string, number | null>();

async function getRateToBdt(currency: string): Promise<number | null> {
  const code = currency.toUpperCase();
  if (code === "BDT") return 1;
  if (rateCache.has(code)) return rateCache.get(code)!;

  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${code}`);
    if (!res.ok) throw new Error(`Rate lookup failed (${res.status})`);
    const data: RateResponse = await res.json();
    const rate = data.rates?.BDT ?? null;
    rateCache.set(code, rate);
    return rate;
  } catch {
    rateCache.set(code, null);
    return null;
  }
}

export async function convertToBdt(amount: number, currency: string): Promise<number | null> {
  const rate = await getRateToBdt(currency);
  return rate === null ? null : amount * rate;
}

export function formatBdt(amount: number): string {
  return `৳${Math.round(amount).toLocaleString("en-US")}`;
}
