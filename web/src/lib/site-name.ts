export const DEFAULT_SITE_NAME = "ternssh";
export const SITE_NAME_MAX_LENGTH = 64;
/** @deprecated Legacy localStorage key; migrated to database on load. */
export const SITE_NAME_STORAGE_KEY = "ternssh-site-name";

export function normalizeSiteName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_SITE_NAME;
  return trimmed.slice(0, SITE_NAME_MAX_LENGTH);
}

export function resolveSiteName(stored: string | null | undefined): string {
  if (!stored) return DEFAULT_SITE_NAME;
  return normalizeSiteName(stored);
}

export function applySiteName(name: string): string {
  const normalized = normalizeSiteName(name);
  document.title = normalized;
  return normalized;
}

export function readLegacyStoredSiteName(): string | null {
  const stored = localStorage.getItem(SITE_NAME_STORAGE_KEY);
  if (!stored) return null;
  return normalizeSiteName(stored);
}

export function clearLegacyStoredSiteName(): void {
  localStorage.removeItem(SITE_NAME_STORAGE_KEY);
}
