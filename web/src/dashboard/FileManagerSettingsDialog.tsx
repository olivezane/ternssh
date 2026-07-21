import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n";
import {
  parseFileManagerWidgetConfig,
  serializeFileManagerWidgetConfig,
  type FileManagerWidgetConfig,
} from "@/lib/file-manager-widget-config";

interface FileManagerSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configJson: string | null;
  onSaved: (configJson: string) => void;
}

export function FileManagerSettingsDialog({
  open,
  onOpenChange,
  configJson,
  onSaved,
}: FileManagerSettingsDialogProps) {
  const t = useT();
  const [config, setConfig] = useState<FileManagerWidgetConfig>(() =>
    parseFileManagerWidgetConfig(configJson),
  );

  useEffect(() => {
    if (!open) return;
    setConfig(parseFileManagerWidgetConfig(configJson));
  }, [open, configJson]);

  if (!open) return null;

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSaved(serializeFileManagerWidgetConfig(config));
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("fileManager.settingsTitle")}</h2>
        <Button variant="ghost" onClick={handleClose}>
          {t("common.close")}
        </Button>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="flex items-start gap-3">
          <input
            checked={config.followTerminalCwd}
            className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
            id="file-manager-follow-terminal"
            type="checkbox"
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                followTerminalCwd: event.target.checked,
              }))
            }
          />
          <div className="grid gap-1">
            <Label htmlFor="file-manager-follow-terminal">
              {t("fileManager.followTerminalCwd")}
            </Label>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              {t("fileManager.followTerminalCwdHint")}
            </p>
          </div>
        </label>

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
