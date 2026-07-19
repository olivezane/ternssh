import { useLayoutEffect } from "react";
import { api } from "@/lib/api";
import { logoutBasicAuth } from "@/lib/basic-auth";
import {
  connectDesktopBridgeHub,
  getDesktopRuntime,
  registerDesktopHandlers,
  type DesktopHandlers,
} from "@/lib/desktop-runtime";

export function useDesktopBridge(handlers: DesktopHandlers): void {
  useLayoutEffect(() => {
    const unregisterRuntime = registerDesktopHandlers(handlers);
    const disconnectHub = connectDesktopBridgeHub(handlers);
    return () => {
      unregisterRuntime();
      disconnectHub();
    };
  }, [handlers]);
}

export function useDashboardDesktopBridge(options: {
  openAddWidget: () => void;
  openSettings: () => void;
}): void {
  useLayoutEffect(() => {
    const handlers: DesktopHandlers = {
      openAddWidget: options.openAddWidget,
      openSettings: options.openSettings,
      logout: () => {
        void (async () => {
          try {
            const { authMode } = await api.getMe();
            if (authMode === "basic") {
              logoutBasicAuth();
              return;
            }

            if (authMode === "access") {
              getDesktopRuntime()?.api.requestNativeLogout?.();
            }
          } catch {
            getDesktopRuntime()?.api.requestNativeLogout?.();
          }
        })();
      },
    };

    const unregisterRuntime = registerDesktopHandlers(handlers);
    const disconnectHub = connectDesktopBridgeHub(handlers);
    return () => {
      unregisterRuntime();
      disconnectHub();
    };
  }, [options.openAddWidget, options.openSettings]);
}
