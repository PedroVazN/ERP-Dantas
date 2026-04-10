import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL } from "../api";
import "./PublicOrderPage.css";

const BRAND_LOGO_SRC = "/usenature.png";

type MenuProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  hasPhoto: boolean;
};

type MenuResponse = {
  businessId: string;
  businessName: string;
  products: MenuProduct[];
};

type SaleCreated = {
  _id: string;
  totalAmount: number;
  invoice?: { number?: string; key?: string };
};

function readParams() {
  const q = new URLSearchParams(window.location.search);
  const businessId = (q.get("loja") || q.get("businessId") || "").trim();
  const token = (q.get("codigo") || q.get("token") || "").trim();
  return { businessId, token };
}

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function groupByCategory(products: MenuProduct[]): Map<string, MenuProduct[]> {
  const map = new Map<string, MenuProduct[]>();
  for (const p of products) {
    const key = (p.category || "Produtos").trim() || "Produtos";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  return map;
}

export function PublicOrderPage() {
  const { businessId, token } = useMemo(() => readParams(), []);

  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [step, setStep] = useState<"shop" | "details" | "done">("shop");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdSale, setCreatedSale] = useState<SaleCreated | null>(null);

  const loadMenu = useCallback(async () => {
    setLoadError(null);
    if (!businessId || !token) {
      setLoadError(
        "Link incompleto. Use o endereço completo enviado pela loja (parâmetros loja e codigo)."
      );
      return;
    }
    const url = new URL(`${API_URL}/public/menu`);
    url.searchParams.set("businessId", businessId);
    url.searchParams.set("token", token);
    try {
      const response = await fetch(url.toString());
      const body = (await response.json().catch(() => ({}))) as { message?: string } & MenuResponse;
      if (!response.ok) {
        throw new Error(body.message || "Não foi possível carregar o cardápio.");
      }
      setMenu(body);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Falha ao carregar o cardápio.");
    }
  }, [businessId, token]);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  const cartItems = useMemo(() => {
    if (!menu) return [];
    return menu.products
      .map((p) => ({ product: p, qty: cart[p.id] || 0 }))
      .filter((row) => row.qty > 0);
  }, [menu, cart]);

  const cartCount = useMemo(() => cartItems.reduce((n, r) => n + r.qty, 0), [cartItems]);

  const subtotal = useMemo(
    () => cartItems.reduce((sum, row) => sum + row.product.price * row.qty, 0),
    [cartItems]
  );

  const categoriesBlock = useMemo(() => {
    if (!menu?.products.length) return [];
    return Array.from(groupByCategory(menu.products).entries());
  }, [menu]);

  const addToCart = (id: string, stock: number) => {
    setCart((prev) => {
      const next = (prev[id] || 0) + 1;
      return { ...prev, [id]: Math.min(next, stock) };
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => {
      const next = { ...prev };
      const q = (next[id] || 0) - 1;
      if (q <= 0) delete next[id];
      else next[id] = q;
      return next;
    });
  };

  const handleSubmitOrder = async () => {
    if (!menu || !token) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const items = Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([productId, quantity]) => ({ productId, quantity }));
      const response = await fetch(`${API_URL}/public/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: menu.businessId,
          token,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          items,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        sale?: SaleCreated;
      };
      if (!response.ok) {
        throw new Error(body.message || "Não foi possível enviar o pedido.");
      }
      if (body.sale) {
        setCreatedSale(body.sale);
        setStep("done");
        setCart({});
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Erro ao enviar pedido.");
    } finally {
      setSubmitting(false);
    }
  };

  const shellClass = "public-order";

  if (!businessId || !token) {
    return (
      <div className={shellClass}>
        <BrandedHero businessName="Cardápio digital" tagline="Link inválido" />
        <div className="public-order__container">
          <div className="public-order__state-card">
            <h1 className="public-order__state-title">Endereço incompleto</h1>
            <p className="public-order__state-text">
              Este link precisa incluir o código da loja e o código de acesso. Solicite o endereço completo ao
              estabelecimento.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={shellClass}>
        <BrandedHero businessName="Cardápio digital" tagline="Não foi possível carregar" />
        <div className="public-order__container">
          <div className="public-order__state-card public-order__state-card--error">
            <p className="public-order__state-error">{loadError}</p>
            <button type="button" className="public-order__cta public-order__cta--primary" onClick={() => void loadMenu()}>
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className={shellClass}>
        <div className="public-order__hero public-order__hero--loading">
          <div className="public-order__hero-inner">
            <div className="public-order__brand-lockup">
              <img src={BRAND_LOGO_SRC} alt="" className="public-order__logo" width={56} height={56} decoding="async" />
              <div className="public-order__skeleton public-order__skeleton--title" />
            </div>
            <div className="public-order__skeleton public-order__skeleton--line" />
          </div>
        </div>
        <div className="public-order__container">
          <div className="public-order__skeleton-grid" aria-hidden>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="public-order__skeleton-card" />
            ))}
          </div>
        </div>
        <p className="public-order__sr-only" role="status">
          Carregando cardápio
        </p>
      </div>
    );
  }

  if (step === "done" && createdSale) {
    return (
      <div className={shellClass}>
        <header className="public-order__topbar public-order__topbar--success">
          <div className="public-order__topbar-inner">
            <img src={BRAND_LOGO_SRC} alt="" width={40} height={40} className="public-order__logo public-order__logo--sm" />
            <span className="public-order__topbar-text">{menu.businessName}</span>
          </div>
        </header>
        <div className="public-order__success-wrap">
          <div className="public-order__success-icon" aria-hidden>
            <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" opacity="0.2" />
              <path
                d="M14 24l7 7 13-14"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="public-order__success-title">Pedido recebido</h1>
          <p className="public-order__success-lead">
            Obrigado pela preferência. Use o PIX abaixo para concluir o pagamento.
          </p>
          <div className="public-order__receipt">
            <div className="public-order__receipt-row">
              <span>Total</span>
              <strong>{formatBrl(createdSale.totalAmount)}</strong>
            </div>
            {createdSale.invoice?.number ? (
              <div className="public-order__receipt-row public-order__receipt-row--muted">
                <span>Referência</span>
                <span>{createdSale.invoice.number}</span>
              </div>
            ) : null}
          </div>
          <p className="public-order__pix-copy">
            Escaneie o QR Code com o app do seu banco. Após o pagamento, a loja confirma o pedido.
          </p>
          <div className="public-order__pix-frame">
            <img src="/pix.jpg" alt="QR Code para pagamento PIX" className="public-order__pix-img" width={280} height={280} />
          </div>
          <p className="public-order__fine-print">
            Guarde esta tela. Em dúvidas, informe o telefone usado no pedido ao atendimento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <header className="public-order__topbar">
        <div className="public-order__topbar-inner">
          <div className="public-order__brand-lockup public-order__brand-lockup--compact">
            <img
              src={BRAND_LOGO_SRC}
              alt="E-Sentinel"
              width={44}
              height={44}
              className="public-order__logo"
              decoding="async"
            />
            <div className="public-order__brand-text">
              <span className="public-order__eyebrow">Cardápio digital</span>
              <span className="public-order__store-name">{menu.businessName}</span>
            </div>
          </div>
          {step === "shop" && cartCount > 0 ? (
            <button
              type="button"
              className="public-order__cart-pill"
              onClick={() => setStep("details")}
              aria-label={`Abrir sacola com ${cartCount} itens`}
            >
              <span className="public-order__cart-pill-icon" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6h15l-1.5 9h-12z" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="9" cy="20" r="1" />
                  <circle cx="18" cy="20" r="1" />
                </svg>
              </span>
              <span className="public-order__cart-pill-qty">{cartCount}</span>
            </button>
          ) : null}
        </div>
      </header>

      {step === "shop" && (
        <>
          <section className="public-order__hero" aria-labelledby="hero-title">
            <div className="public-order__hero-inner">
              <h1 id="hero-title" className="public-order__hero-title">
                O que vamos pedir hoje?
              </h1>
              <p className="public-order__hero-sub">
                Toque nos itens para adicionar à sacola. Pagamento seguro via PIX ao finalizar.
              </p>
              {menu.products.length > 0 ? (
                <p className="public-order__hero-meta">
                  <span className="public-order__pill">{menu.products.length} itens no cardápio</span>
                </p>
              ) : null}
            </div>
          </section>

          <main className="public-order__container">
            {menu.products.length === 0 ? (
              <div className="public-order__state-card">
                <p className="public-order__state-text">Nenhum produto disponível no momento. Volte em breve.</p>
              </div>
            ) : (
              categoriesBlock.map(([category, items]) => (
                <section key={category} className="public-order__section" aria-labelledby={`cat-${category}`}>
                  <h2 id={`cat-${category}`} className="public-order__section-title">
                    {category}
                  </h2>
                  <div className="public-order__grid">
                    {items.map((p) => {
                      const qty = cart[p.id] || 0;
                      const photoUrl = p.hasPhoto
                        ? `${API_URL}/products/${p.id}/photo?businessId=${encodeURIComponent(menu.businessId)}`
                        : null;
                      return (
                        <article key={p.id} className="public-order__card">
                          <div className="public-order__card-visual">
                            {photoUrl ? (
                              <img src={photoUrl} alt="" className="public-order__card-img" loading="lazy" />
                            ) : (
                              <div className="public-order__card-placeholder" aria-hidden>
                                <span className="public-order__card-placeholder-icon">✦</span>
                              </div>
                            )}
                            {qty > 0 ? <span className="public-order__card-badge">{qty} na sacola</span> : null}
                          </div>
                          <div className="public-order__card-body">
                            <h3 className="public-order__card-title">{p.name}</h3>
                            {p.description ? <p className="public-order__card-desc">{p.description}</p> : null}
                            <div className="public-order__card-footer">
                              <div className="public-order__price-block">
                                <span className="public-order__price">{formatBrl(p.price)}</span>
                                <span className="public-order__stock">Até {p.stock} un.</span>
                              </div>
                              <div className="public-order__card-actions">
                                {qty > 0 ? (
                                  <div className="public-order__stepper">
                                    <button
                                      type="button"
                                      className="public-order__stepper-btn"
                                      onClick={() => removeFromCart(p.id)}
                                      aria-label={`Remover um ${p.name}`}
                                    >
                                      −
                                    </button>
                                    <span className="public-order__stepper-qty">{qty}</span>
                                    <button
                                      type="button"
                                      className="public-order__stepper-btn"
                                      onClick={() => addToCart(p.id, p.stock)}
                                      disabled={qty >= p.stock}
                                      aria-label={`Adicionar um ${p.name}`}
                                    >
                                      +
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="public-order__cta public-order__cta--primary public-order__cta--card"
                                    onClick={() => addToCart(p.id, p.stock)}
                                  >
                                    Adicionar
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </main>

          {cartItems.length > 0 && (
            <div className="public-order__dock">
              <div className="public-order__dock-inner">
                <div className="public-order__dock-sum">
                  <span className="public-order__dock-label">Subtotal</span>
                  <span className="public-order__dock-total">{formatBrl(subtotal)}</span>
                  <span className="public-order__dock-items">{cartCount} itens</span>
                </div>
                <button
                  type="button"
                  className="public-order__cta public-order__cta--primary public-order__cta--dock"
                  onClick={() => setStep("details")}
                >
                  Finalizar pedido
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {step === "details" && (
        <>
          <header className="public-order__topbar">
            <div className="public-order__topbar-inner">
              <div className="public-order__brand-lockup public-order__brand-lockup--compact">
                <img
                  src={BRAND_LOGO_SRC}
                  alt="E-Sentinel"
                  width={40}
                  height={40}
                  className="public-order__logo public-order__logo--sm"
                  decoding="async"
                />
                <div className="public-order__brand-text">
                  <span className="public-order__eyebrow">Finalizar</span>
                  <span className="public-order__store-name">{menu.businessName}</span>
                </div>
              </div>
            </div>
          </header>
          <div className="public-order__checkout">
          <div className="public-order__checkout-head">
            <button type="button" className="public-order__back" onClick={() => setStep("shop")}>
              ← Voltar ao cardápio
            </button>
            <h2 className="public-order__checkout-title">Quase lá</h2>
            <p className="public-order__checkout-lead">Informe seus dados para identificarmos seu pedido.</p>
          </div>

          <div className="public-order__checkout-grid">
            <div className="public-order__checkout-form">
              <label className="public-order__field">
                <span className="public-order__field-label">Nome completo</span>
                <input
                  className="public-order__input"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  autoComplete="name"
                  placeholder="Como devemos chamar você"
                />
              </label>
              <label className="public-order__field">
                <span className="public-order__field-label">WhatsApp</span>
                <input
                  className="public-order__input"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="DDD + número"
                />
              </label>
              {submitError ? <p className="public-order__field-error">{submitError}</p> : null}
              <div className="public-order__checkout-actions">
                <button type="button" className="public-order__cta public-order__cta--ghost" onClick={() => setStep("shop")}>
                  Voltar
                </button>
                <button
                  type="button"
                  className="public-order__cta public-order__cta--primary"
                  disabled={submitting}
                  onClick={() => void handleSubmitOrder()}
                >
                  {submitting ? "Enviando…" : "Confirmar e ver PIX"}
                </button>
              </div>
            </div>

            <aside className="public-order__checkout-aside" aria-label="Resumo do pedido">
              <div className="public-order__summary-card">
                <h3 className="public-order__summary-heading">Seu pedido</h3>
                <ul className="public-order__summary-lines">
                  {cartItems.map(({ product, qty }) => (
                    <li key={product.id} className="public-order__summary-line">
                      <span>
                        {qty}× {product.name}
                      </span>
                      <span>{formatBrl(product.price * qty)}</span>
                    </li>
                  ))}
                </ul>
                <div className="public-order__summary-total-row">
                  <span>Total</span>
                  <strong>{formatBrl(subtotal)}</strong>
                </div>
              </div>
            </aside>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

function BrandedHero({ businessName, tagline }: { businessName: string; tagline: string }) {
  return (
    <div className="public-order__hero public-order__hero--minimal">
      <div className="public-order__hero-inner">
        <div className="public-order__brand-lockup">
          <img src={BRAND_LOGO_SRC} alt="E-Sentinel" width={56} height={56} className="public-order__logo" />
          <div className="public-order__brand-text">
            <span className="public-order__eyebrow">{tagline}</span>
            <span className="public-order__store-name">{businessName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
