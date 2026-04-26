"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount, useChainId } from "wagmi";
import { useBridgeSolToEvm } from "@/hooks/useBridgeSolToEvm";
import { useSolanaNetworkGuard } from "@/hooks/useNetworkGuard";
import { StepProgress } from "./StepProgress";
import { BridgeSummary } from "./BridgeSummary";
import { getChainByViemId } from "@/lib/chains";
import { useSettings } from "@/lib/settings-context";

export function BridgeSolToEvm() {
  const { settings } = useSettings();
  const { publicKey } = useWallet();
  const { address: evmAddress } = useAccount();
  const chainId = useChainId();
  const { state, bridge, reset, retryClaim } = useBridgeSolToEvm(settings.mainnet);
  const wrongNetwork = useSolanaNetworkGuard();

  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");

  const chainInfo = getChainByViemId(chainId, settings.mainnet);
  const unsupportedChain = evmAddress && !chainInfo;
  const busy = !["idle", "done", "error"].includes(state.step);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!evmAddress || !chainInfo) return;
    await bridge({
      destinationChainId: chainInfo.id,
      recipientEvm: recipient || evmAddress,
      amount,
      evmAccount: evmAddress,
    });
  }

  return (
    <div>
      {/* Active chain display */}
      {chainInfo && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5">
          <span className="text-xs text-slate-400">Destination</span>
          <span className="ml-auto text-sm font-medium text-white">{chainInfo.name}</span>
          <span className="text-xs text-slate-500">(switch in wallet)</span>
        </div>
      )}
      {unsupportedChain && (
        <p className="mb-4 text-red-400 text-xs font-medium">
          ⚠ Chain not supported — switch to a CCTP chain in your wallet
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1.5">Amount (USDC)</label>
          <input
            type="number"
            min="0.000001"
            step="0.000001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1.00"
            required
            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1.5">
            Recipient EVM Address{" "}
            <span className="text-slate-500">(default: connected wallet)</span>
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={evmAddress ?? "0x…"}
            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {amount && parseFloat(amount) > 0 && (
          <BridgeSummary direction="sol-to-evm" amount={amount} chainId={chainId} />
        )}

        {wrongNetwork && (
          <p className="text-red-400 text-xs font-medium">
            ⚠ Solana wallet on wrong network — switch to {settings.mainnet ? "Mainnet" : "Devnet"} in Phantom
          </p>
        )}
        {!publicKey && (
          <p className="text-amber-400 text-xs">Connect Solana wallet to bridge</p>
        )}
        {!evmAddress && (
          <p className="text-amber-400 text-xs">Connect EVM wallet to receive</p>
        )}

        {state.step === "error" && state.attestation && (
          <button
            type="button"
            onClick={retryClaim}
            className="w-full rounded-xl bg-amber-600 py-3 font-semibold text-white hover:bg-amber-500 transition-colors"
          >
            Retry Claim on EVM
          </button>
        )}
        {(state.step === "done" || state.step === "error") ? (
          <button
            type="button"
            onClick={reset}
            className="w-full rounded-xl bg-slate-700 py-3 font-semibold text-white hover:bg-slate-600 transition-colors"
          >
            New Bridge
          </button>
        ) : (
          <button
            type="submit"
            disabled={busy || !publicKey || !evmAddress || !amount || wrongNetwork || !!unsupportedChain}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 transition-colors"
          >
            {busy ? "Bridging…" : "Bridge USDC →"}
          </button>
        )}
      </form>

      <StepProgress
        step={state.step}
        direction="sol-to-evm"
        depositTx={state.depositTxSig}
        claimTx={state.claimTxHash}
        error={state.error}
        attestationPoll={state.attestationPoll}
      />
    </div>
  );
}
