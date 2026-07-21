import { useEffect, useState } from "react";
import {
  LAYOUT_LOCK_CHANGED_EVENT,
  LAYOUT_LOCK_STORAGE_KEY,
  SETTINGS_RESET_EVENT,
} from "@/lib/app-settings";

export function readLayoutLocked(): boolean {
  try {
    return localStorage.getItem(LAYOUT_LOCK_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeLayoutLocked(locked: boolean): void {
  localStorage.setItem(LAYOUT_LOCK_STORAGE_KEY, locked ? "1" : "0");
  window.dispatchEvent(new CustomEvent(LAYOUT_LOCK_CHANGED_EVENT));
}

export function useLayoutLocked(): boolean {
  const [layoutLocked, setLayoutLocked] = useState(readLayoutLocked);

  useEffect(() => {
    const sync = () => setLayoutLocked(readLayoutLocked());
    window.addEventListener(LAYOUT_LOCK_CHANGED_EVENT, sync);
    window.addEventListener(SETTINGS_RESET_EVENT, sync);
    return () => {
      window.removeEventListener(LAYOUT_LOCK_CHANGED_EVENT, sync);
      window.removeEventListener(SETTINGS_RESET_EVENT, sync);
    };
  }, []);

  return layoutLocked;
}
