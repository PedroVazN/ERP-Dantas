import type { Express, Request, Response } from "express";

import { ExpenseModel, ProductModel, PurchaseModel, SaleModel } from "../models";
import { getBusinessFilter } from "../middleware/scope";

export function registerDashboardRoutes(app: Express) {
  app.get("/api/dashboard", async (req: Request, res: Response) => {
    const businessFilter = getBusinessFilter(req);
    const [revenueAgg, expenseAgg, cogsAgg, lowStock, salesCount, purchaseCount] = await Promise.all([
      SaleModel.aggregate([
        { $match: { ...businessFilter, status: { $ne: "CANCELADO" } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      ExpenseModel.aggregate([
        { $match: { ...businessFilter, status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      // CPV: custo real dos itens vendidos via lookup no cadastro de produtos
      SaleModel.aggregate([
        { $match: { ...businessFilter, status: { $ne: "CANCELADO" } } },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "products",
            localField: "items.product",
            foreignField: "_id",
            as: "prod",
          },
        },
        { $unwind: { path: "$prod", preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            cogs: {
              $sum: { $multiply: ["$items.quantity", { $ifNull: ["$prod.cost", 0] }] },
            },
          },
        },
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
    const cogs = cogsAgg[0]?.cogs || 0;
    // Lucro bruto = receita - CPV (custo dos produtos efetivamente vendidos)
    const profit = revenue - cogs;
    res.json({
      revenue,
      expenses,
      profit,
      salesCount,
      purchaseCount,
      lowStock,
    });
  });
}

