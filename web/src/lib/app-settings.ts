import type { Locale } from "@/i18n/locales/index";
import { detectBrowserLocale } from "@/i18n/locales/index";
import {
  BACKGROUND_STORAGE_KEY,
  GRID_MARGIN_STORAGE_KEY,
  WIDGET_OPACITY_STORAGE_KEY,
} from "@/theme/personalization";
import { THEME_STORAGE_KEY } from "@/theme/theme";
import { TERMINAL_THEME_STORAGE_KEY } from "@/theme/terminal-theme";

export const LOCALE_STORAGE_KEY = "ternssh-locale";
export const TERMINAL_HISTORY_STORAGE_KEY = "ternssh-terminal-history";
export const STATUS_POLL_INTERVAL_STORAGE_KEY = "ternssh-status-poll-interval";
export const LAYOUT_LOCK_STORAGE_KEY = "ternssh-layout-lock";

export const APP_SETTINGS_STORAGE_KEYS = [
  LOCALE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  BACKGROUND_STORAGE_KEY,
  WIDGET_OPACITY_STORAGE_KEY,
  GRID_MARGIN_STORAGE_KEY,
  TERMINAL_THEME_STORAGE_KEY,
  TERMINAL_HISTORY_STORAGE_KEY,
  STATUS_POLL_INTERVAL_STORAGE_KEY,
  LAYOUT_LOCK_STORAGE_KEY,
] as const;

export function clearAppSettingsStorage(): void {
  for (const key of APP_SETTINGS_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}

export function detectDefaultLocale(): Locale {
  return detectBrowserLocale();
}

export const SETTINGS_RESET_EVENT = "ternssh:settings-reset";
export const LAYOUT_IMPORTED_EVENT = "ternssh:layout-imported";
export const STATUS_POLL_INTERVAL_CHANGED_EVENT =
  "ternssh:status-poll-interval-changed";
export const LAYOUT_LOCK_CHANGED_EVENT = "ternssh:layout-lock-changed";

export function dispatchSettingsResetEvent(): void {
  window.dispatchEvent(new CustomEvent(SETTINGS_RESET_EVENT));
}

export function dispatchLayoutImportedEvent(): void {
  window.dispatchEvent(new CustomEvent(LAYOUT_IMPORTED_EVENT));
}
