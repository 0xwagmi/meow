"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { envDefaults, loadSettings, saveSettings, type Settings } from "@/lib/settings";

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Start with env defaults (deterministic for SSR), hydrate from localStorage on mount.
  const [settings, setSettings] = useState<Settings>(envDefaults);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be inside SettingsProvider");
  return ctx;
}
