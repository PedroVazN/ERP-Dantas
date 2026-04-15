import type { Express, Request, Response } from "express";

import { ExpenseModel, ProductModel, PurchaseModel, SaleModel } from "../models";
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

  app.get("/api/reports/stock-table", async (req: Request, res: Response) => {
    const businessFilter = getBusinessFilter(req);

    const monthsRaw = Number(req.query.months ?? 12);
    const monthCount = Math.min(Math.max(Number.isFinite(monthsRaw) ? monthsRaw : 12, 1), 36);
    const now = new Date();
    const startAnchor = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1);
    startAnchor.setHours(0, 0, 0, 0);

    const [products, soldByProduct] = await Promise.all([
      ProductModel.find(businessFilter).sort({ name: 1 }).lean(),
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
          $group: {
            _id: "$items.product",
            quantitySold: { $sum: "$items.quantity" },
            salesValue: { $sum: "$items.total" },
          },
        },
      ]),
    ]);

    const soldMap = new Map<
      string,
      {
        quantitySold: number;
        salesValue: number;
      }
    >();
    soldByProduct.forEach((row: { _id: unknown; quantitySold: number; salesValue: number }) => {
      const key = String(row._id || "");
      if (!key) return;
      soldMap.set(key, { quantitySold: row.quantitySold || 0, salesValue: row.salesValue || 0 });
    });

    const rows = products.map((product) => {
      const sold = soldMap.get(String(product._id));
      const quantitySold = sold?.quantitySold || 0;
      const averageMonthlySales = quantitySold > 0 ? quantitySold / monthCount : 0;
      const stockTimeMonths = averageMonthlySales > 0 ? product.stock / averageMonthlySales : null;
      const listPrice = Number(product.price || 0);
      const salePrice = quantitySold > 0 ? (sold?.salesValue || 0) / quantitySold : listPrice;
      const cost = Number(product.cost || 0);
      const marginPercent = salePrice > 0 ? ((salePrice - cost) / salePrice) * 100 : 0;

      return {
        productId: String(product._id),
        product: product.name,
        productCode: product.productCode || product.sku || "-",
        quantitySold,
        stock: Number(product.stock || 0),
        stockTimeMonths,
        cost,
        listPrice,
        salePrice,
        marginPercent,
      };
    });

    res.json({ months: monthCount, rows });
  });
}
