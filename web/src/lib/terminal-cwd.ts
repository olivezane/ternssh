import { joinRemotePath } from "@/lib/sftp-client";

export function normalizeRemotePath(path: string): string {
  if (path === "." || path === "") return ".";
  if (path === "/") return "/";

  const isAbsolute = path.startsWith("/");
  const parts = path.split("/").filter(Boolean);
  const stack: string[] = [];

  for (const part of parts) {
    if (part === ".") continue;
    if (part === "..") {
      stack.pop();
      continue;
    }
    stack.push(part);
  }

  const joined = stack.join("/");
  if (isAbsolute) return joined ? `/${joined}` : "/";
  return joined || ".";
}

function unwrapPathArg(rawArg: string): string {
  const trimmed = rawArg.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function resolveCdTarget(
  rawArg: string,
  currentCwd: string,
  homeDir: string | null,
): string | null {
  const target = unwrapPathArg(rawArg);

  if (!target || target === "~" || target === "~/") {
    return homeDir ?? ".";
  }

  if (target.startsWith("~/")) {
    const rest = target.slice(2);
    if (!homeDir) return null;
    return normalizeRemotePath(joinRemotePath(homeDir, rest));
  }

  if (target.startsWith("/")) {
    return normalizeRemotePath(target);
  }

  const base = currentCwd === "." ? homeDir : currentCwd;
  if (!base || base === ".") return null;
  return normalizeRemotePath(joinRemotePath(base, target));
}

export function parseCdCommand(
  command: string,
  currentCwd: string,
  homeDir: string | null,
  previousCwd: string | null,
): { nextCwd: string; previousCwd: string } | null {
  const trimmed = command.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const match = trimmed.match(/^cd(?:$|\s+(.+))$/);
  if (!match) return null;

  const rawArg = match[1]?.trim() ?? "";
  if (rawArg === "-") {
    if (!previousCwd) return null;
    return { nextCwd: previousCwd, previousCwd: currentCwd };
  }

  const nextCwd = resolveCdTarget(rawArg, currentCwd, homeDir);
  if (!nextCwd) return null;

  return {
    nextCwd,
    previousCwd: currentCwd,
  };
}

export function resolvePathForSftp(
  cwd: string,
  homeDir: string | null,
  currentRemotePath: string,
): string | null {
  if (cwd === "." || cwd === "~" || cwd === "~/") {
    return homeDir ?? ".";
  }

  if (cwd.startsWith("/")) {
    return normalizeRemotePath(cwd);
  }

  const base =
    currentRemotePath !== "." ? currentRemotePath : homeDir;
  if (!base || base === ".") return null;
  return normalizeRemotePath(joinRemotePath(base, cwd));
}

export function isAbsoluteRemotePath(path: string): boolean {
  return path.startsWith("/");
}

export function extractOsc7Cwd(data: string): string | null {
  const matches = data.matchAll(
    /\x1b\]7;file:\/\/[^/]*(\/[^\x07\x1b]*)(?:\x07|\x1b\\)/g,
  );

  let lastPath: string | null = null;
  for (const match of matches) {
    const encoded = match[1];
    if (!encoded) continue;
    try {
      const decoded = normalizeRemotePath(decodeURIComponent(encoded));
      if (decoded.startsWith("/")) {
        lastPath = decoded;
      }
    } catch {
      const decoded = normalizeRemotePath(encoded);
      if (decoded.startsWith("/")) {
        lastPath = decoded;
      }
    }
  }

  return lastPath;
}
