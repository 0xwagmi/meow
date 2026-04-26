"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { getAddress } from "viem";
import {
  buildDepositForBurnTx,
  fetchAttestation,
  type AttestationProgress,
} from "@/lib/cctp";
import { sendAndConfirmSolana } from "@/lib/solana-utils";
import { formatBridgeError } from "@/lib/format-error";
import { useWriteContract } from "wagmi";
import { parseUnits } from "viem";
import { MESSAGE_TRANSMITTER_ABI } from "@/lib/abis";
import { getChain, SOLANA_DOMAIN } from "@/lib/chains";
import type { BridgeStep } from "@/lib/types";

export type { BridgeStep };

export interface AttestationPoll {
  attempt: number;
  maxAttempts: number;
  phase: AttestationProgress["phase"];
  countdown: number;
  detail?: string;
}

export interface BridgeState {
  step: BridgeStep;
  depositTxSig?: string;
  attestation?: { message: string; attestation: string };
  claimTxHash?: `0x${string}`;
  pendingChainId?: string;
  pendingEvmAccount?: `0x${string}`;
  attestationPoll?: AttestationPoll;
  error?: string;
}

const STORAGE_KEY = "meow_pending_claim";
const DEPOSIT_KEY  = "meow_pending_deposit";

// Saved right after burn tx confirms — so Recover tab always has the hash
export function savePendingDeposit(data: {
  txHash: string;          // Solana sig or EVM 0x hash
  chainId: string;
  mainnet: boolean;
  direction: "sol-to-evm" | "evm-to-sol";
}) {
  try { localStorage.setItem(DEPOSIT_KEY, JSON.stringify({ ...data, ts: Date.now() })); } catch {}
}

export function loadPendingDeposit() {
  try {
    const raw = localStorage.getItem(DEPOSIT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearPendingDeposit() {
  try { localStorage.removeItem(DEPOSIT_KEY); } catch {}
}

function savePendingClaim(data: {
  chainId: string;
  evmAccount: string;
  depositTxSig: string;
  attestation: { message: string; attestation: string };
  mainnet: boolean;
}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    clearPendingDeposit(); // deposit upgraded → claim; no longer need deposit key
  } catch {}
}

export function clearPendingClaim() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function loadPendingClaim() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function useBridgeSolToEvm(mainnet: boolean) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { writeContractAsync } = useWriteContract();

  const [state, setState] = useState<BridgeState>({ step: "idle" });
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  const reset = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    clearPendingClaim();
    setState({ step: "idle" });
  }, []);

  function onAttestationProgress(p: AttestationProgress) {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setState((s) => ({
      ...s,
      attestationPoll: { attempt: p.attempt, maxAttempts: p.maxAttempts, phase: p.phase, countdown: p.retryInSeconds, detail: p.detail },
    }));
    if (p.retryInSeconds > 0) {
      let secs = p.retryInSeconds;
      countdownRef.current = setInterval(() => {
        secs -= 1;
        setState((s) => ({
          ...s,
          attestationPoll: s.attestationPoll ? { ...s.attestationPoll, countdown: Math.max(0, secs) } : s.attestationPoll,
        }));
        if (secs <= 0) { clearInterval(countdownRef.current!); countdownRef.current = null; }
      }, 1000);
    }
  }

  async function claimOnEvm(
    att: { message: string; attestation: string },
    chainId: string,
    evmAccount: `0x${string}`,
    depositTxSig?: string
  ) {
    const chain = getChain(chainId);
    if (!chain) throw new Error("Invalid chain");

    const transmitter = getAddress(
      mainnet ? chain.messageTransmitter : chain.messageTransmitterTestnet
    );
    const msgBytes = `0x${att.message.replace("0x", "")}` as `0x${string}`;
    const attBytes = `0x${att.attestation.replace("0x", "")}` as `0x${string}`;

    const claimHash = await writeContractAsync({
      address: transmitter,
      abi: MESSAGE_TRANSMITTER_ABI,
      functionName: "receiveMessage",
      args: [msgBytes, attBytes],
      account: evmAccount,
    });

    clearPendingClaim();
    setState({ step: "done", claimTxHash: claimHash, depositTxSig, attestation: att });
  }

  // Retry just the EVM claim — call when step=error and attestation is in state
  const retryClaim = useCallback(async () => {
    const { attestation, pendingChainId, pendingEvmAccount, depositTxSig } = state;
    if (!attestation || !pendingChainId || !pendingEvmAccount) return;
    setState((s) => ({ ...s, step: "claim", error: undefined }));
    try {
      await claimOnEvm(attestation, pendingChainId, pendingEvmAccount, depositTxSig);
    } catch (err: unknown) {
      setState((s) => ({ ...s, step: "error", error: extractError(err) }));
    }
  }, [state, mainnet, writeContractAsync]);

  const bridge = useCallback(
    async (params: {
      destinationChainId: string;
      recipientEvm: string;
      amount: string;
      evmAccount: `0x${string}`;
    }) => {
      if (!publicKey || !signTransaction) {
        setState({ step: "error", error: "Solana wallet not connected" });
        return;
      }
      const chain = getChain(params.destinationChainId);
      if (!chain) {
        setState({ step: "error", error: "Invalid destination chain" });
        return;
      }

      try {
        setState({ step: "deposit", pendingChainId: params.destinationChainId, pendingEvmAccount: params.evmAccount });

        const tx = await buildDepositForBurnTx({
          payer: publicKey,
          destinationDomain: chain.domain,
          mintRecipient: params.recipientEvm,
          amount: parseUnits(params.amount, 6),
          mainnet,
          connection,
        });

        const signedTx = await signTransaction(tx.tx);
        const sig = await sendAndConfirmSolana(connection, signedTx, tx.blockhash, tx.lastValidBlockHeight);

        // Save immediately — if attestation times out the Recover tab has the hash
        savePendingDeposit({ txHash: sig, chainId: params.destinationChainId, mainnet, direction: "sol-to-evm" });
        setState((s) => ({ ...s, step: "attestation", depositTxSig: sig }));

        const att = await fetchAttestation(sig, SOLANA_DOMAIN, mainnet, onAttestationProgress);
        if (!att) {
          setState((s) => ({ ...s, step: "error", error: "ATTESTATION_TIMEOUT", depositTxSig: sig }));
          return;
        }

        // Persist before claiming — if claim fails, user can retry
        savePendingClaim({
          chainId: params.destinationChainId,
          evmAccount: params.evmAccount,
          depositTxSig: sig,
          attestation: att,
          mainnet,
        });

        setState((s) => ({ ...s, step: "claim", attestation: att }));
        await claimOnEvm(att, params.destinationChainId, params.evmAccount, sig);
      } catch (err: unknown) {
        setState((s) => ({ ...s, step: "error", error: extractError(err) }));
      }
    },
    [publicKey, signTransaction, connection, writeContractAsync, mainnet]
  );

  return { state, bridge, reset, retryClaim };
}

function extractError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return formatBridgeError(raw);
}
