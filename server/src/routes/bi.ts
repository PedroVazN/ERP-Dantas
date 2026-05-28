import type { Express, Request, Response } from "express";
import { isValidObjectId } from "mongoose";

import { ExpenseModel, ProductModel, SaleModel } from "../models";
import { getBusinessFilter } from "../middleware/scope";

export function registerBiInsightsRoutes(
  app: Express,
  deps: {
    monthBounds: (date?: Date) => { start: Date; end: Date };
    formatPeriodKey: (date: Date) => string;
    formatPeriodLabel: (periodKey: string) => string;
    linearForecast: (values: number[]) => number;
    safeGrowth: (current: number, previous: number) => number;
  }
) {
  app.get("/api/bi/insights", async (req: Request, res: Response) => {
    const { monthBounds, formatPeriodKey, formatPeriodLabel, linearForecast, safeGrowth } = deps;

    const businessFilter = getBusinessFilter(req);

    const monthParamRaw = String(req.query.month || "").trim();
    let baseDate = new Date();
    const monthMatch = monthParamRaw.match(/^(\d{4})-(\d{2})$/);
    if (monthMatch) {
      const year = Number(monthMatch[1]);
      const monthIndex = Number(monthMatch[2]) - 1;
      if (Number.isFinite(year) && Number.isFinite(monthIndex) && monthIndex >= 0 && monthIndex <= 11) {
        baseDate = new Date(year, monthIndex, 1);
      }
    }

    const { start: monthStart, end: nextMonthStart } = monthBounds(baseDate);
    const previousMonthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1);
    const { start: previousMonthStart, end: previousMonthEnd } = monthBounds(previousMonthDate);
    const last30Start = new Date(baseDate);
    last30Start.setDate(baseDate.getDate() - 30);

    const monthlyPeriods: string[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
      monthlyPeriods.push(formatPeriodKey(date));
    }

    const cogsLookupPipeline = (matchStage: object) => [
      { $match: matchStage },
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
    ];

    const [
      currentRevenueAgg,
      previousRevenueAgg,
      currentCogsAgg,
      previousCogsAgg,
      currentExpenseAgg,
      previousExpenseAgg,
      monthlySalesAgg,
      monthlyExpensesAgg,
      topProductsAgg,
      costByCategoryAgg,
      currentSalesCount,
      stockoutAgg,
    ] = await Promise.all([
      SaleModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $ne: "CANCELADO" },
            createdAt: { $gte: monthStart, $lt: nextMonthStart },
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      SaleModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $ne: "CANCELADO" },
            createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd },
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      // CPV mês atual
      SaleModel.aggregate(
        cogsLookupPipeline({
          ...businessFilter,
          status: { $ne: "CANCELADO" },
          createdAt: { $gte: monthStart, $lt: nextMonthStart },
        })
      ),
      // CPV mês anterior
      SaleModel.aggregate(
        cogsLookupPipeline({
          ...businessFilter,
          status: { $ne: "CANCELADO" },
          createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd },
        })
      ),
      ExpenseModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] },
            paymentDate: { $gte: monthStart, $lt: nextMonthStart },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      ExpenseModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] },
            paymentDate: { $gte: previousMonthStart, $lt: previousMonthEnd },
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      SaleModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $ne: "CANCELADO" },
            createdAt: { $gte: new Date(baseDate.getFullYear(), baseDate.getMonth() - 5, 1) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            total: { $sum: "$totalAmount" },
          },
        },
      ]),
      ExpenseModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] },
            paymentDate: { $gte: new Date(baseDate.getFullYear(), baseDate.getMonth() - 5, 1) },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$paymentDate" } },
            total: { $sum: "$amount" },
          },
        },
      ]),
      SaleModel.aggregate([
        { $match: { ...businessFilter, status: { $ne: "CANCELADO" }, createdAt: { $gte: monthStart, $lt: nextMonthStart } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            revenue: { $sum: "$items.total" },
            quantity: { $sum: "$items.quantity" },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
      ExpenseModel.aggregate([
        {
          $match: {
            ...businessFilter,
            status: { $in: ["PAGO", "PENDENTE", "AGUARDANDO_APROVACAO"] },
            paymentDate: { $gte: monthStart, $lt: nextMonthStart },
          },
        },
        { $group: { _id: "$category", total: { $sum: "$amount" } } },
        { $sort: { total: -1 } },
        { $limit: 5 },
      ]),
      SaleModel.countDocuments({ ...businessFilter, status: { $ne: "CANCELADO" }, createdAt: { $gte: monthStart, $lt: nextMonthStart } }),
      SaleModel.aggregate([
        { $match: { ...businessFilter, status: { $ne: "CANCELADO" }, createdAt: { $gte: last30Start } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.product",
            name: { $first: "$items.name" },
            quantity30d: { $sum: "$items.quantity" },
          },
        },
        { $sort: { quantity30d: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const currentRevenue = currentRevenueAgg[0]?.total || 0;
    const previousRevenue = previousRevenueAgg[0]?.total || 0;
    const currentCogs = currentCogsAgg[0]?.cogs || 0;
    const previousCogs = previousCogsAgg[0]?.cogs || 0;
    const currentExpenses = currentExpenseAgg[0]?.total || 0;
    const previousExpenses = previousExpenseAgg[0]?.total || 0;

    // Lucro bruto = receita - CPV (somente sobre o que foi vendido)
    const currentProfit = currentRevenue - currentCogs;
    const previousProfit = previousRevenue - previousCogs;

    // Margem bruta = (lucro_bruto / receita) × 100
    const margin = currentRevenue > 0 ? (currentProfit / currentRevenue) * 100 : 0;
    const avgTicket = currentSalesCount > 0 ? currentRevenue / currentSalesCount : 0;
    const costRatio = currentRevenue > 0 ? (currentCogs / currentRevenue) * 100 : 0;

    const salesMap = new Map<string, number>();
    monthlySalesAgg.forEach((row: any) => salesMap.set(row._id, row.total));
    const expensesMap = new Map<string, number>();
    monthlyExpensesAgg.forEach((row: any) => expensesMap.set(row._id, row.total));

    const timeseries = monthlyPeriods.map((period) => {
      const revenue = salesMap.get(period) || 0;
      const expenses = expensesMap.get(period) || 0;
      return {
        period,
        label: formatPeriodLabel(period),
        revenue,
        expenses,
        profit: revenue - expenses,
      };
    });

    const revenueTrend = timeseries.map((item) => item.revenue);
    const expenseTrend = timeseries.map((item) => item.expenses);
    const forecastRevenue = linearForecast(revenueTrend);
    const forecastExpenses = linearForecast(expenseTrend);
    const forecastProfit = forecastRevenue - forecastExpenses;

    const productIds = stockoutAgg
      .map((item: any) => item._id)
      .filter((value: any) => value && isValidObjectId(value));
    const productsInfo = await ProductModel.find({ ...businessFilter, _id: { $in: productIds } });
    const productMap = new Map(productsInfo.map((product: any) => [String(product._id), product]));

    const stockRisk = stockoutAgg
      .map((item: any) => {
        const product = productMap.get(String(item._id));
        if (!product) return null;
        const avgDailySold = (item.quantity30d || 0) / 30;
        const projectedDaysToStockout = avgDailySold > 0 ? product.stock / avgDailySold : null;
        return {
          productId: String(product._id),
          name: product.name,
          stock: product.stock,
          minStock: product.minStock,
          avgDailySold: Number(avgDailySold.toFixed(2)),
          projectedDaysToStockout:
            projectedDaysToStockout === null ? null : Number(projectedDaysToStockout.toFixed(1)),
        };
      })
      .filter((item: any): item is NonNullable<typeof item> => Boolean(item))
      .sort((a: any, b: any) => {
        const valueA = a.projectedDaysToStockout ?? Number.POSITIVE_INFINITY;
        const valueB = b.projectedDaysToStockout ?? Number.POSITIVE_INFINITY;
        return valueA - valueB;
      })
      .slice(0, 5);

    res.json({
      updatedAt: baseDate.toISOString(),
      kpis: {
        revenue: currentRevenue,
        expenses: currentExpenses,
        profit: currentProfit,
        margin,
        salesCount: currentSalesCount,
        averageTicket: avgTicket,
        costRatio,
        revenueGrowth: safeGrowth(currentRevenue, previousRevenue),
        profitGrowth: safeGrowth(currentProfit, previousProfit),
      },
      timeseries,
      topProducts: topProductsAgg.map((row: any) => ({
        name: row._id,
        revenue: row.revenue,
        quantity: row.quantity,
      })),
      costByCategory: costByCategoryAgg.map((row: any) => ({
        category: row._id || "Sem categoria",
        total: row.total,
      })),
      forecast: {
        nextRevenue: forecastRevenue,
        nextExpenses: forecastExpenses,
        nextProfit: forecastProfit,
        confidence: timeseries.length >= 5 ? "media" : "baixa",
        stockRisk,
      },
    });
  });
}

