"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  buildReceiveMessageTx,
  fetchAttestation,
  solanaAddressToBytes32,
  type AttestationProgress,
} from "@/lib/cctp";
import { sendAndConfirmSolana } from "@/lib/solana-utils";
import { formatBridgeError } from "@/lib/format-error";

const SOLANA_USDC_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const SOLANA_USDC_DEVNET  = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
import { useWriteContract } from "wagmi";
import { parseUnits, getAddress } from "viem";
import { TOKEN_MESSENGER_ABI, USDC_ABI } from "@/lib/abis";
import { getChain, SOLANA_DOMAIN } from "@/lib/chains";
import type { BridgeStep } from "@/lib/types";
import type { AttestationPoll } from "./useBridgeSolToEvm";
import { savePendingDeposit } from "./useBridgeSolToEvm";

export type { BridgeStep };

export interface BridgeState {
  step: BridgeStep;
  approveTxHash?: `0x${string}`;
  depositTxHash?: `0x${string}`;
  attestation?: { message: string; attestation: string };
  claimTxSig?: string;
  attestationPoll?: AttestationPoll;
  error?: string;
}

export function useBridgeEvmToSol(mainnet: boolean) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { writeContractAsync } = useWriteContract();

  const [state, setState] = useState<BridgeState>({ step: "idle" });
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current); }, []);

  const reset = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
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

  const bridge = useCallback(
    async (params: {
      sourceChainId: string;
      recipientSolana: string;
      amount: string;
      evmAccount: `0x${string}`;
      allowance: bigint;
    }) => {
      if (!publicKey || !signTransaction) {
        setState({ step: "error", error: "Solana wallet not connected" });
        return;
      }

      const chain = getChain(params.sourceChainId);
      if (!chain) {
        setState({ step: "error", error: "Invalid source chain" });
        return;
      }

      const usdcAddr = getAddress(mainnet ? chain.usdc : chain.usdcTestnet);
      const messengerAddr = getAddress(mainnet ? chain.tokenMessenger : chain.tokenMessengerTestnet);
      const transmitterAddr = getAddress(mainnet ? chain.messageTransmitter : chain.messageTransmitterTestnet);

      const amountRaw = parseUnits(params.amount, 6);

      try {
        // Step 1: Approve USDC if needed
        if (params.allowance < amountRaw) {
          setState({ step: "approve" });
          const approveHash = await writeContractAsync({
            address: usdcAddr,
            abi: USDC_ABI,
            functionName: "approve",
            args: [messengerAddr, amountRaw],   // exact amount — never leave standing allowance
            account: params.evmAccount,
          });
          setState((s) => ({ ...s, approveTxHash: approveHash }));
        }

        // Step 2: depositForBurn on EVM
        setState((s) => ({ ...s, step: "deposit" }));

        const recipientKey = new PublicKey(params.recipientSolana || publicKey.toBase58());

        // mintRecipient must be the ATA, not the wallet — CCTP program validates
        // recipient_token_account.key() == mintRecipient from message
        const usdcMint = mainnet ? SOLANA_USDC_MAINNET : SOLANA_USDC_DEVNET;
        const recipientAta = getAssociatedTokenAddressSync(usdcMint, recipientKey);
        const mintRecipientBytes32 = solanaAddressToBytes32(recipientAta.toBase58());

        const depositHash = await writeContractAsync({
          address: messengerAddr,
          abi: TOKEN_MESSENGER_ABI,
          functionName: "depositForBurn",
          args: [amountRaw, SOLANA_DOMAIN, mintRecipientBytes32, usdcAddr],
          account: params.evmAccount,
        });
        setState((s) => ({ ...s, depositTxHash: depositHash }));

        // Save immediately — if attestation times out the Recover tab has the hash
        savePendingDeposit({ txHash: depositHash, chainId: params.sourceChainId, mainnet, direction: "evm-to-sol" });

        // Step 3: Wait for attestation
        setState((s) => ({ ...s, step: "attestation" }));
        const att = await fetchAttestation(depositHash, chain.domain, mainnet, onAttestationProgress);
        if (!att) {
          setState((s) => ({ ...s, step: "error", error: "ATTESTATION_TIMEOUT" }));
          return;
        }
        setState((s) => ({ ...s, attestation: att }));

        // Step 4: receiveMessage on Solana via Phantom
        setState((s) => ({ ...s, step: "claim" }));
        const tx = await buildReceiveMessageTx({
          payer: publicKey,
          message: att.message,
          attestation: att.attestation,
          remoteDomain: chain.domain,
          remoteUsdcHex: usdcAddr,
          to: params.recipientSolana,
          mainnet,
          connection,
        });

        const signedTx = await signTransaction(tx.tx);
        const sig = await sendAndConfirmSolana(connection, signedTx, tx.blockhash, tx.lastValidBlockHeight);

        setState({
          step: "done",
          claimTxSig: sig,
          depositTxHash: depositHash,
          attestation: att,
        });
      } catch (err: unknown) {
        let msg = err instanceof Error ? err.message : String(err);
        if (err && typeof err === "object" && "getLogs" in err) {
          try {
            const logs: string[] = await (err as any).getLogs(connection);
            if (logs?.length) msg += "\n" + logs.join("\n");
          } catch {}
        }
        setState({ step: "error", error: formatBridgeError(msg) });
      }
    },
    [publicKey, signTransaction, connection, writeContractAsync, mainnet]
  );

  return { state, bridge, reset };
}
