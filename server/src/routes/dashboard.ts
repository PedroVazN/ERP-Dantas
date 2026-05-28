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
    const expenseDateFilter = dateStart && dateEnd ? { paymentDate: { $gte: dateStart, $lt: dateEnd } } : {};

    const [
      revenuePaidAgg,
      revenuePendingAgg,
      operationalExpenseAgg,
      cogsPaidAgg,
      lowStock,
      salesCount,
      customersServedAgg,
      pendingOrdersCount,
      purchaseCount,
      purchasesTotalAgg,
    ] =
      await Promise.all([
      SaleModel.aggregate([
        { $match: { ...businessFilter, status: "PAGO", ...saleDateFilter } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      SaleModel.aggregate([
        { $match: { ...businessFilter, status: "PENDENTE", ...saleDateFilter } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      ExpenseModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] },
            // Despesas gerais: não considerar despesas atreladas a compras.
            purchaseId: null,
            ...expenseDateFilter,
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      // CPV dos pedidos pagos: custo real dos itens vendidos via lookup no cadastro de produtos.
      SaleModel.aggregate([
        { $match: { ...businessFilter, status: "PAGO", ...saleDateFilter } },
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
      SaleModel.countDocuments({ ...businessFilter, status: { $ne: "CANCELADO" }, ...saleDateFilter }),
      SaleModel.aggregate([
        { $match: { ...businessFilter, status: { $ne: "CANCELADO" }, customer: { $ne: null }, ...saleDateFilter } },
        { $group: { _id: "$customer" } },
        { $count: "total" },
      ]),
      SaleModel.countDocuments({ ...businessFilter, status: "PENDENTE", ...saleDateFilter }),
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

    const revenuePaid = revenuePaidAgg[0]?.total || 0;
    const revenuePending = revenuePendingAgg[0]?.total || 0;
    const projectedRevenue = revenuePaid + revenuePending;
    const operationalExpenses = operationalExpenseAgg[0]?.total || 0;
    const cogsPaid = cogsPaidAgg[0]?.cogs || 0;
    const grossMarginValue = revenuePaid - cogsPaid;
    const grossMarginPercent = revenuePaid > 0 ? (grossMarginValue / revenuePaid) * 100 : 0;
    const netMarginValue = revenuePaid - operationalExpenses;
    const customersServed = customersServedAgg[0]?.total || 0;
    const purchasesTotal = purchasesTotalAgg[0]?.total || 0;

    res.json({
      revenue: revenuePaid,
      expenses: operationalExpenses,
      profit: grossMarginValue,
      salesCount,
      pendingOrdersCount,
      projectedRevenue,
      customersServed,
      grossMarginValue,
      grossMarginPercent,
      netMarginValue,
      operationalExpenses,
      purchaseCount,
      purchasesTotal,
      lowStock,
    });
  });
}

