import { useEffect, useMemo, useState } from "react";
import { TerminalThemeSettings } from "@/components/TerminalThemeSettings";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import {
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  parseTerminalWidgetConfig,
  serializeTerminalWidgetConfig,
  type TerminalWidgetConfig,
} from "@/lib/terminal-widget-config";
import {
  getAppThemeTerminalColors,
  resolveTerminalXtermTheme,
  useTheme,
  type CustomTerminalThemeColors,
  type TerminalThemeMode,
} from "@/theme";

interface TerminalSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configJson: string | null;
  onSaved: (configJson: string) => void;
}

export function TerminalSettingsDialog({
  open,
  onOpenChange,
  configJson,
  onSaved,
}: TerminalSettingsDialogProps) {
  const t = useT();
  const { resolvedTheme } = useTheme();
  const [config, setConfig] = useState<TerminalWidgetConfig>(() =>
    parseTerminalWidgetConfig(configJson),
  );

  useEffect(() => {
    if (!open) return;
    setConfig(parseTerminalWidgetConfig(configJson));
  }, [open, configJson]);

  const resolvedTerminalColors = useMemo(
    () => resolveTerminalXtermTheme(config.theme, resolvedTheme),
    [config.theme, resolvedTheme],
  );

  if (!open) return null;

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleModeChange = (mode: TerminalThemeMode) => {
    setConfig((current) => ({
      ...current,
      theme: { ...current.theme, mode },
    }));
  };

  const handleColorChange = (
    key: keyof CustomTerminalThemeColors,
    value: string,
  ) => {
    setConfig((current) => ({
      ...current,
      theme: {
        mode: "custom",
        custom: {
          ...current.theme.custom,
          [key]: value.toLowerCase(),
        },
      },
    }));
  };

  const handleResetCustom = () => {
    setConfig((current) => ({
      ...current,
      theme: {
        mode: "custom",
        custom: getAppThemeTerminalColors(resolvedTheme),
      },
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSaved(serializeTerminalWidgetConfig(config));
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("terminal.settingsTitle")}</h2>
        <Button variant="ghost" onClick={handleClose}>
          {t("common.close")}
        </Button>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="widget-terminal-font-size">
              {t("terminal.fontSize")}
            </Label>
            <span className="text-xs tabular-nums text-[var(--color-muted-foreground)]">
              {config.fontSize}px
            </span>
          </div>
          <input
            id="widget-terminal-font-size"
            type="range"
            min={MIN_TERMINAL_FONT_SIZE}
            max={MAX_TERMINAL_FONT_SIZE}
            step={1}
            value={config.fontSize}
            className="h-2 w-full cursor-pointer accent-[var(--color-primary)]"
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                fontSize: Number(event.target.value),
              }))
            }
          />
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            {t("terminal.fontSizeHint", {
              min: MIN_TERMINAL_FONT_SIZE,
              max: MAX_TERMINAL_FONT_SIZE,
            })}
          </p>
        </div>

        <TerminalThemeSettings
          idPrefix="widget-terminal"
          terminalTheme={config.theme}
          resolvedTerminalColors={resolvedTerminalColors}
          onModeChange={handleModeChange}
          onColorChange={handleColorChange}
          onResetCustom={handleResetCustom}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit">{t("common.save")}</Button>
        </div>
      </form>
    </Modal>
  );
}
