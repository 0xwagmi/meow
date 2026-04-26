"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { useManualRedeem, type LogLine } from "@/hooks/useManualRedeem";
import { useSolanaNetworkGuard } from "@/hooks/useNetworkGuard";
import { loadPendingClaim, loadPendingDeposit, clearPendingClaim, clearPendingDeposit } from "@/hooks/useBridgeSolToEvm";
import { BRIDGE_CHAINS } from "@/lib/chains";
import { useSettings } from "@/lib/settings-context";

function isSolanaTx(hash: string | undefined): boolean {
  if (!hash) return false;
  return hash.length >= 43 && hash.length <= 88 && !hash.startsWith("0x");
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-600 text-slate-400 hover:border-slate-400 hover:text-white transition-colors shrink-0"
    >
      {copied ? "✓" : "copy"}
    </button>
  );
}

function lineColor(type: LogLine["type"]) {
  switch (type) {
    case "cmd":     return "text-white font-bold";
    case "success": return "text-green-400";
    case "error":   return "text-red-400";
    case "warn":    return "text-yellow-400";
    case "data":    return "text-cyan-400";
    case "poll":    return "text-slate-400";
    default:        return "text-slate-300";
  }
}

export function ManualRedeem() {
  const { settings } = useSettings();
  const { address: evmAddress } = useAccount();
  const { publicKey } = useWallet();
  const wrongNetwork = useSolanaNetworkGuard();
  const { state, redeem, redeemWithAttestation, cancel, reset } = useManualRedeem(settings.mainnet);

  const [txHash, setTxHash] = useState("");
  const [chainId, setChainId] = useState("base");
  const [solRecipient, setSolRecipient] = useState("");

  const [pending, setPending] = useState<ReturnType<typeof loadPendingClaim>>(null);
  // Must run client-side only — localStorage unavailable during SSR
  useEffect(() => {
    setPending(loadPendingClaim() ?? loadPendingDeposit());
  }, []);
  const logEndRef = useRef<HTMLDivElement>(null);

  const solana = isSolanaTx(txHash);
  const busy = state.phase === "fetching_attestation" || state.phase === "countdown" || state.phase === "claiming";

  // auto-scroll terminal
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.logs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!evmAddress) return;
    await redeem({ txHash, chainId, evmAccount: evmAddress, solRecipient: solRecipient || undefined });
  }

  async function handleRetryPending() {
    if (!pending || !evmAddress) return;
    const txHash = pending.depositTxSig ?? pending.txHash;
    setTxHash(txHash ?? "");
    setChainId(pending.chainId);
    // If attestation already cached (claim failed but attestation succeeded), skip IRIS
    if (pending.attestation) {
      await redeemWithAttestation({
        attestation: pending.attestation,
        chainId: pending.chainId,
        evmAccount: evmAddress,
        depositTxSig: txHash,
      });
    } else {
      await redeem({ txHash: txHash ?? "", chainId: pending.chainId, evmAccount: evmAddress });
    }
  }

  const showTerminal = state.logs.length > 0;

  return (
    <div className="space-y-4">
      {/* How it works */}
      <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-4 text-xs text-slate-400 space-y-1.5">
        <p className="text-slate-300 font-medium text-sm">How recovery works</p>
        <p>• Paste any tx hash — Solana sig <span className="text-slate-500">(base58)</span> or EVM hash <span className="text-slate-500">(0x…)</span></p>
        <p>• App fetches attestation from Circle IRIS API — can take 1–15 min</p>
        <p>• Once attestation arrives, submits claim on destination chain via your wallet</p>
        <p className="text-yellow-400">• Use this if bridge got stuck mid-way or you closed the page early</p>
      </div>

      {/* Pending claim banner */}
      {pending && (state.phase === "idle" || state.phase === "done") && (
        <div className={`rounded-xl border p-4 space-y-2 ${
          state.phase === "done"
            ? "border-green-500/40 bg-green-500/10"
            : "border-amber-500/40 bg-amber-500/10"
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${
              state.phase === "done" ? "text-green-400" : "text-amber-400"
            }`}>
              {state.phase === "done" ? " Bridge claimed" : "⚠ Unclaimed bridge found"}
            </span>
            <button
              type="button"
              onClick={() => {
                clearPendingClaim();
                clearPendingDeposit();
                setPending(null);
              }}
              className="text-slate-500 hover:text-white text-xs transition-colors font-bold"
            >
              ✕
            </button>
          </div>
          <div className="font-mono text-xs text-slate-400 space-y-0.5">
            <div className="flex items-center gap-1">
              <span className="text-slate-500 w-16 shrink-0">Burned tx</span>
              <span className="truncate">{pending.depositTxSig ?? pending.txHash}</span>
              <CopyBtn value={pending.depositTxSig ?? pending.txHash} />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-500 w-16 shrink-0">Chain</span>
              <span>{BRIDGE_CHAINS.find((c) => c.id === pending.chainId)?.name ?? pending.chainId}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-slate-500 w-16 shrink-0">Network</span>
              <span>{pending.mainnet ? "Mainnet" : "Testnet"}</span>
            </div>
            {pending.direction && (
              <div className="flex items-center gap-1">
                <span className="text-slate-500 w-16 shrink-0">Direction</span>
                <span>{pending.direction === "sol-to-evm" ? "Solana → EVM" : "EVM → Solana"}</span>
              </div>
            )}
          </div>
          {state.phase !== "done" && (
            <button
              onClick={handleRetryPending}
              disabled={!evmAddress || busy}
              className="w-full rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 transition-colors"
            >
              Claim Now
            </button>
          )}
        </div>
      )}

      {/* Input form */}
      {!showTerminal && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Transaction Hash</label>
            <input
              type="text"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value.trim())}
              placeholder="Solana sig (base58) or EVM 0x hash…"
              required
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
            />
            {txHash && (
              <p className={`mt-1 text-xs ${solana ? "text-purple-400" : "text-blue-400"}`}>
                {solana
                  ? " Solana burn → will claim USDC on EVM"
                  : " EVM burn → will claim USDC on Solana"}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              {!txHash ? "EVM Chain" : solana ? "Claim on EVM Chain" : "Source EVM Chain (where you burned)"}
            </label>
            <select
              value={chainId}
              onChange={(e) => setChainId(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
            >
              {BRIDGE_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {!solana && txHash && (
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Solana Recipient <span className="text-slate-500">(default: connected wallet)</span>
              </label>
              <input
                type="text"
                value={solRecipient}
                onChange={(e) => setSolRecipient(e.target.value.trim())}
                placeholder={publicKey?.toBase58() ?? "Solana address…"}
                className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          {wrongNetwork && (
            <p className="text-red-400 text-xs font-medium">
              ⚠ Solana wallet on wrong network — switch to {settings.mainnet ? "Mainnet" : "Devnet"} in Phantom
            </p>
          )}
          {!evmAddress && <p className="text-amber-400 text-xs">Connect EVM wallet</p>}
          {!solana && txHash && !publicKey && (
            <p className="text-amber-400 text-xs">Connect Solana wallet to receive</p>
          )}

          <button
            type="submit"
            disabled={busy || !txHash || !evmAddress || wrongNetwork}
            className="w-full rounded-xl bg-purple-600 py-3 font-semibold text-white hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 transition-colors"
          >
            Fetch & Claim
          </button>
        </form>
      )}

      {/* Terminal output */}
      {showTerminal && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          {/* terminal title bar */}
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800 border-b border-slate-700">
            <span className="w-3 h-3 rounded-full bg-red-500/70" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <span className="w-3 h-3 rounded-full bg-green-500/70" />
            <span className="ml-2 text-xs text-slate-400 font-mono">meow recover</span>
            {busy && (
              <span className="ml-auto flex items-center gap-3">
                <span className="text-xs text-yellow-400 font-mono animate-pulse">
                  {state.phase === "countdown"
                    ? `retry in ${state.countdown}s`
                    : state.phase === "fetching_attestation"
                    ? `polling... ${state.pollAttempt ?? 0}/${state.pollMax ?? 60}`
                    : "claiming..."}
                </span>
                {(state.phase === "fetching_attestation" || state.phase === "countdown") && (
                  <button
                    type="button"
                    onClick={cancel}
                    className="text-xs text-red-400 hover:text-red-300 font-mono transition-colors"
                  >
                    ✕ cancel
                  </button>
                )}
              </span>
            )}
            {state.phase === "done" && <span className="ml-auto text-xs text-green-400 font-mono">done</span>}
            {state.phase === "error" && <span className="ml-auto text-xs text-red-400 font-mono">error</span>}
          </div>

          {/* log lines */}
          <div className="bg-zinc-950 font-mono text-xs p-4 max-h-72 overflow-y-auto space-y-0.5">
            {state.logs.map((line) => (
              <div key={line.id} className={`flex items-start gap-1 leading-5 ${lineColor(line.type)}`}>
                <span className="whitespace-pre-wrap break-all flex-1">{line.text}</span>
                {line.copyValue && <CopyBtn value={line.copyValue} />}
              </div>
            ))}

            {/* live countdown bar */}
            {state.phase === "countdown" && state.countdown != null && (state.countdown) > 0 && (
              <div className="mt-1 flex items-center gap-2 text-slate-500">
                <span>  next attempt in</span>
                <span className="text-yellow-400 tabular-nums">{state.countdown}s</span>
                <div className="flex-1 h-1 bg-slate-800 rounded overflow-hidden">
                  <div
                    className="h-full bg-yellow-500/60 transition-all duration-1000"
                    style={{ width: `${(state.countdown / 15) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* blinking cursor when active */}
            {busy && <span className="inline-block w-2 h-4 bg-green-400 animate-pulse" />}
            <div ref={logEndRef} />
          </div>
        </div>
      )}

      {/* Action buttons after terminal */}
      {showTerminal && (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="flex-1 rounded-xl bg-slate-700 py-2.5 text-sm font-semibold text-white hover:bg-slate-600 transition-colors"
          >
            New Recovery
          </button>
          {state.phase === "error" && (
            <button
              type="button"
              onClick={() => {
                reset();
                // keep the hash/chain so user can retry immediately
                setTimeout(() => {
                  if (evmAddress && txHash)
                    redeem({ txHash, chainId, evmAccount: evmAddress, solRecipient: solRecipient || undefined });
                }, 50);
              }}
              className="flex-1 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
