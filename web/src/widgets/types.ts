import type { Dispatch, SetStateAction } from "react";
import type { ServerSession, SessionStatus } from "@/lib/sessions";

export interface WidgetContext {
  activeServerId: string | null;
  activeSessionId: string | null;
  sessions: Record<string, ServerSession>;
  onSelectServer: (serverId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onConnectServer: (serverId: string) => void;
  onAddTerminal: (serverId?: string) => void;
  onCloseTerminal: (sessionId: string) => void;
  onDisconnectServer: (serverId: string) => void;
}

export interface WidgetProps {
  context: WidgetContext;
}

export interface ServerListWidgetProps extends WidgetProps {
  tree: import("@/lib/api").TreeNode[];
  loading: boolean;
  moving: boolean;
  onDeleteServer: (serverId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onMoveItem: (input: {
    type: "server" | "group";
    id: string;
    parentId: string | null;
    index: number;
  }) => Promise<void>;
  onAddServer: (groupId: string | null) => void;
  onAddGroup: (parentId: string | null) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onCopyServer: (serverId: string) => void;
  onEditServer: (serverId: string) => void;
  expanded: Set<string>;
  onExpandedChange: Dispatch<SetStateAction<Set<string>>>;
}

export type SessionCloseReason = "auth_failed" | "disconnected";

export interface TerminalWidgetProps {
  /** Tabs for the active server only. */
  serverSessions: ServerSession[];
  /** All sessions across servers; kept mounted to preserve SSH connections. */
  allSessions: ServerSession[];
  activeServerId: string | null;
  activeSessionId: string | null;
  configJson: string | null;
  onSelectSession: (sessionId: string) => void;
  onAddTerminal: () => void;
  onCloseTerminal: (sessionId: string) => void;
  onSessionStatusChange: (sessionId: string, status: SessionStatus) => void;
  onSessionClosed: (sessionId: string, reason?: SessionCloseReason) => void;
  onStatusChange?: (status: string) => void;
}
