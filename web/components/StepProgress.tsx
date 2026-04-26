"use client";

"use client";

import { useState } from "react";
import { formatBridgeError } from "@/lib/format-error";
import type { BridgeStep } from "@/lib/types";
import type { AttestationPoll } from "@/hooks/useBridgeSolToEvm";

const STEPS_SOL_TO_EVM: { key: BridgeStep; label: string }[] = [
  { key: "deposit",     label: "Burn on Solana" },
  { key: "attestation", label: "Circle Attestation" },
  { key: "claim",       label: "Claim on EVM" },
  { key: "done",        label: "Done" },
];

const STEPS_EVM_TO_SOL: { key: BridgeStep; label: string }[] = [
  { key: "approve",     label: "Approve USDC" },
  { key: "deposit",     label: "Burn on EVM" },
  { key: "attestation", label: "Circle Attestation" },
  { key: "claim",       label: "Claim on Solana" },
  { key: "done",        label: "Done" },
];

const ORDER_SOL: BridgeStep[] = ["deposit", "attestation", "claim", "done"];
const ORDER_EVM: BridgeStep[] = ["approve", "deposit", "attestation", "claim", "done"];

function stepStatus(current: BridgeStep, stepKey: BridgeStep, order: BridgeStep[]) {
  if (current === "error") return "error";
  if (current === "idle")  return "pending";
  if (current === "done")  return stepKey === "done" ? "done" : "done";
  const ci = order.indexOf(current);
  const si = order.indexOf(stepKey);
  if (si < ci) return "done";
  if (si === ci) return "active";
  return "pending";
}

function phaseLabel(phase: AttestationPoll["phase"]) {
  switch (phase) {
    case "not_found": return "tx not indexed yet";
    case "pending":   return "Circle signing attestation";
    case "error":     return "IRIS API error";
    default:          return "querying Circle IRIS";
  }
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-600 text-slate-400 hover:border-slate-400 hover:text-white transition-colors shrink-0"
    >
      {copied ? "✓" : "copy"}
    </button>
  );
}

interface Props {
  step: BridgeStep;
  direction: "sol-to-evm" | "evm-to-sol";
  depositTx?: string;
  claimTx?: string;
  error?: string;
  attestationPoll?: AttestationPoll;
}

export function StepProgress({ step, direction, depositTx, claimTx, error, attestationPoll }: Props) {
  if (step === "idle") return null;

  const steps = direction === "sol-to-evm" ? STEPS_SOL_TO_EVM : STEPS_EVM_TO_SOL;
  const order = direction === "sol-to-evm" ? ORDER_SOL : ORDER_EVM;

  return (
    <div className="mt-4 space-y-1 rounded-xl border border-slate-700 bg-slate-900 p-4">
      {steps.map(({ key, label }) => {
        const status = stepStatus(step, key, order);
        const isAttestationActive = key === "attestation" && status === "active";

        return (
          <div key={key}>
            <div className="flex items-center gap-3 py-1">
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                {status === "done"    && <span className="text-green-400">✓</span>}
                {status === "active"  && <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
                {status === "pending" && <span className="w-4 h-4 rounded-full border-2 border-slate-600 inline-block" />}
                {status === "error"   && <span className="text-red-400">✗</span>}
              </div>
              <span className={
                status === "done"    ? "text-green-400 text-sm" :
                status === "active"  ? "text-blue-400 text-sm font-medium" :
                status === "error"   ? "text-red-400 text-sm" :
                                       "text-slate-500 text-sm"
              }>
                {label}
                {isAttestationActive && attestationPoll && (
                  <span className="ml-2 text-slate-500 font-normal">
                    {attestationPoll.attempt}/{attestationPoll.maxAttempts}
                  </span>
                )}
              </span>
            </div>

            {/* Attestation detail panel */}
            {isAttestationActive && attestationPoll && (
              <div className="ml-8 mb-2 space-y-1.5">
                <p className="text-xs text-yellow-400">
                  {phaseLabel(attestationPoll.phase)}
                  {attestationPoll.detail && (
                    <span className="ml-1 text-red-400 font-mono text-[10px]">{attestationPoll.detail}</span>
                  )}
                </p>
                {attestationPoll.countdown > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 tabular-nums w-20 shrink-0">
                      retry in {attestationPoll.countdown}s
                    </span>
                    <div className="flex-1 h-1 bg-slate-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500/60 transition-all duration-1000"
                        style={{ width: `${(attestationPoll.countdown / 15) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
                <p className="text-xs text-slate-600">
                  Circle signs each message — takes 1–15 min on testnet
                </p>
              </div>
            )}
          </div>
        );
      })}

      {step === "done" && (
        <div className="mt-3 pt-3 border-t border-slate-700 space-y-1.5">
          {depositTx && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500 shrink-0">Deposit</span>
              <span className="font-mono text-xs text-slate-400 truncate">{depositTx}</span>
              <CopyBtn value={depositTx} />
            </div>
          )}
          {claimTx && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-500 shrink-0">Claim &nbsp;</span>
              <span className="font-mono text-xs text-slate-400 truncate">{claimTx}</span>
              <CopyBtn value={claimTx} />
            </div>
          )}
          <p className="text-green-400 text-sm font-medium">Bridge complete!</p>
        </div>
      )}

      {step === "error" && (
        <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
          {error === "ATTESTATION_TIMEOUT" ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <p className="text-amber-400 text-xs font-medium">
                ⏱ Attestation timed out after 15 min
              </p>
              <p className="text-slate-400 text-xs">
                Your USDC is safe — locked in CCTP contract. Circle may still be processing.
                Use the <strong className="text-white">Recover tab</strong> to claim when ready.
              </p>
              {depositTx && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Paste this hash in Recover tab:</p>
                  <div className="flex items-center gap-1 bg-slate-900 rounded px-2 py-1.5">
                    <span className="font-mono text-xs text-white break-all flex-1">{depositTx}</span>
                    <CopyBtn value={depositTx} />
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-600">
                Recover tab has this saved automatically — open it and click Claim Now.
              </p>
            </div>
          ) : (
            <>
              {depositTx && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500 shrink-0">Deposit</span>
                  <span className="font-mono text-xs text-slate-500 truncate">{depositTx}</span>
                  <CopyBtn value={depositTx} />
                </div>
              )}
              {error && <p className="text-red-400 text-xs whitespace-pre-wrap break-all">{formatBridgeError(error)}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
