"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { getAddress } from "viem";
import { useWriteContract } from "wagmi";
import { MESSAGE_TRANSMITTER_ABI } from "@/lib/abis";
import { getChain, SOLANA_DOMAIN } from "@/lib/chains";
import { fetchAttestation, buildReceiveMessageTx, type AttestationProgress } from "@/lib/cctp";
import { clearPendingClaim, clearPendingDeposit } from "@/hooks/useBridgeSolToEvm";
import { sendAndConfirmSolana } from "@/lib/solana-utils";
import { formatBridgeError } from "@/lib/format-error";

export interface LogLine {
  id: number;
  type: "cmd" | "info" | "success" | "error" | "warn" | "data" | "poll";
  text: string;
  copyValue?: string;   // shown as copy button if set
}

export interface RedeemState {
  phase: "idle" | "fetching_attestation" | "countdown" | "claiming" | "done" | "error";
  logs: LogLine[];
  attestation?: { message: string; attestation: string };
  claimTx?: string;
  // live countdown
  pollAttempt?: number;
  pollMax?: number;
  countdown?: number;   // seconds remaining until next retry
}

let _id = 0;
function lid() { return ++_id; }

function isSolanaTx(hash: string | undefined): boolean {
  if (!hash) return false;
  return hash.length >= 43 && hash.length <= 88 && !hash.startsWith("0x");
}

