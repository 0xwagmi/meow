"use client";

import { useState, useEffect } from "react";
import { useSettings } from "@/lib/settings-context";
import { validateRpcUrl, envDefaults, isPublicSolanaRpc } from "@/lib/settings";

const DEFAULT_MAINNET_RPC = "https://api.mainnet-beta.solana.com";
const DEFAULT_DEVNET_RPC  = "https://api.devnet.solana.com";

interface Props {
  onClose: () => void;
}

export function SettingsModal({ onClose }: Props) {
  const { settings, updateSettings } = useSettings();
  const defaults = envDefaults();

  const [mainnet, setMainnet] = useState(settings.mainnet);
  const [mainnetRpc, setMainnetRpc] = useState(settings.mainnetSolanaRpc);
  const [devnetRpc, setDevnetRpc]   = useState(settings.devnetSolanaRpc);

  // Active RPC for whichever network is currently selected in the toggle
  const activeRpc    = mainnet ? mainnetRpc : devnetRpc;
  const setActiveRpc = mainnet ? setMainnetRpc : setDevnetRpc;

  const rpcError = validateRpcUrl(activeRpc);
  const hasError = !!rpcError;
  const isCustom = !isPublicSolanaRpc(activeRpc);

  function handleSave() {
    if (hasError) return;
    updateSettings({ mainnet, mainnetSolanaRpc: mainnetRpc, devnetSolanaRpc: devnetRpc });
    onClose();
  }

  function handleReset() {
    setMainnet(defaults.mainnet);
    setMainnetRpc(DEFAULT_MAINNET_RPC);
    setDevnetRpc(DEFAULT_DEVNET_RPC);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <span className="font-semibold text-white text-sm">Settings</span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg leading-none transition-colors"
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Network toggle */}
          <div>
            <label className="block text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">
              Network
            </label>
            <div className="flex rounded-xl overflow-hidden border border-slate-700">
              <button
                type="button"
                onClick={() => setMainnet(false)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  !mainnet ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                Testnet
              </button>
              <button
                type="button"
                onClick={() => setMainnet(true)}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  mainnet ? "bg-orange-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                Mainnet
              </button>
            </div>
            {mainnet && (
              <p className="mt-1.5 text-xs text-orange-400">
                ⚠ Mainnet uses real funds. Transactions are irreversible.
              </p>
            )}
          </div>

          {/* Solana RPC — separate field per network */}
          <div>
            <label className="block text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">
              Solana RPC{" "}
              <span className="normal-case font-normal text-slate-600">
                ({mainnet ? "mainnet" : "testnet"})
              </span>
            </label>
            <input
              type="url"
              value={activeRpc}
              onChange={(e) => setActiveRpc(e.target.value.trim())}
              placeholder={mainnet ? DEFAULT_MAINNET_RPC : DEFAULT_DEVNET_RPC}
              className={`w-full rounded-xl border px-4 py-2.5 font-mono text-xs text-white bg-slate-800 placeholder-slate-600 focus:outline-none transition-colors ${
                rpcError
                  ? "border-red-500 focus:border-red-400"
                  : "border-slate-600 focus:border-blue-500"
              }`}
            />
            {rpcError ? (
              <p className="mt-1 text-xs text-red-400">{rpcError}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                {isCustom
                  ? "Custom RPC active — takes effect immediately."
                  : "Use a private RPC (Helius, Triton) for better reliability."}
              </p>
            )}
          </div>

          {/* Security warning for custom RPC */}
          {isCustom && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3.5 space-y-1">
              <p className="text-xs text-yellow-400 font-medium">Custom RPC — Security Notice</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Custom RPC providers can see your IP address, wallet addresses, and
                transaction data. Only use endpoints from providers you trust.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 rounded-xl border border-slate-600 py-2.5 text-sm font-medium text-slate-400 hover:text-white hover:border-slate-400 transition-colors"
            >
              Reset to Defaults
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={hasError}
              className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
