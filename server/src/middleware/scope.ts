import type { Request, Response } from "express";

export function getScopeContext(req: Request) {
  const scope = String(req.query.scope || "negocio");
  const bodyBusinessId =
    req.body && typeof req.body === "object" && "businessId" in req.body
      ? String((req.body as { businessId?: string }).businessId || "").trim()
      : "";
  const queryBusinessId = String(req.query.businessId || "").trim();
  const businessId = queryBusinessId || bodyBusinessId || "geral";

  return {
    scope: scope === "geral" ? "geral" : "negocio",
    businessId,
  };
}

export function getBusinessFilter(req: Request) {
  const context = getScopeContext(req);
  if (context.scope === "geral") {
    return {};
  }
  return { businessId: context.businessId };
}

export function blockWriteInGeneralScope(req: Request, res: Response) {
  const context = getScopeContext(req);
  if (context.scope === "geral") {
    res.status(400).json({
      message:
        "O ERP Geral e apenas para consolidacao. Selecione um ERP especifico para lancamentos.",
    });
    return true;
  }
  return false;
}

