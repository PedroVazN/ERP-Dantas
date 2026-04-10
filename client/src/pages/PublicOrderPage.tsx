import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL } from "../api";
import "./PublicOrderPage.css";

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

  const subtotal = useMemo(
    () => cartItems.reduce((sum, row) => sum + row.product.price * row.qty, 0),
    [cartItems]
  );

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

  if (!businessId || !token) {
    return (
      <div className="public-order">
        <div className="public-order__panel public-order__panel--narrow">
          <h1 className="public-order__title">Pedido online</h1>
          <p className="public-order__muted">
            Este endereço precisa incluir o código da loja e o código de acesso. Peça o link completo ao
            estabelecimento.
          </p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="public-order">
        <div className="public-order__panel public-order__panel--narrow">
          <h1 className="public-order__title">Não foi possível abrir o cardápio</h1>
          <p className="public-order__error">{loadError}</p>
          <button type="button" className="public-order__btn" onClick={() => void loadMenu()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!menu) {
    return (
      <div className="public-order public-order--center">
        <p className="public-order__muted">Carregando cardápio…</p>
      </div>
    );
  }

  if (step === "done" && createdSale) {
    return (
      <div className="public-order">
        <header className="public-order__header">
          <h1 className="public-order__brand">{menu.businessName}</h1>
          <p className="public-order__muted">Pedido recebido</p>
        </header>
        <div className="public-order__panel">
          <p>
            Valor: <strong>{formatBrl(createdSale.totalAmount)}</strong>
          </p>
          {createdSale.invoice?.number && (
            <p className="public-order__muted">Referência: {createdSale.invoice.number}</p>
          )}
          <p className="public-order__pix-hint">
            Escaneie o QR Code PIX abaixo para pagar. Após o pagamento, a loja confirma o pedido no
            sistema.
          </p>
          <div className="public-order__pix-wrap">
            <img src="/pix.jpg" alt="QR Code PIX" className="public-order__pix-img" />
          </div>
          <p className="public-order__muted public-order__small">
            Guarde este comprovante. Em caso de dúvida, informe o telefone cadastrado no pedido.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-order">
      <header className="public-order__header">
        <h1 className="public-order__brand">{menu.businessName}</h1>
        <p className="public-order__muted">Monte seu pedido abaixo</p>
      </header>

      {step === "shop" && (
        <>
          <div className="public-order__grid">
            {menu.products.map((p) => {
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
                      <div className="public-order__card-placeholder" aria-hidden />
                    )}
                  </div>
                  <div className="public-order__card-body">
                    <h2 className="public-order__card-title">{p.name}</h2>
                    {p.description ? (
                      <p className="public-order__card-desc">{p.description}</p>
                    ) : null}
                    <div className="public-order__card-row">
                      <span className="public-order__price">{formatBrl(p.price)}</span>
                      <span className="public-order__stock">Estoque: {p.stock}</span>
                    </div>
                    <div className="public-order__card-actions">
                      {qty > 0 ? (
                        <div className="public-order__stepper">
                          <button
                            type="button"
                            className="public-order__stepper-btn"
                            onClick={() => removeFromCart(p.id)}
                            aria-label="Remover um"
                          >
                            −
                          </button>
                          <span className="public-order__stepper-qty">{qty}</span>
                          <button
                            type="button"
                            className="public-order__stepper-btn"
                            onClick={() => addToCart(p.id, p.stock)}
                            disabled={qty >= p.stock}
                            aria-label="Adicionar um"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="public-order__btn public-order__btn--primary"
                          onClick={() => addToCart(p.id, p.stock)}
                        >
                          Adicionar
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {cartItems.length > 0 && (
            <div className="public-order__bar">
              <div className="public-order__bar-inner">
                <span>
                  {cartItems.reduce((n, r) => n + r.qty, 0)} itens · {formatBrl(subtotal)}
                </span>
                <button
                  type="button"
                  className="public-order__btn public-order__btn--primary"
                  onClick={() => setStep("details")}
                >
                  Continuar
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {step === "details" && (
        <div className="public-order__panel public-order__panel--narrow">
          <h2 className="public-order__subtitle">Seus dados</h2>
          <label className="public-order__label">
            Nome
            <input
              className="public-order__input"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              autoComplete="name"
              placeholder="Como identificamos seu pedido"
            />
          </label>
          <label className="public-order__label">
            WhatsApp / telefone
            <input
              className="public-order__input"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              autoComplete="tel"
              inputMode="tel"
              placeholder="DDD + número"
            />
          </label>

          <div className="public-order__summary">
            <h3 className="public-order__summary-title">Resumo</h3>
            <ul className="public-order__summary-list">
              {cartItems.map(({ product, qty }) => (
                <li key={product.id}>
                  {qty}× {product.name} — {formatBrl(product.price * qty)}
                </li>
              ))}
            </ul>
            <p className="public-order__summary-total">
              Total <strong>{formatBrl(subtotal)}</strong>
            </p>
          </div>

          {submitError ? <p className="public-order__error">{submitError}</p> : null}

          <div className="public-order__actions">
            <button type="button" className="public-order__btn" onClick={() => setStep("shop")}>
              Voltar
            </button>
            <button
              type="button"
              className="public-order__btn public-order__btn--primary"
              disabled={submitting}
              onClick={() => void handleSubmitOrder()}
            >
              {submitting ? "Enviando…" : "Gerar pedido e PIX"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
