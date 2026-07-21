import {
  extractOsc7Cwd,
  isAbsoluteRemotePath,
  normalizeRemotePath,
  parseCdCommand,
  resolvePathForSftp,
} from "@/lib/terminal-cwd";

interface TerminalCwdState {
  cwd: string;
  previousCwd: string | null;
}

const cwdBySession = new Map<string, TerminalCwdState>();
const homeByServer = new Map<string, string>();
const listeners = new Map<string, Set<(cwd: string) => void>>();

function getState(sessionId: string): TerminalCwdState {
  const existing = cwdBySession.get(sessionId);
  if (existing) return existing;

  const initial: TerminalCwdState = {
    cwd: ".",
    previousCwd: null,
  };
  cwdBySession.set(sessionId, initial);
  return initial;
}

function notify(sessionId: string, cwd: string): void {
  for (const listener of listeners.get(sessionId) ?? []) {
    listener(cwd);
  }
}

export function setTerminalHomeDir(serverId: string, homeDir: string): void {
  if (!homeDir || homeDir === ".") return;
  homeByServer.set(serverId, homeDir);
}

export function getTerminalHomeDir(serverId: string): string | null {
  return homeByServer.get(serverId) ?? null;
}

export function getTerminalCwd(sessionId: string): string {
  return getState(sessionId).cwd;
}

export function setTerminalCwd(sessionId: string, cwd: string): void {
  if (!cwd) return;
  const normalized = normalizeRemotePath(cwd);
  const state = getState(sessionId);
  if (state.cwd === normalized) return;
  state.previousCwd = state.cwd;
  state.cwd = normalized;
  notify(sessionId, normalized);
}

export function syncTerminalCwdFromRemotePath(
  sessionId: string,
  remotePath: string,
): void {
  if (!remotePath || remotePath === ".") return;
  const state = getState(sessionId);
  if (state.cwd !== "." && isAbsoluteRemotePath(state.cwd)) return;
  if (state.cwd === remotePath) return;
  state.cwd = remotePath;
  notify(sessionId, remotePath);
}

export function resolveTerminalPathForSftp(
  sessionId: string,
  serverId: string,
  currentRemotePath: string,
  cwd = getTerminalCwd(sessionId),
): string | null {
  return resolvePathForSftp(
    cwd,
    getTerminalHomeDir(serverId),
    currentRemotePath,
  );
}

export function updateTerminalCwdFromCommand(
  sessionId: string,
  serverId: string,
  command: string,
): void {
  const state = getState(sessionId);
  const parsed = parseCdCommand(
    command,
    state.cwd,
    getTerminalHomeDir(serverId),
    state.previousCwd,
  );
  if (!parsed) return;

  if (state.cwd === parsed.nextCwd) return;
  state.previousCwd = parsed.previousCwd;
  state.cwd = parsed.nextCwd;
  notify(sessionId, parsed.nextCwd);
}

export function updateTerminalCwdFromOutput(
  sessionId: string,
  output: string,
): void {
  const cwd = extractOsc7Cwd(output);
  if (!cwd) return;
  setTerminalCwd(sessionId, cwd);
}

export function subscribeTerminalCwd(
  sessionId: string,
  listener: (cwd: string) => void,
): () => void {
  let sessionListeners = listeners.get(sessionId);
  if (!sessionListeners) {
    sessionListeners = new Set();
    listeners.set(sessionId, sessionListeners);
  }

  sessionListeners.add(listener);

  return () => {
    sessionListeners?.delete(listener);
    if (sessionListeners?.size === 0) {
      listeners.delete(sessionId);
    }
  };
}

export function clearTerminalCwd(sessionId: string): void {
  cwdBySession.delete(sessionId);
  listeners.delete(sessionId);
}
