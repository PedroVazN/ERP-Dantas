import type { Express, Request, Response } from "express";

import { ExpenseModel, ProductModel, PurchaseModel, SaleModel } from "../models";
import { getBusinessFilter } from "../middleware/scope";

export function registerDashboardRoutes(app: Express) {
  app.get("/api/dashboard", async (req: Request, res: Response) => {
    const businessFilter = getBusinessFilter(req);

    const monthParamRaw = String(req.query.month || "").trim();
    let dateStart: Date | null = null;
    let dateEnd: Date | null = null;
    const match = monthParamRaw.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      if (Number.isFinite(year) && Number.isFinite(monthIndex) && monthIndex >= 0 && monthIndex <= 11) {
        dateStart = new Date(year, monthIndex, 1);
        dateEnd = new Date(year, monthIndex + 1, 1);
      }
    }

    const saleDateFilter = dateStart && dateEnd ? { createdAt: { $gte: dateStart, $lt: dateEnd } } : {};
    const expenseDateFilter = dateStart && dateEnd ? { dueDate: { $gte: dateStart, $lt: dateEnd } } : {};

    const [revenueAgg, expenseAgg, cogsAgg, lowStock, salesCount, purchaseCount, purchasesTotalAgg] =
      await Promise.all([
      SaleModel.aggregate([
        { $match: { ...businessFilter, status: { $ne: "CANCELADO" }, ...saleDateFilter } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      ExpenseModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] },
            ...expenseDateFilter,
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      // CPV: custo real dos itens vendidos via lookup no cadastro de produtos
      SaleModel.aggregate([
        { $match: { ...businessFilter, status: { $ne: "CANCELADO" }, ...saleDateFilter } },
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
      SaleModel.countDocuments({ ...businessFilter, ...saleDateFilter }),
      PurchaseModel.countDocuments({ ...businessFilter, ...(saleDateFilter as object) }),
      PurchaseModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $ne: "CANCELADA" },
            ...(saleDateFilter as object),
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
    ]);

    const revenue = revenueAgg[0]?.total || 0;
    const expenses = expenseAgg[0]?.total || 0;
    const cogs = cogsAgg[0]?.cogs || 0;
    // Lucro bruto = receita - CPV (custo dos produtos efetivamente vendidos)
    const profit = revenue - cogs;
    const purchasesTotal = purchasesTotalAgg[0]?.total || 0;

    res.json({
      revenue,
      expenses,
      profit,
      salesCount,
      purchaseCount,
      purchasesTotal,
      lowStock,
    });
  });
}

