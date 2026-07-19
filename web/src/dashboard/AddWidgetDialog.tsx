import {
  LayoutGrid,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  ADDABLE_WIDGETS,
  widgetDescriptionKey,
  widgetIcon,
  widgetTitleKey,
} from "./widget-catalog";

interface AddWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingTypes: Set<string>;
  onAdd: (type: string) => void;
  disabled?: boolean;
}

export function AddWidgetDialog({
  open,
  onOpenChange,
  existingTypes,
  onAdd,
  disabled = false,
}: AddWidgetDialogProps) {
  const t = useT();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const filteredWidgets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return ADDABLE_WIDGETS;
    }

    return ADDABLE_WIDGETS.filter((widget) => {
      const title = t(widgetTitleKey(widget.type)).toLowerCase();
      const description = t(widgetDescriptionKey(widget.type)).toLowerCase();
      const type = widget.type.toLowerCase();
      return (
        title.includes(normalized)
        || description.includes(normalized)
        || type.includes(normalized)
      );
    });
  }, [query, t]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} className="max-w-xl">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-[var(--color-muted-foreground)]" />
          <h2 className="text-base font-semibold">{t("header.addWidget")}</h2>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("header.addWidgetSearchPlaceholder")}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-[min(420px,60vh)] space-y-2 overflow-y-auto pr-1">
          {filteredWidgets.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
              {t("header.addWidgetNoResults")}
            </p>
          ) : (
            filteredWidgets.map((widget) => {
              const exists = existingTypes.has(widget.type);
              const Icon = widgetIcon(widget.type);
              return (
                <button
                  key={widget.type}
                  type="button"
                  disabled={disabled || exists}
                  className={cn(
                    "flex w-full items-start gap-3 rounded border px-3 py-3 text-left transition-colors",
                    exists
                      ? "cursor-not-allowed border-[var(--color-border)] opacity-50"
                      : "border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-secondary)]",
                  )}
                  onClick={() => {
                    if (exists || disabled) return;
                    onAdd(widget.type);
                    onOpenChange(false);
                  }}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[var(--color-secondary)] text-[var(--color-primary)]",
                      exists && "text-[var(--color-muted-foreground)]",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{t(widgetTitleKey(widget.type))}</span>
                      {exists && (
                        <span className="rounded bg-[var(--color-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                          {t("common.added")}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-[var(--color-muted-foreground)]">
                      {t(widgetDescriptionKey(widget.type))}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
