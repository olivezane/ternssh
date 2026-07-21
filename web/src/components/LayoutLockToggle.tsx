import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import {
  LAYOUT_LOCK_CHANGED_EVENT,
  SETTINGS_RESET_EVENT,
} from "@/lib/app-settings";
import {
  readLayoutLocked,
  writeLayoutLocked,
} from "@/lib/layout-lock";

export function LayoutLockToggle() {
  const t = useT();
  const [locked, setLocked] = useState(readLayoutLocked);

  useEffect(() => {
    const sync = () => setLocked(readLayoutLocked());
    window.addEventListener(LAYOUT_LOCK_CHANGED_EVENT, sync);
    window.addEventListener(SETTINGS_RESET_EVENT, sync);
    return () => {
      window.removeEventListener(LAYOUT_LOCK_CHANGED_EVENT, sync);
      window.removeEventListener(SETTINGS_RESET_EVENT, sync);
    };
  }, []);

  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={locked}
        onChange={(event) => {
          writeLayoutLocked(event.target.checked);
          setLocked(event.target.checked);
        }}
      />
      <span>
        <span className="font-medium">{t("settings.layoutLock")}</span>
        <span className="mt-1 block text-[11px] text-[var(--color-muted-foreground)]">
          {t("settings.layoutLockHint")}
        </span>
      </span>
    </label>
  );
}
