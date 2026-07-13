import { SftpClient } from "@/lib/sftp-client";

const clients = new Map<string, SftpClient>();

export async function acquireSftpClient(
  sessionId: string,
  sftpWsUrl: string,
): Promise<SftpClient> {
  const existing = clients.get(sessionId);
  if (existing?.connected) {
    return existing;
  }

  if (existing) {
    existing.disconnect();
    clients.delete(sessionId);
  }

  const client = new SftpClient();
  await client.connect(sftpWsUrl);
  clients.set(sessionId, client);
  return client;
}

/** Dedicated SFTP connection for a single upload; caller must disconnect when done. */
export async function createEphemeralSftpClient(
  sftpWsUrl: string,
): Promise<SftpClient> {
  const client = new SftpClient();
  await client.connect(sftpWsUrl);
  return client;
}

export function getSftpClient(sessionId: string): SftpClient | null {
  const client = clients.get(sessionId);
  return client?.connected ? client : null;
}

export function releaseSftpClient(sessionId: string): void {
  const client = clients.get(sessionId);
  if (!client) return;
  client.disconnect();
  clients.delete(sessionId);
}

export function releaseAllSftpClients(): void {
  for (const client of clients.values()) {
    client.disconnect();
  }
  clients.clear();
}
