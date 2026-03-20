export function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseLooseNumber(raw: string) {
  const normalized = raw.replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

