import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import {
  applySiteName,
  clearLegacyStoredSiteName,
  DEFAULT_SITE_NAME,
  normalizeSiteName,
  readLegacyStoredSiteName,
  resolveSiteName,
} from "./site-name";

const PERSIST_DEBOUNCE_MS = 400;

interface SiteNameContextValue {
  siteName: string;
  setSiteName: (name: string) => void;
  resetSiteName: () => void;
}

const SiteNameContext = createContext<SiteNameContextValue | null>(null);

export function SiteNameProvider({ children }: { children: ReactNode }) {
  const [siteName, setSiteNameState] = useState(DEFAULT_SITE_NAME);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    applySiteName(siteName);
  }, [siteName]);

  useEffect(() => {
    let cancelled = false;

    void api
      .getMe()
      .then(async ({ user }) => {
        if (cancelled) return;

        const legacySiteName = readLegacyStoredSiteName();
        if (legacySiteName && legacySiteName !== resolveSiteName(user.site_name)) {
          try {
            const { user: updated } = await api.updateSiteName(legacySiteName);
            if (cancelled) return;
            clearLegacyStoredSiteName();
            const migrated = resolveSiteName(updated.site_name);
            setSiteNameState(migrated);
            applySiteName(migrated);
            return;
          } catch {
            clearLegacyStoredSiteName();
          }
        }

        const resolved = resolveSiteName(user.site_name);
        setSiteNameState(resolved);
        applySiteName(resolved);
      })
      .catch(() => {
        // Ignore during onboarding or before auth is ready.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, []);

  const persistSiteName = useCallback((value: string) => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = setTimeout(() => {
      void api.updateSiteName(value).catch((error) => {
        console.error("Failed to persist site name", error);
      });
    }, PERSIST_DEBOUNCE_MS);
  }, []);

  const setSiteName = useCallback(
    (value: string) => {
      const normalized = normalizeSiteName(value);
      applySiteName(normalized);
      setSiteNameState(normalized);
      persistSiteName(normalized);
    },
    [persistSiteName],
  );

  const resetSiteName = useCallback(() => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }
    clearLegacyStoredSiteName();
    applySiteName(DEFAULT_SITE_NAME);
    setSiteNameState(DEFAULT_SITE_NAME);
  }, []);

  const value = useMemo(
    () => ({ siteName, setSiteName, resetSiteName }),
    [resetSiteName, setSiteName, siteName],
  );

  return (
    <SiteNameContext.Provider value={value}>{children}</SiteNameContext.Provider>
  );
}

export function useSiteName() {
  const context = useContext(SiteNameContext);
  if (!context) {
    throw new Error("useSiteName must be used within SiteNameProvider");
  }
  return context;
}
