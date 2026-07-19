import { LayoutGrid } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { ADDABLE_WIDGETS } from "./widgets";
import { AddWidgetDialog } from "./AddWidgetDialog";

interface AddWidgetMenuProps {
  existingTypes: Set<string>;
  onAdd: (type: string) => void;
  disabled?: boolean;
}

export function AddWidgetMenu({
  existingTypes,
  onAdd,
  disabled = false,
}: AddWidgetMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const availableCount = ADDABLE_WIDGETS.filter(
    (widget) => !existingTypes.has(widget.type),
  ).length;

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={disabled || availableCount === 0}
        onClick={() => setOpen(true)}
      >
        <LayoutGrid className="mr-1 h-3.5 w-3.5" />
        {t("header.addWidget")}
      </Button>

      <AddWidgetDialog
        open={open}
        onOpenChange={setOpen}
        existingTypes={existingTypes}
        onAdd={onAdd}
        disabled={disabled}
      />
    </>
  );
}
