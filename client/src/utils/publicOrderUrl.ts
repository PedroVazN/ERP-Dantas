/** Mesmo valor que PUBLIC_ORDER_SECRET no servidor (definir no build do front). */
export function getPublicOrderSecret(): string {
  return (import.meta.env.VITE_PUBLIC_ORDER_SECRET as string | undefined)?.trim() || "";
}

export function buildPublicOrderUrl(origin: string, lojaBusinessId: string, codigo: string): string {
  const u = new URL("/pedido", origin);
  u.searchParams.set("loja", lojaBusinessId);
  u.searchParams.set("codigo", codigo);
  return u.toString();
}

export function publicOrderQrImageUrl(fullUrl: string, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(fullUrl)}`;
}
