export const SETTINGS_KEY = "meow_bridge_settings_v1";

export interface Settings {
  mainnet: boolean;
  mainnetSolanaRpc: string;
  devnetSolanaRpc: string;
}

// Active RPC for the current network selection.
export function activeSolanaRpc(s: Settings): string {
  return s.mainnet ? s.mainnetSolanaRpc : s.devnetSolanaRpc;
}

// Public rate-limited endpoints — unreliable for mainnet browser use.
export function isPublicSolanaRpc(url: string): boolean {
  return (
    url.includes("api.mainnet-beta.solana.com") ||
    url.includes("api.mainnet.solana.com") ||
    url.includes("api.devnet.solana.com") ||
    url.includes("api.testnet.solana.com")
  );
}

export function envDefaults(): Settings {
  return {
    mainnet: process.env.NEXT_PUBLIC_MAINNET === "true",
    mainnetSolanaRpc: "https://api.mainnet-beta.solana.com",
    devnetSolanaRpc:
      process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com",
  };
}

// Returns null if valid, error string if invalid.
export function validateRpcUrl(url: string): string | null {
  if (!url) return null;
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:" && protocol !== "wss:") {
      return "Must use https:// or wss://";
    }
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname)) {
      return "Localhost endpoints not permitted";
    }
    return null;
  } catch {
    return "Invalid URL";
  }
}

function sanitizeRpc(raw: unknown, fallback: string): string {
  return typeof raw === "string" && raw && !validateRpcUrl(raw) ? raw : fallback;
}

function sanitize(raw: unknown): Settings {
  const d = envDefaults();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  return {
    mainnet: typeof r.mainnet === "boolean" ? r.mainnet : d.mainnet,
    mainnetSolanaRpc: sanitizeRpc(r.mainnetSolanaRpc ?? r.solanaRpc, d.mainnetSolanaRpc),
    devnetSolanaRpc:  sanitizeRpc(r.devnetSolanaRpc  ?? r.solanaRpc, d.devnetSolanaRpc),
  };
}

export function loadSettings(): Settings {
  if (typeof window === "undefined") return envDefaults();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    return envDefaults();
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}
