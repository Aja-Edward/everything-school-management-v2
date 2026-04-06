// contexts/PromotionThresholdContext.tsx

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface PromotionThresholdContextValue {
  cache: Record<string | number, number>;
  setCache: (levelId: string | number, value: number) => void;
  clearCache: () => void;
  version: number; // bumped on every clearCache — causes consumers to re-fetch
}

const PromotionThresholdContext = createContext<PromotionThresholdContextValue | null>(null);

export function PromotionThresholdProvider({ children }: { children: ReactNode }) {
  const [cache, setCacheState] = useState<Record<string | number, number>>({});
  const [version, setVersion] = useState(0);

  const setCache = useCallback((levelId: string | number, value: number) => {
    setCacheState((prev) => ({ ...prev, [levelId]: value }));
  }, []);

  const clearCache = useCallback(() => {
    setCacheState({});
    setVersion((v) => v + 1); // triggers re-fetch in all consumers
  }, []);

  return (
    <PromotionThresholdContext.Provider value={{ cache, setCache, clearCache, version }}>
      {children}
    </PromotionThresholdContext.Provider>
  );
}

export function useThresholdCache() {
  const ctx = useContext(PromotionThresholdContext);
  if (!ctx) throw new Error("useThresholdCache must be used within PromotionThresholdProvider");
  return ctx;
}