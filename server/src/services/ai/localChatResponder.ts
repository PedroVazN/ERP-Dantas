/**
 * Gera respostas locais para perguntas comuns sobre o negócio,
 * sem depender do Gemini. Usado como fallback quando a API falha.
 */

type ProductInfo = {
  name: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  description?: string;
};

type SaleInfo = {
  totalAmount: number;
  paymentMethod: string;
};

export function buildLocalChatReply(
  message: string,
  products: ProductInfo[],
  recentSales: SaleInfo[]
): string {
  const lower = message.toLowerCase();

  // Estoque baixo
  if (
    lower.includes("estoque baixo") ||
    lower.includes("acabando") ||
    lower.includes("repor") ||
    (lower.includes("estoque") && (lower.includes("baixo") || lower.includes("pouco") || lower.includes("falta")))
  ) {
    const low = products.filter((p) => p.stock <= p.minStock && p.minStock > 0);
    if (low.length === 0) {
      return "Boa notícia! Nenhum produto está com estoque abaixo do mínimo no momento.";
    }
    const list = low
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 8)
      .map((p) => `• ${p.name}: ${p.stock} un. (mín ${p.minStock})`)
      .join("\n");
    return `Produtos com estoque baixo (${low.length} itens):\n\n${list}\n\nRecomendo repor esses itens em breve.`;
  }

  // Produtos / inventário
  if (
    lower.includes("produto") ||
    lower.includes("catalogo") ||
    lower.includes("catálogo") ||
    lower.includes("inventario") ||
    lower.includes("inventário")
  ) {
    if (products.length === 0) {
      return "Nenhum produto cadastrado ainda. Acesse o módulo Produtos para cadastrar.";
    }
    const topByPrice = [...products].sort((a, b) => b.price - a.price).slice(0, 5);
    const list = topByPrice.map((p) => `• ${p.name} — R$${p.price.toFixed(2)} (estoque: ${p.stock})`).join("\n");
    return `Você tem ${products.length} produto(s) cadastrado(s). Os de maior preço:\n\n${list}`;
  }

  // Margem / lucro
  if (
    lower.includes("margem") ||
    lower.includes("lucro") ||
    lower.includes("rentável") ||
    lower.includes("rentavel") ||
    lower.includes("mais lucrativo")
  ) {
    const withMargin = products
      .filter((p) => p.price > 0 && p.cost > 0)
      .map((p) => ({ ...p, margin: ((p.price - p.cost) / p.price) * 100 }))
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5);
    if (withMargin.length === 0) {
      return "Não encontrei produtos com custo e preço cadastrados para calcular margem.";
    }
    const list = withMargin
      .map((p) => `• ${p.name}: ${p.margin.toFixed(1)}% (R$${p.price.toFixed(2)} − R$${p.cost.toFixed(2)})`)
      .join("\n");
    return `Produtos com maior margem bruta:\n\n${list}\n\nMargem = (Preço − Custo) ÷ Preço × 100`;
  }

  // Vendas
  if (lower.includes("vend") || lower.includes("faturamento") || lower.includes("receita")) {
    if (recentSales.length === 0) {
      return "Nenhuma venda registrada ainda. Use o módulo Vendas para registrar suas vendas.";
    }
    const total = recentSales.reduce((acc, s) => acc + s.totalAmount, 0);
    const avg = total / recentSales.length;
    const byPayment: Record<string, number> = {};
    recentSales.forEach((s) => {
      byPayment[s.paymentMethod] = (byPayment[s.paymentMethod] || 0) + 1;
    });
    const payStr = Object.entries(byPayment)
      .sort((a, b) => b[1] - a[1])
      .map(([m, n]) => `${m}: ${n}x`)
      .join(", ");
    return `Últimas ${recentSales.length} vendas:\n\n• Total: R$${total.toFixed(2)}\n• Ticket médio: R$${avg.toFixed(2)}\n• Formas de pagamento: ${payStr}`;
  }

  // Sugestão / o que comprar
  if (
    lower.includes("sugest") ||
    lower.includes("comprar") ||
    lower.includes("devo") ||
    lower.includes("preciso")
  ) {
    const low = products.filter((p) => p.stock <= p.minStock && p.minStock > 0).slice(0, 5);
    if (low.length > 0) {
      const list = low.map((p) => `• ${p.name} (${p.stock}/${p.minStock} un.)`).join("\n");
      return `Sugiro repor esses produtos que estão com estoque abaixo do mínimo:\n\n${list}\n\nUse o módulo Compras ou diga "compre X unidades de [produto]".`;
    }
    return "Seu estoque está ok! Nenhum produto abaixo do mínimo no momento.";
  }

  // Fallback genérico com resumo do negócio
  const totalStock = products.reduce((acc, p) => acc + p.stock, 0);
  const totalSalesValue = recentSales.reduce((acc, s) => acc + s.totalAmount, 0);
  return (
    `Posso ajudar com informações sobre seu negócio!\n\n` +
    `Resumo atual:\n` +
    `• ${products.length} produtos cadastrados (${totalStock} un. em estoque total)\n` +
    `• ${recentSales.length} vendas recentes (R$${totalSalesValue.toFixed(2)} em faturamento)\n\n` +
    `Pergunte sobre: estoque baixo, margem de lucro, produtos, vendas ou dê um comando como "compre 10 sabonetes".`
  );
}
