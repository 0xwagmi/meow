"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { useBridgeEvmToSol } from "@/hooks/useBridgeEvmToSol";
import { useSolanaNetworkGuard } from "@/hooks/useNetworkGuard";
import { StepProgress } from "./StepProgress";
import { BridgeSummary } from "./BridgeSummary";
import { getChainByViemId } from "@/lib/chains";
import { USDC_ABI } from "@/lib/abis";
import { getAddress, parseUnits } from "viem";
import { useSettings } from "@/lib/settings-context";

export function BridgeEvmToSol() {
  const { settings } = useSettings();
  const { publicKey } = useWallet();
  const { address: evmAddress } = useAccount();
  const chainId = useChainId();
  const { state, bridge, reset } = useBridgeEvmToSol(settings.mainnet);
  const wrongNetwork = useSolanaNetworkGuard();

  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");

  const chainInfo = getChainByViemId(chainId, settings.mainnet);
  const unsupportedChain = evmAddress && !chainInfo;

  const usdcAddr = chainInfo
    ? getAddress(settings.mainnet ? chainInfo.usdc : chainInfo.usdcTestnet)
    : undefined;
  const messengerAddr = chainInfo
    ? getAddress(settings.mainnet ? chainInfo.tokenMessenger : chainInfo.tokenMessengerTestnet)
    : undefined;

  const { data: allowance = 0n } = useReadContract({
    address: usdcAddr,
    abi: USDC_ABI,
    functionName: "allowance",
    args: evmAddress && messengerAddr ? [evmAddress, messengerAddr] : undefined,
    query: { enabled: !!evmAddress && !!usdcAddr && !!messengerAddr },
  });

  const busy = !["idle", "done", "error"].includes(state.step);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!evmAddress || !publicKey || !chainInfo) return;
    await bridge({
      sourceChainId: chainInfo.id,
      recipientSolana: recipient || publicKey.toBase58(),
      amount,
      evmAccount: evmAddress,
      allowance: allowance as bigint,
    });
  }

  return (
    <div>
      {/* Active chain display */}
      {chainInfo && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5">
          <span className="text-xs text-slate-400">Source</span>
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
            Recipient Solana Address{" "}
            <span className="text-slate-500">(default: connected wallet)</span>
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={publicKey?.toBase58() ?? "Solana address…"}
            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {amount && parseFloat(amount) > 0 && (
          <BridgeSummary
            direction="evm-to-sol"
            amount={amount}
            chainId={chainId}
            needsApproval={!!evmAddress && (allowance as bigint) < parseUnits(amount || "0", 6)}
          />
        )}

        {wrongNetwork && (
          <p className="text-red-400 text-xs font-medium">
            ⚠ Solana wallet on wrong network — switch to {settings.mainnet ? "Mainnet" : "Devnet"} in Phantom
          </p>
        )}
        {!evmAddress && (
          <p className="text-amber-400 text-xs">Connect EVM wallet to bridge</p>
        )}
        {!publicKey && (
          <p className="text-amber-400 text-xs">Connect Solana wallet to receive</p>
        )}

        {state.step === "done" || state.step === "error" ? (
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
        direction="evm-to-sol"
        depositTx={state.depositTxHash}
        claimTx={state.claimTxSig}
        error={state.error}
        attestationPoll={state.attestationPoll}
      />
    </div>
  );
}
