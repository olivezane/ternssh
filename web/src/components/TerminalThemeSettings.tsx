import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import type {
  CustomTerminalThemeColors,
  TerminalThemeColors,
  TerminalThemeConfig,
  TerminalThemeMode,
} from "@/theme";

const COLOR_FIELDS: Array<{
  key: keyof CustomTerminalThemeColors;
  labelKey: string;
}> = [
  { key: "foreground", labelKey: "terminal.terminalColorForeground" },
  { key: "cursor", labelKey: "terminal.terminalColorCursor" },
];

interface TerminalThemeSettingsProps {
  idPrefix?: string;
  terminalTheme: TerminalThemeConfig;
  resolvedTerminalColors: TerminalThemeColors;
  onModeChange: (mode: TerminalThemeMode) => void;
  onColorChange: (key: keyof CustomTerminalThemeColors, value: string) => void;
  onResetCustom: () => void;
}

export function TerminalThemeSettings({
  idPrefix = "terminal",
  terminalTheme,
  resolvedTerminalColors,
  onModeChange,
  onColorChange,
  onResetCustom,
}: TerminalThemeSettingsProps) {
  const t = useT();

  return (
    <div className="grid gap-2">
      <Label htmlFor={`${idPrefix}-terminal-theme`}>
        {t("terminal.terminalTheme")}
      </Label>
      <select
        id={`${idPrefix}-terminal-theme`}
        className="flex h-9 w-full bg-[var(--color-secondary)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        value={terminalTheme.mode}
        onChange={(event) =>
          onModeChange(event.target.value as TerminalThemeMode)
        }
      >
        <option value="default">{t("terminal.terminalThemeDefault")}</option>
        <option value="custom">{t("terminal.terminalThemeCustom")}</option>
      </select>

      <div className="terminal-theme-preview flex h-10 items-center gap-2 border border-[var(--color-border)] px-2 font-mono text-[11px] text-[var(--color-foreground)]">
        <span
          className="inline-block h-3 w-3 rounded-full"
          style={{ backgroundColor: resolvedTerminalColors.cursor }}
          aria-hidden
        />
        <span style={{ color: resolvedTerminalColors.foreground }}>
          $ echo ternssh
        </span>
      </div>

      {terminalTheme.mode === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          {COLOR_FIELDS.map(({ key, labelKey }) => (
            <div key={key} className="grid gap-1">
              <Label
                htmlFor={`${idPrefix}-terminal-color-${key}`}
                className="text-[11px]"
              >
                {t(labelKey)}
              </Label>
              <input
                id={`${idPrefix}-terminal-color-${key}`}
                type="color"
                value={terminalTheme.custom[key]}
                className="h-9 w-full cursor-pointer border border-[var(--color-border)] bg-transparent p-1"
                onChange={(event) => onColorChange(key, event.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      {terminalTheme.mode === "custom" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start px-0"
          onClick={onResetCustom}
        >
          {t("terminal.terminalThemeReset")}
        </Button>
      )}

      <p className="text-[11px] text-[var(--color-muted-foreground)]">
        {t("terminal.terminalThemeHint")}
      </p>
    </div>
  );
}
