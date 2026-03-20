import type { Express, Request, Response } from "express";

export function registerHealthRoute(
  app: Express,
  opts: { getDbConnected: () => boolean }
) {
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "E-Sentinel API",
      database: opts.getDbConnected() ? "connected" : "disconnected",
    });
  });
}

