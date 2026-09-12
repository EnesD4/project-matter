/** Read localStorage, copying a legacy key to the new name on first access. */
export function readLocalItem(key: string, legacyKey?: string): string | null {
  try {
    const current = localStorage.getItem(key);
    if (current != null) return current;
    if (!legacyKey) return null;
    const legacy = localStorage.getItem(legacyKey);
    if (legacy == null) return null;
    localStorage.setItem(key, legacy);
    return legacy;
  } catch {
    return null;
  }
}

/** Read sessionStorage, copying a legacy key to the new name on first access. */
export function readSessionItem(key: string, legacyKey?: string): string | null {
  try {
    const current = sessionStorage.getItem(key);
    if (current != null) return current;
    if (!legacyKey) return null;
    const legacy = sessionStorage.getItem(legacyKey);
    if (legacy == null) return null;
    sessionStorage.setItem(key, legacy);
    return legacy;
  } catch {
    return null;
  }
}
