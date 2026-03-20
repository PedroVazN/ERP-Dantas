import type { Express, Request, Response } from "express";

export function registerEconomicIndicatorsRoutes(
  app: Express,
  deps: {
    fetchFxRates: () => Promise<{ usdBrl: number | null; eurBrl: number | null; source: string }>;
    fetchSgsLatestValue: (code: number) => Promise<number | null>;
  }
) {
  app.get("/api/economic/indicators", async (_req: Request, res: Response) => {
    const fx = await deps.fetchFxRates();

    const [selic, ipca] = await Promise.all([
      deps.fetchSgsLatestValue(432),
      deps.fetchSgsLatestValue(433),
    ]);

    res.json({
      updatedAt: new Date().toISOString(),
      exchange: {
        usdBrl: fx.usdBrl,
        eurBrl: fx.eurBrl,
        source: fx.source,
      },
      indicators: {
        selic,
        ipca,
        source: "Banco Central (SGS)",
      },
    });
  });
}

