import type { Market, QuoteInput, RateDay, RatesProvider } from "./provider";

export class SmartRateClient implements RatesProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}
  async markets(): Promise<Market[]> {
    throw new Error("not implemented");
  }
  async quote(_input: QuoteInput): Promise<RateDay[]> {
    throw new Error("not implemented");
  }
}
