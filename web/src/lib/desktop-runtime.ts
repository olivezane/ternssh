export interface DesktopHandlers {
  openAddWidget?: () => void;
  openSettings?: () => void;
  logout?: () => void;
  addWidget?: (type: string) => void;
}

export interface TernsshDesktopRuntimeApi {
  registerHandlers(handlers: DesktopHandlers): void;
  openAddWidget(): void;
  openSettings(): void;
  logout(): void;
  addWidget(type: string): void;
  requestNativeLogout?(): void;
}

export interface TernsshDesktopRuntime {
  host: "desktop";
  platform: "macos" | "windows";
  version: string;
  api: TernsshDesktopRuntimeApi;
}

declare global {
  interface Window {
    __TERNSSH_RUNTIME__?: TernsshDesktopRuntime;
    __TERNSSH_BRIDGE_INIT__?: boolean;
  }
}

export function getDesktopRuntime(): TernsshDesktopRuntime | null {
  if (typeof window === "undefined") {
    return null;
  }

  const runtime = window.__TERNSSH_RUNTIME__;
  if (!runtime || runtime.host !== "desktop") {
    return null;
  }

  return runtime;
}

export function isDesktopApp(): boolean {
  return getDesktopRuntime() !== null;
}

export function getDesktopPlatform(): TernsshDesktopRuntime["platform"] | null {
  return getDesktopRuntime()?.platform ?? null;
}

export function registerDesktopHandlers(handlers: DesktopHandlers): () => void {
  const runtime = getDesktopRuntime();
  if (!runtime) {
    return () => {};
  }

  runtime.api.registerHandlers(handlers);
  return () => {
    runtime.api.registerHandlers({});
  };
}

export function invokeDesktopApi(
  method: keyof Pick<
    TernsshDesktopRuntimeApi,
    "openAddWidget" | "openSettings" | "logout"
  >,
): void {
  getDesktopRuntime()?.api[method]?.();
}

type PendingDesktopAction =
  | { action: "openAddWidget" | "openSettings" | "logout" }
  | { action: "addWidget"; type: string };

let connectedHandlers: DesktopHandlers = {};
const pendingActions: PendingDesktopAction[] = [];

function runDesktopAction(action: PendingDesktopAction) {
  switch (action.action) {
    case "openAddWidget":
      connectedHandlers.openAddWidget?.();
      break;
    case "openSettings":
      connectedHandlers.openSettings?.();
      break;
    case "logout":
      connectedHandlers.logout?.();
      break;
    case "addWidget":
      connectedHandlers.addWidget?.(action.type);
      break;
  }
}

function flushPendingDesktopActions() {
  if (pendingActions.length === 0) {
    return;
  }
  const queued = pendingActions.splice(0, pendingActions.length);
  queued.forEach(runDesktopAction);
}

export function initDesktopBridgeHub() {
  if (typeof window === "undefined" || window.__TERNSSH_BRIDGE_INIT__) {
    return;
  }
  window.__TERNSSH_BRIDGE_INIT__ = true;

  window.addEventListener("ternssh-desktop:open-add-widget", () => {
    if (connectedHandlers.openAddWidget) {
      connectedHandlers.openAddWidget();
      return;
    }
    pendingActions.push({ action: "openAddWidget" });
  });

  window.addEventListener("ternssh-desktop:open-settings", () => {
    if (connectedHandlers.openSettings) {
      connectedHandlers.openSettings();
      return;
    }
    pendingActions.push({ action: "openSettings" });
  });

  window.addEventListener("ternssh-desktop:logout", () => {
    if (connectedHandlers.logout) {
      connectedHandlers.logout();
      return;
    }
    pendingActions.push({ action: "logout" });
  });

  window.addEventListener("ternssh-desktop:add-widget", (event) => {
    const type = (event as CustomEvent<{ type?: string }>).detail?.type;
    if (typeof type !== "string") {
      return;
    }
    if (connectedHandlers.addWidget) {
      connectedHandlers.addWidget(type);
      return;
    }
    pendingActions.push({ action: "addWidget", type });
  });
}

export function connectDesktopBridgeHub(handlers: DesktopHandlers): () => void {
  connectedHandlers = handlers;
  flushPendingDesktopActions();
  return () => {
    connectedHandlers = {};
  };
}
