export interface ParsedPrivateKeyCredential {
  privateKey: string;
  passphrase?: string;
}

export function parsePrivateKeyCredential(value: string): ParsedPrivateKeyCredential {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) {
    return { privateKey: trimmed };
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      privateKey?: string;
      passphrase?: string;
    };
    if (typeof parsed.privateKey === "string" && parsed.privateKey.trim()) {
      return {
        privateKey: parsed.privateKey.trim(),
        passphrase:
          typeof parsed.passphrase === "string" && parsed.passphrase.length > 0
            ? parsed.passphrase
            : undefined,
      };
    }
  } catch {
    // fall through
  }

  return { privateKey: trimmed };
}

export function serializePrivateKeyCredential(
  privateKey: string,
  passphrase?: string,
): string {
  const key = privateKey.trim();
  const pass = passphrase?.trim();
  if (!pass) return key;
  return JSON.stringify({ privateKey: key, passphrase: pass });
}

function readOpenSSHCipher(privateKey: string): string | null {
  if (!privateKey.includes("BEGIN OPENSSH PRIVATE KEY")) return null;
  try {
    const lines = privateKey.trim().split("\n");
    const b64 = lines.filter((line) => !line.startsWith("-----")).join("");
    const raw = Uint8Array.from(atob(b64), (char) => char.charCodeAt(0));
    const magic = new TextEncoder().encode("openssh-key-v1\0");
    if (raw.length < magic.length + 8) return null;
    for (let i = 0; i < magic.length; i++) {
      if (raw[i] !== magic[i]) return null;
    }
    let offset = magic.length;
    const cipherLen =
      (raw[offset] << 24) |
      (raw[offset + 1] << 16) |
      (raw[offset + 2] << 8) |
      raw[offset + 3];
    offset += 4;
    return new TextDecoder().decode(raw.slice(offset, offset + cipherLen));
  } catch {
    return null;
  }
}

export function isEncryptedOpenSSHPrivateKey(privateKey: string): boolean {
  const cipher = readOpenSSHCipher(privateKey);
  return cipher !== null && cipher !== "none";
}

export function privateKeyRequiresPassphrase(privateKey: string, passphrase?: string): boolean {
  return isEncryptedOpenSSHPrivateKey(privateKey) && !passphrase?.trim();
}
