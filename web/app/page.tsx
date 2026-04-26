"use client";

import { useState, useEffect } from "react";
import { WalletBar } from "@/components/WalletBar";
import { BridgeSolToEvm } from "@/components/BridgeSolToEvm";
import { BridgeEvmToSol } from "@/components/BridgeEvmToSol";
import { ManualRedeem } from "@/components/ManualRedeem";
import { SettingsModal } from "@/components/SettingsModal";
import { loadPendingClaim, loadPendingDeposit } from "@/hooks/useBridgeSolToEvm";
import { useSettings } from "@/lib/settings-context";
import { isPublicSolanaRpc, activeSolanaRpc } from "@/lib/settings";
import Image from "next/image";

type Tab = "sol-to-evm" | "evm-to-sol" | "recover";

export default function Home() {
  const [tab, setTab] = useState<Tab>("sol-to-evm");
  const [hasPending, setHasPending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings } = useSettings();

  useEffect(() => {
    setHasPending(!!(loadPendingClaim() ?? loadPendingDeposit()));
  }, []);

  const isImage = "/logo.png";

  return (
    <main className="min-h-screen flex flex-col items-center px-3 sm:px-4 py-6 sm:py-10">
      {/* Header */}
      <div className="w-full max-w-lg mb-8 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {isImage && (
            <Image
              src={isImage}
              alt="meow bridge logo"
              width={100}
              height={100}
              className="w-12 h-12 sm:w-16 sm:h-16 shrink-0"
            />
          )}
          <div className="min-w-0">
            <h1 className="font-departure text-lg sm:text-xl font-bold leading-none truncate">meow bridge</h1>
            <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">USDC via Circle CCTP</p>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className={`rounded px-2 py-0.5 text-xs font-bold text-white transition-opacity hover:opacity-80 ${
              settings.mainnet ? "bg-orange-500" : "bg-blue-500"
            }`}
            title="Open settings"
          >
            {settings.mainnet ? "MAINNET" : "TESTNET"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
            aria-label="Settings"
            title="Settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <WalletBar />
        </div>
      </div>

      {/* Mainnet public RPC warning */}
      {settings.mainnet && isPublicSolanaRpc(activeSolanaRpc(settings)) && (
        <div className="w-full max-w-lg mb-4  px-4 py-3 flex items-start gap-3">
          <span className="text-red-400 mt-0.5 shrink-0">⚠</span>
          <div className="min-w-0">
            <p className="text-xs text-red-400 font-medium">Public Solana RPC — unreliable on mainnet</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Transactions will likely fail with 403 errors.{" "}
              <button
                onClick={() => setSettingsOpen(true)}
                className="text-white underline hover:no-underline"
              >
                Set a private RPC
              </button>
              {" "}(Helius, Triton, QuickNode — free tiers available).
            </p>
          </div>
        </div>
      )}

      {/* Bridge card */}
      <div className="w-full max-w-lg rounded-2xl bg-slate-950 overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          {(["sol-to-evm", "evm-to-sol", "recover"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
                tab === t
                  ? "border-b-2 border-blue-500 text-blue-400"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {t === "sol-to-evm" && "Sol → EVM"}
              {t === "evm-to-sol" && "EVM → Sol"}
              {t === "recover" && (
                <span className="flex items-center justify-center gap-1">
                  Recover
                  {hasPending && t !== tab && (
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Bridge tabs stay mounted — preserve in-progress bridge state across tab switches */}
          <div className={tab === "sol-to-evm" ? "block" : "hidden"}>
            <BridgeSolToEvm />
          </div>
          <div className={tab === "evm-to-sol" ? "block" : "hidden"}>
            <BridgeEvmToSol />
          </div>
          {/* Recover tab conditionally rendered — re-reads localStorage on each visit,
              abort controller cancels any polling when user navigates away */}
          {tab === "recover" && <ManualRedeem />}
        </div>
      </div>

      <div className="mt-6 text-center text-xs text-slate-600 space-y-2">
      
        <a
          href="https://github.com/Oxwagmi/meow"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mt-1"
        >
          <Image src="/github.png" alt="GitHub" width={25} height={25} className="opacity-100" />
          <span>Oxwagmi/meow</span>
        </a>
          <p>Powered by Circle CCTP · Non-custodial · Zero slippage</p>
        <p>Bridging takes ~3–5 min for attestation</p>
      </div>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </main>
  );
}
