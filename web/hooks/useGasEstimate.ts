"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useGasPrice } from "wagmi";
import { formatEther } from "viem";

const GAS = {
  depositForBurn: 120_000n,
  receiveMessage: 150_000n,
  approve:         55_000n,
} as const;

// CCTP depositForBurn creates a persistent message_sent_event_data account.
// 8 (discriminator) + 4 (vec len) + ~248 (CCTP message) ≈ 260 bytes; using 300 (conservative).
const DEPOSIT_EVENT_ACCOUNT_BYTES = 300;

// SPL token account for ATA in receiveMessage.
const TOKEN_ACCOUNT_BYTES = 165;

const BASE_TX_FEE = 10_000; // 2 sigs × 5000 lamports

export interface GasEstimate {
  evmDepositEth?: string;
  evmApproveEth?: string;
  evmClaimEth?: string;
  solanaFeeLamports: number;
  loading: boolean;
  error: boolean;
}

export function formatLamports(lam: number) {
  const sol = lam / 1e9;
  // Show enough decimals that real RPC values are distinguishable from fallbacks
  return sol.toFixed(6) + " SOL";
}

export function formatEthGas(eth: string) {
  const n = parseFloat(eth);
  if (isNaN(n)) return "error";
  if (n < 0.000001) return "< 0.000001 ETH";
  return n.toFixed(6) + " ETH";
}

function useSolanaRent(bytes: number): { lamports: number; loading: boolean; error: boolean } {
  const { connection } = useConnection();
  const [lamports, setLamports] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    connection
      .getMinimumBalanceForRentExemption(bytes)
      .then((val) => { setLamports(val); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [connection, bytes]);

  return { lamports, loading, error };
}

export function useSolToEvmGasEstimate(chainId: number | undefined): GasEstimate {
  const { data: gasPrice, isLoading: evmLoading } = useGasPrice({ chainId });
  const { lamports: eventRent, loading: rentLoading, error: rentError } = useSolanaRent(DEPOSIT_EVENT_ACCOUNT_BYTES);

  const loading = evmLoading || rentLoading;
  const evmError = !evmLoading && !gasPrice;
  const bothFailed = evmError && rentError;

  const solanaFeeLamports = eventRent + BASE_TX_FEE;

  if (loading) return { solanaFeeLamports, loading: true, error: false };
  if (bothFailed) return { solanaFeeLamports: 0, loading: false, error: true };
  if (evmError || !gasPrice) return { solanaFeeLamports, loading: false, error: false };

  return {
    evmClaimEth: formatEther(gasPrice * GAS.receiveMessage),
    solanaFeeLamports,
    loading: false,
    error: false,
  };
}

export function useEvmToSolGasEstimate(
  chainId: number | undefined,
  needsApproval: boolean
): GasEstimate {
  const { data: gasPrice, isLoading: evmLoading } = useGasPrice({ chainId });
  const { lamports: ataRent, loading: rentLoading, error: rentError } = useSolanaRent(TOKEN_ACCOUNT_BYTES);

  const loading = evmLoading || rentLoading;
  const evmError = !evmLoading && !gasPrice;
  const bothFailed = evmError && rentError;

  const solanaFeeLamports = ataRent + BASE_TX_FEE;

  if (loading) return { solanaFeeLamports, loading: true, error: false };
  if (bothFailed) return { solanaFeeLamports: 0, loading: false, error: true };
  if (evmError || !gasPrice) return { solanaFeeLamports, loading: false, error: false };

  return {
    evmDepositEth: formatEther(gasPrice * GAS.depositForBurn),
    evmApproveEth: needsApproval ? formatEther(gasPrice * GAS.approve) : undefined,
    solanaFeeLamports,
    loading: false,
    error: false,
  };
}
