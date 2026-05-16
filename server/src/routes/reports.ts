import type { Express, Request, Response } from "express";
import type { PipelineStage } from "mongoose";
import * as XLSX from "xlsx";

import { ExpenseModel, ProductModel, PurchaseModel, SaleModel } from "../models";
import { getBusinessFilter } from "../middleware/scope";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "PIX",
  CARTAO: "Cartão",
  BOLETO: "Boleto",
  TRANSFERENCIA: "Transferência",
};

type SalesItemReportRow = {
  saleId: string;
  saleNumber: string;
  saleDate: string;
  customerName: string;
  paymentMethod: string;
  productId: string;
  productName: string;
  productSku: string;
  itemDescription: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  totalRevenue: number;
  profit: number;
  marginPercent: number;
};

async function buildSalesItemsReport(
  businessFilter: Record<string, unknown>,
  startAnchor: Date | null
): Promise<SalesItemReportRow[]> {
  const matchStage: Record<string, unknown> = {
    ...businessFilter,
    status: { $ne: "CANCELADO" },
  };
  if (startAnchor) {
    matchStage.createdAt = { $gte: startAnchor };
  }

  const pipeline: PipelineStage[] = [
    { $match: matchStage },
    { $sort: { createdAt: -1 } },
    {
      $lookup: {
        from: "customers",
        localField: "customer",
        foreignField: "_id",
        as: "cust",
      },
    },
    { $unwind: { path: "$cust", preserveNullAndEmptyArrays: true } },
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
  ];

  const rawRows = await SaleModel.aggregate(pipeline).allowDiskUse(true);

  return rawRows
    .filter((raw: any) => raw && raw.items)
    .map((raw: any): SalesItemReportRow => {
      const item = raw.items || {};
      const prod = raw.prod || {};
      const cust = raw.cust || {};

      const quantity = Number(item.quantity ?? 0) || 0;
      const unitPrice = Number(item.unitPrice ?? 0) || 0;
      const unitCost = Number(prod.cost ?? 0) || 0;
      const totalRevenue = quantity * unitPrice;
      const totalCost = quantity * unitCost;
      const profit = totalRevenue - totalCost;
      const marginPercent = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
      const saleIdStr = raw._id ? String(raw._id) : "";
      const rawDate = raw.saleDate || raw.createdAt;
      const paymentRaw = String(raw.paymentMethod || "-");

      let saleDateIso = "";
      if (rawDate) {
        const d = new Date(rawDate);
        if (!Number.isNaN(d.getTime())) {
          saleDateIso = d.toISOString();
        }
      }

      return {
        saleId: saleIdStr,
        saleNumber: saleIdStr ? `OV-${saleIdStr.slice(-4).toUpperCase()}` : "OV-?",
        saleDate: saleDateIso,
        customerName: String(cust.name || "").trim() || "Consumidor",
        paymentMethod: PAYMENT_METHOD_LABELS[paymentRaw] || paymentRaw,
        productId: prod._id ? String(prod._id) : "",
        productName: String(prod.name || item.name || "Produto"),
        productSku: String(prod.sku || ""),
        itemDescription: String(item.name || prod.name || "Item"),
        quantity,
        unitCost,
        unitPrice,
        totalCost,
        totalRevenue,
        profit,
        marginPercent,
      };
    });
}

function getMonthsFromQuery(req: Request): number {
  const monthsRaw = Number(req.query.months ?? 12);
  return Math.min(Math.max(Number.isFinite(monthsRaw) ? monthsRaw : 12, 1), 36);
}

function resolveStartAnchor(months: number): Date {
  const now = new Date();
  const startAnchor = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  startAnchor.setHours(0, 0, 0, 0);
  return startAnchor;
}

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

  app.get("/api/reports/sales-items", async (req: Request, res: Response) => {
    try {
      const businessFilter = getBusinessFilter(req);
      const months = getMonthsFromQuery(req);
      const startAnchor = resolveStartAnchor(months);

      const rows = await buildSalesItemsReport(businessFilter, startAnchor);

      res.json({ months, rows });
    } catch (err) {
      console.error("[/api/reports/sales-items]", err);
      const message =
        err instanceof Error ? err.message : "Erro ao montar relatório de vendas por item.";
      res.status(500).json({ message });
    }
  });

  app.get(
    "/api/reports/sales-items/export",
    async (req: Request, res: Response) => {
      try {
        const businessFilter = getBusinessFilter(req);
        const months = getMonthsFromQuery(req);
        const startAnchor = resolveStartAnchor(months);

        const rows = await buildSalesItemsReport(businessFilter, startAnchor);

        const headers = [
          "OV",
          "Data do pedido",
          "Cliente",
          "Condição de pagamento",
          "Produto",
          "SKU",
          "Item",
          "Quantidade",
          "Custo unitário (R$)",
          "Preço unitário vendido (R$)",
          "Custo total (R$)",
          "Receita total (R$)",
          "Margem (R$)",
          "Margem (%)",
        ];

        const body = rows.map((row) => [
          row.saleNumber,
          row.saleDate
            ? new Date(row.saleDate).toLocaleDateString("pt-BR")
            : "",
          row.customerName,
          row.paymentMethod,
          row.productName,
          row.productSku,
          row.itemDescription,
          row.quantity,
          Number(row.unitCost.toFixed(4)),
          Number(row.unitPrice.toFixed(4)),
          Number(row.totalCost.toFixed(2)),
          Number(row.totalRevenue.toFixed(2)),
          Number(row.profit.toFixed(2)),
          Number(row.marginPercent.toFixed(2)),
        ]);

        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "vendas_itens");

        const fileBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        res.setHeader(
          "Content-Disposition",
          `attachment; filename="relatorio-vendas-itens-${months}m.xlsx"`
        );
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.send(fileBuffer);
      } catch (err) {
        console.error("[/api/reports/sales-items/export]", err);
        const message =
          err instanceof Error
            ? err.message
            : "Erro ao gerar Excel do relatório de vendas por item.";
        res.status(500).json({ message });
      }
    }
  );
}
