import type { Express, Request, Response } from "express";

import { ExpenseModel, ProductModel, PurchaseModel, SaleModel } from "../models";
import { getBusinessFilter } from "../middleware/scope";

export function registerDashboardRoutes(app: Express) {
  app.get("/api/dashboard", async (req: Request, res: Response) => {
    const businessFilter = getBusinessFilter(req);
    const [revenueAgg, expenseAgg, lowStock, salesCount, purchaseCount] = await Promise.all([
      SaleModel.aggregate([
        { $match: { ...businessFilter, status: { $ne: "CANCELADO" } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      ExpenseModel.aggregate([
        { $match: { ...businessFilter, status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      ProductModel.find({
        ...businessFilter,
        active: true,
        $expr: { $lte: ["$stock", "$minStock"] },
      })
        .sort({ stock: 1 })
        .limit(10),
      SaleModel.countDocuments(businessFilter),
      PurchaseModel.countDocuments(businessFilter),
    ]);

    const revenue = revenueAgg[0]?.total || 0;
    const expenses = expenseAgg[0]?.total || 0;
    res.json({
      revenue,
      expenses,
      profit: revenue - expenses,
      salesCount,
      purchaseCount,
      lowStock,
    });
  });
}