export function useManualRedeem(mainnet: boolean) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { writeContractAsync } = useWriteContract();

  const [state, setState] = useState<RedeemState>({ phase: "idle", logs: [] });
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    abortRef.current?.abort();
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    addLog({ type: "warn", text: "  cancelled by user" });
    setState((s) => ({ ...s, phase: "error", error: "Cancelled" }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setState({ phase: "idle", logs: [] });
  }, []);

  function addLog(line: Omit<LogLine, "id">) {
    setState((s) => ({ ...s, logs: [...s.logs, { ...line, id: lid() }] }));
  }

  function startCountdown(seconds: number) {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setState((s) => ({ ...s, phase: "countdown", countdown: seconds }));
    countdownRef.current = setInterval(() => {
      setState((s) => {
        const next = (s.countdown ?? 0) - 1;
        if (next <= 0) {
          clearInterval(countdownRef.current!);
          countdownRef.current = null;
          return { ...s, phase: "fetching_attestation", countdown: 0 };
        }
        return { ...s, countdown: next };
      });
    }, 1000);
  }

  function onAttestationProgress(p: AttestationProgress) {
    setState((s) => ({ ...s, pollAttempt: p.attempt, pollMax: p.maxAttempts }));

    if (p.phase === "polling") {
      // update last poll line in place so terminal doesn't flood
      setState((s) => {
        const last = s.logs[s.logs.length - 1];
        const pollLine: LogLine = {
          id: last?.type === "poll" ? last.id : lid(),
          type: "poll",
          text: `[${p.attempt}/${p.maxAttempts}] Querying Circle IRIS API...`,
        };
        const logs = last?.type === "poll"
          ? [...s.logs.slice(0, -1), pollLine]
          : [...s.logs, pollLine];
        return { ...s, logs };
      });
    }

    if (p.phase === "not_found") {
      addLog({ type: "warn", text: `  tx not indexed yet — retry in ${p.retryInSeconds}s` });
      startCountdown(p.retryInSeconds);
    }
    if (p.phase === "pending") {
      addLog({ type: "warn", text: `  attestation PENDING (Circle signing) — retry in ${p.retryInSeconds}s` });
      startCountdown(p.retryInSeconds);
    }
    if (p.phase === "error") {
      addLog({ type: "warn", text: `  IRIS API error — retry in ${p.retryInSeconds}s${p.detail ? ` (${p.detail})` : ""}` });
      startCountdown(p.retryInSeconds);
    }
  }

  async function submitClaim(
    att: { message: string; attestation: string },
    chain: ReturnType<typeof getChain>,
    evmAccount: `0x${string}`,
    solana: boolean,
    solRecipient?: string,
  ) {
    if (!chain) return;
    setState((s) => ({ ...s, phase: "claiming", attestation: att }));
    try {
      if (solana) {
        addLog({ type: "info", text: `Submitting receiveMessage → ${chain.name}...` });
        const transmitter = getAddress(mainnet ? chain.messageTransmitter : chain.messageTransmitterTestnet);
        const hash = await writeContractAsync({
          address: transmitter,
          abi: MESSAGE_TRANSMITTER_ABI,
          functionName: "receiveMessage",
          args: [
            `0x${att.message.replace("0x", "")}` as `0x${string}`,
            `0x${att.attestation.replace("0x", "")}` as `0x${string}`,
          ],
          account: evmAccount,
        });
        addLog({ type: "success", text: `✓ Claim submitted on ${chain.name}` });
        addLog({ type: "data",    text: `  claim tx   : ${hash}`, copyValue: hash });
        clearPendingClaim();
        clearPendingDeposit();
        setState((s) => ({ ...s, phase: "done", claimTx: hash }));
      } else {
        if (!publicKey || !signTransaction) {
          addLog({ type: "error", text: "ERROR: Solana wallet not connected" });
          setState((s) => ({ ...s, phase: "error" })); return;
        }
        addLog({ type: "info", text: "Building Solana receiveMessage transaction..." });
        const usdcAddr = mainnet ? chain.usdc : chain.usdcTestnet;
        const tx = await buildReceiveMessageTx({
          payer: publicKey, message: att.message, attestation: att.attestation,
          remoteDomain: chain.domain, remoteUsdcHex: usdcAddr,
          to: solRecipient ?? "", mainnet, connection,
        });
        addLog({ type: "info", text: "Sending to Phantom for signature..." });
        const signed = await signTransaction(tx.tx);
        addLog({ type: "info", text: "Confirming transaction..." });
        const sig = await sendAndConfirmSolana(connection, signed, tx.blockhash, tx.lastValidBlockHeight);
        addLog({ type: "success", text: "✓ USDC claimed on Solana" });
        addLog({ type: "data",    text: `  claim tx   : ${sig}`, copyValue: sig });
        clearPendingClaim();
        clearPendingDeposit();
        setState((s) => ({ ...s, phase: "done", claimTx: sig }));
      }
    } catch (err: unknown) {
      let msg = err instanceof Error ? err.message : String(err);
      if (err && typeof err === "object" && "getLogs" in err) {
        try {
          const logs = await (err as { getLogs: (c: unknown) => Promise<string[]> }).getLogs(connection);
          if (logs?.length) msg += "\n" + logs.join("\n");
        } catch {}
      }
      addLog({ type: "error", text: `ERROR: ${formatBridgeError(msg)}` });
      setState((s) => ({ ...s, phase: "error" }));
    }
  }

  const redeem = useCallback(
    async (params: {
      txHash: string;
      chainId: string;
      evmAccount: `0x${string}`;
      solRecipient?: string;
    }) => {
      const chain = getChain(params.chainId);
      if (!chain) {
        addLog({ type: "error", text: "ERROR: invalid chain selected" });
        setState((s) => ({ ...s, phase: "error" }));
        return;
      }

      const solana = isSolanaTx(params.txHash);
      // const short = params.txHash.slice(0, 12) + "..." + params.txHash.slice(-6);
      // const net = mainnet ? "mainnet" : "testnet";

      setState((s) => ({ ...s, phase: "fetching_attestation", logs: [] }));

      // addLog({ type: "cmd",  text: `$ meow recover --tx ${short} --network ${net}` });
      addLog({ type: "info", text: `  tx type   : ${solana ? "Solana burn" : "EVM burn"}` });
      addLog({ type: "info", text: `  direction : ${solana ? `Solana → ${chain.name}` : `${chain.name} → Solana`}` });
      addLog({ type: "info", text: `  full hash : ${params.txHash}`, copyValue: params.txHash });
      addLog({ type: "info", text: "" });
      addLog({ type: "info", text: `Connecting to Circle IRIS API (domain ${solana ? SOLANA_DOMAIN : chain.domain})...` });

      const sourceDomain = solana ? SOLANA_DOMAIN : chain.domain;
      abortRef.current = new AbortController();
      const att = await fetchAttestation(params.txHash, sourceDomain, mainnet, onAttestationProgress, abortRef.current.signal);
      abortRef.current = null;

      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }

      if (!att) {
        // null means either timeout or cancelled — if cancelled the cancel() fn already set the state
        if (state.phase !== "error") {
          addLog({ type: "error", text: "ERROR: attestation not received after 60 attempts (15 min)" });
          addLog({ type: "warn",  text: "  tx may still be pending or already claimed" });
          setState((s) => ({ ...s, phase: "error" }));
        }
        return;
      }

      addLog({ type: "success", text: "✓ Attestation received!" });
      addLog({ type: "data", text: "  message    :", copyValue: att.message });
      addLog({ type: "data", text: "  attestation:", copyValue: att.attestation });
      addLog({ type: "info",  text: "" });

      await submitClaim(att, chain, params.evmAccount, isSolanaTx(params.txHash), params.solRecipient);
    },
    [publicKey, signTransaction, connection, writeContractAsync, mainnet]
  );

  // Claim with a pre-known attestation — skips IRIS polling entirely
  const redeemWithAttestation = useCallback(
    async (params: {
      attestation: { message: string; attestation: string };
      chainId: string;
      evmAccount: `0x${string}`;
      depositTxSig?: string;      // original burn tx (for display only)
      solRecipient?: string;
    }) => {
      const chain = getChain(params.chainId);
      if (!chain) {
        addLog({ type: "error", text: "ERROR: invalid chain" });
        setState((s) => ({ ...s, phase: "error" }));
        return;
      }

      const solana = params.depositTxSig ? isSolanaTx(params.depositTxSig) : false;
      setState((s) => ({ ...s, phase: "claiming", logs: [] }));

      addLog({ type: "cmd",     text: `$ meow recover --skip-iris (attestation cached)` });
      if (params.depositTxSig)
        addLog({ type: "info",  text: `  burned tx  : ${params.depositTxSig}`, copyValue: params.depositTxSig });
      addLog({ type: "info",  text: `  direction  : ${solana ? `Solana → ${chain.name}` : `${chain.name} → Solana`}` });
      addLog({ type: "success", text: "✓ Using cached attestation (no IRIS needed)" });
      addLog({ type: "data",    text: "  message    :", copyValue: params.attestation.message });
      addLog({ type: "data",    text: "  attestation:", copyValue: params.attestation.attestation });
      addLog({ type: "info",    text: "" });

      await submitClaim(params.attestation, chain, params.evmAccount, solana, params.solRecipient);
    },
    [publicKey, signTransaction, connection, writeContractAsync, mainnet]
  );

  return { state, redeem, redeemWithAttestation, cancel, reset };
}
