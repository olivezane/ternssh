import { useRef, useState } from "react";
import { LayoutLockToggle } from "@/components/LayoutLockToggle";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import {
  buildDashboardLayoutExport,
  DashboardLayoutImportError,
  downloadDashboardLayoutExport,
  layoutImportToDashboardWidgets,
  parseDashboardLayoutImport,
  type DashboardLayoutExport,
} from "@/lib/dashboard-layout-io";
import { dispatchLayoutImportedEvent } from "@/lib/app-settings";

export function LayoutImportExportSection() {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<DashboardLayoutExport | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = () => {
    setExporting(true);
    setError(null);
    setMessage(null);
    void api
      .getDashboard()
      .then((dashboard) => {
        downloadDashboardLayoutExport(buildDashboardLayoutExport(dashboard));
        setMessage(t("settings.layoutExportSuccess"));
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : t("settings.layoutExportFailed"),
        );
      })
      .finally(() => {
        setExporting(false);
      });
  };

  const handlePickImport = () => {
    setError(null);
    setMessage(null);
    fileInputRef.current?.click();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    void file
      .text()
      .then((text) => {
        setPendingImport(parseDashboardLayoutImport(text));
      })
      .catch((err) => {
        setPendingImport(null);
        setError(
          err instanceof DashboardLayoutImportError
            ? err.message
            : err instanceof Error
              ? err.message
              : t("settings.layoutImportFailed"),
        );
      });
  };

  const handleConfirmImport = () => {
    if (!pendingImport) return;

    setImporting(true);
    setError(null);
    setMessage(null);

    void api
      .updateDashboard({
        name: pendingImport.name,
        widgets: layoutImportToDashboardWidgets(pendingImport),
      })
      .then(() => {
        setPendingImport(null);
        setMessage(t("settings.layoutImportSuccess"));
        dispatchLayoutImportedEvent();
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : t("settings.layoutImportFailed"),
        );
      })
      .finally(() => {
        setImporting(false);
      });
  };

  return (
    <div className="border-t border-[var(--color-border)] pt-6">
      <h3 className="text-sm font-semibold">{t("settings.layoutTitle")}</h3>
      <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
        {t("settings.layoutHint")}
      </p>

      <div className="mt-3">
        <LayoutLockToggle />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportFile}
      />

      {error && (
        <p className="mt-3 text-sm text-[var(--color-destructive)]">{error}</p>
      )}

      {message && (
        <p className="mt-3 text-sm text-[var(--color-primary)]">{message}</p>
      )}

      {pendingImport ? (
        <div className="mt-3 space-y-3 rounded border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-3">
          <p className="text-sm">{t("settings.layoutImportConfirm")}</p>
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            {t("settings.layoutImportSummary", {
              count: pendingImport.widgets.length,
              name: pendingImport.name,
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={importing} onClick={handleConfirmImport}>
              {importing ? t("settings.layoutImporting") : t("settings.layoutImportAction")}
            </Button>
            <Button
              variant="secondary"
              disabled={importing}
              onClick={() => setPendingImport(null)}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={exporting} variant="secondary" onClick={handleExport}>
            {exporting ? t("settings.layoutExporting") : t("settings.layoutExportAction")}
          </Button>
          <Button variant="secondary" onClick={handlePickImport}>
            {t("settings.layoutImportPick")}
          </Button>
        </div>
      )}
    </div>
  );
}
