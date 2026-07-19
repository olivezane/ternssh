import { SettingsDialog } from "@/components/SettingsDialog";
import { isDesktopApp } from "@/lib/desktop-runtime";
import { AddWidgetDialog } from "./AddWidgetDialog";

interface DashboardDesktopChromeProps {
  existingTypes: Set<string>;
  onAddWidget: (type: string) => void;
  addWidgetOpen: boolean;
  onAddWidgetOpenChange: (open: boolean) => void;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  disabled?: boolean;
}

export function DashboardDesktopChrome({
  existingTypes,
  onAddWidget,
  addWidgetOpen,
  onAddWidgetOpenChange,
  settingsOpen,
  onSettingsOpenChange,
  disabled = false,
}: DashboardDesktopChromeProps) {
  if (!isDesktopApp()) {
    return null;
  }

  return (
    <>
      <AddWidgetDialog
        open={addWidgetOpen}
        onOpenChange={onAddWidgetOpenChange}
        existingTypes={existingTypes}
        onAdd={onAddWidget}
        disabled={disabled}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={onSettingsOpenChange} />
    </>
  );
}
