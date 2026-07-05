export interface SavedPrivateKey {
  id: string;
  name: string;
  content: string;
}

const STORAGE_KEY = "ternssh-saved-private-keys";

function readAll(): SavedPrivateKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedPrivateKey[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.content === "string",
    );
  } catch {
    return [];
  }
}

function writeAll(keys: SavedPrivateKey[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function listSavedPrivateKeys(): SavedPrivateKey[] {
  return readAll();
}

export function savePrivateKey(name: string, content: string): SavedPrivateKey {
  const trimmedName = name.trim() || "Private key";
  const trimmedContent = content.trim();
  const existing = readAll();
  const duplicate = existing.find((item) => item.content === trimmedContent);
  if (duplicate) {
    const updated = existing.map((item) =>
      item.id === duplicate.id ? { ...item, name: trimmedName } : item,
    );
    writeAll(updated);
    return { ...duplicate, name: trimmedName };
  }

  const entry: SavedPrivateKey = {
    id: crypto.randomUUID(),
    name: trimmedName,
    content: trimmedContent,
  };
  writeAll([entry, ...existing]);
  return entry;
}

export function deleteSavedPrivateKey(id: string): void {
  writeAll(readAll().filter((item) => item.id !== id));
}

export function maybeSavePrivateKey(
  name: string,
  content: string,
  shouldSave: boolean,
): void {
  if (!shouldSave || !content.trim()) return;
  savePrivateKey(name, content);
}
