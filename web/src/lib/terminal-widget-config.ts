import {
  createDefaultTerminalThemeConfig,
  getStoredTerminalThemeConfig,
  type CustomTerminalThemeColors,
  type TerminalThemeConfig,
  type TerminalThemeMode,
} from "@/theme/terminal-theme";

export interface TerminalWidgetConfig {
  theme: TerminalThemeConfig;
  fontSize: number;
}

export const DEFAULT_TERMINAL_FONT_SIZE = 13;
export const MIN_TERMINAL_FONT_SIZE = 10;
export const MAX_TERMINAL_FONT_SIZE = 24;

const DEFAULT_TERMINAL_WIDGET_CONFIG: TerminalWidgetConfig = {
  theme: createDefaultTerminalThemeConfig(),
  fontSize: DEFAULT_TERMINAL_FONT_SIZE,
};

function clampFontSize(value: number): number {
  return Math.min(
    MAX_TERMINAL_FONT_SIZE,
    Math.max(MIN_TERMINAL_FONT_SIZE, Math.round(value)),
  );
}

function parseHexColor(value: unknown, fallback: string): string {
  if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toLowerCase();
  }
  return fallback;
}

function parseTerminalThemeConfig(raw: unknown): TerminalThemeConfig | null {
  if (typeof raw !== "object" || raw === null) return null;

  const parsed = raw as Partial<{
    mode: TerminalThemeMode;
    custom: Partial<CustomTerminalThemeColors>;
  }>;
  const fallback = createDefaultTerminalThemeConfig();
  const mode = parsed.mode === "custom" ? "custom" : "default";

  return {
    mode,
    custom: {
      foreground: parseHexColor(
        parsed.custom?.foreground,
        fallback.custom.foreground,
      ),
      cursor: parseHexColor(parsed.custom?.cursor, fallback.custom.cursor),
    },
  };
}

export function parseTerminalWidgetConfig(
  configJson: string | null | undefined,
): TerminalWidgetConfig {
  if (!configJson) {
    return {
      theme: getStoredTerminalThemeConfig(),
      fontSize: DEFAULT_TERMINAL_FONT_SIZE,
    };
  }

  try {
    const parsed = JSON.parse(configJson) as Partial<{
      theme: unknown;
      fontSize: unknown;
    }>;
    const theme = parseTerminalThemeConfig(parsed.theme);
    const fontSize =
      typeof parsed.fontSize === "number"
        ? clampFontSize(parsed.fontSize)
        : DEFAULT_TERMINAL_FONT_SIZE;
    if (theme) {
      return { theme, fontSize };
    }
  } catch {
    // fall through to legacy migration
  }

  return {
    theme: getStoredTerminalThemeConfig(),
    fontSize: DEFAULT_TERMINAL_FONT_SIZE,
  };
}

export function serializeTerminalWidgetConfig(
  config: TerminalWidgetConfig,
): string {
  return JSON.stringify({
    theme: {
      mode: config.theme.mode === "custom" ? "custom" : "default",
      custom: {
        foreground: config.theme.custom.foreground,
        cursor: config.theme.custom.cursor,
      },
    },
    fontSize: clampFontSize(config.fontSize),
  });
}

export { DEFAULT_TERMINAL_WIDGET_CONFIG };
