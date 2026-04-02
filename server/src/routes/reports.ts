import type { Express, Request, Response } from "express";

import { ExpenseModel, PurchaseModel, SaleModel } from "../models";
import { getBusinessFilter } from "../middleware/scope";

export function registerReportsRoutes(
  app: Express,
  deps: { formatPeriodKey: (date: Date) => string; formatPeriodLabel: (periodKey: string) => string }
) {
  app.get("/api/reports/monthly-series", async (req: Request, res: Response) => {
    const businessFilter = getBusinessFilter(req);
    const { formatPeriodKey, formatPeriodLabel } = deps;

    const monthsRaw = Number(req.query.months ?? 12);
    const monthCount = Math.min(Math.max(Number.isFinite(monthsRaw) ? monthsRaw : 12, 3), 36);

    const now = new Date();
    const startAnchor = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1);
    startAnchor.setHours(0, 0, 0, 0);

    const monthKeys: string[] = [];
    for (let i = 0; i < monthCount; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1 - i), 1);
      monthKeys.push(formatPeriodKey(d));
    }

    const [salesByMonth, expensesByMonth, purchasesByMonth, cogsByMonth] = await Promise.all([
      SaleModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $ne: "CANCELADO" },
            createdAt: { $gte: startAnchor },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            revenue: { $sum: "$totalAmount" },
          },
        },
      ]),
      ExpenseModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] },
            dueDate: { $gte: startAnchor },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$dueDate" } },
            expenses: { $sum: "$amount" },
          },
        },
      ]),
      PurchaseModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $ne: "CANCELADA" },
            createdAt: { $gte: startAnchor },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            purchasesTotal: { $sum: "$totalAmount" },
          },
        },
      ]),
      SaleModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $ne: "CANCELADO" },
            createdAt: { $gte: startAnchor },
          },
        },
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
            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            cogs: {
              $sum: { $multiply: ["$items.quantity", { $ifNull: ["$prod.cost", 0] }] },
            },
          },
        },
      ]),
    ]);

    const revenueMap = new Map<string, number>();
    salesByMonth.forEach((row: { _id: string; revenue: number }) => revenueMap.set(row._id, row.revenue));

    const expenseMap = new Map<string, number>();
    expensesByMonth.forEach((row: { _id: string; expenses: number }) => expenseMap.set(row._id, row.expenses));

    const purchaseMap = new Map<string, number>();
    purchasesByMonth.forEach((row: { _id: string; purchasesTotal: number }) =>
      purchaseMap.set(row._id, row.purchasesTotal)
    );

    const cogsMap = new Map<string, number>();
    cogsByMonth.forEach((row: { _id: string; cogs: number }) => cogsMap.set(row._id, row.cogs));

    const series = monthKeys.map((period) => {
      const revenue = revenueMap.get(period) || 0;
      const expenses = expenseMap.get(period) || 0;
      const purchasesTotal = purchaseMap.get(period) || 0;
      const cogs = cogsMap.get(period) || 0;
      const profitGross = revenue - cogs;
      return {
        period,
        label: formatPeriodLabel(period),
        revenue,
        expenses,
        purchasesTotal,
        profitGross,
      };
    });

    res.json({ months: monthCount, series });
  });
}
