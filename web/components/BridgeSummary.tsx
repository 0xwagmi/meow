"use client";

import {
  useSolToEvmGasEstimate,
  useEvmToSolGasEstimate,
  formatEthGas,
  formatLamports,
} from "@/hooks/useGasEstimate";

interface Props {
  direction: "sol-to-evm" | "evm-to-sol";
  amount: string;
  chainId: number | undefined;
  needsApproval?: boolean;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300">{value}</span>
    </div>
  );
}

function ZeroBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1  bg-green-500/15  px-2 py-0.5 text-[10px] font-medium text-green-400">
      ✓ {label}
    </span>
  );
}

export function BridgeSummary({ direction, amount, chainId, needsApproval = false }: Props) {
  const solToEvm = useSolToEvmGasEstimate(direction === "sol-to-evm" ? chainId : undefined);
  const evmToSol = useEvmToSolGasEstimate(direction === "evm-to-sol" ? chainId : undefined, needsApproval);
  const estimate = direction === "sol-to-evm" ? solToEvm : evmToSol;

  const parsedAmount = parseFloat(amount);
  const validAmount = !isNaN(parsedAmount) && parsedAmount > 0;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 space-y-2.5">
      {/* Zero fee badges */}
      <div className="flex gap-2 flex-wrap">
        <ZeroBadge label="Zero protocol fee" />
        <ZeroBadge label="Zero slippage" />
        <ZeroBadge label="1:1 USDC" />
      </div>

      {/* Amount summary */}
      {validAmount && (
        <div className="border-t border-slate-800 pt-2 space-y-1.5">
          <Row label="You send"     value={`${parsedAmount.toFixed(6)} USDC`} />
          <Row
            label="You receive"
            value={<span className="text-green-400 font-medium">{parsedAmount.toFixed(6)} USDC</span>}
          />
          <Row label="Protocol fee" value={<span className="text-green-400">$0.00</span>} />
        </div>
      )}

      {/* Gas estimates */}
      <div className="border-t border-slate-800 pt-2 space-y-1.5">
        <p className="text-[10px] text-slate-600 uppercase tracking-wide">
          Network gas (paid to validators, not meow)
        </p>

        {estimate.loading ? (
          <p className="text-xs text-slate-500 animate-pulse">Fetching gas price…</p>
        ) : (
          <>
            {direction === "sol-to-evm" && (
              <>
                <Row label="Solana burn tx"  value={`~${formatLamports(estimate.solanaFeeLamports)}`} />
                <Row label="EVM claim tx"    value={estimate.evmClaimEth ? `~${formatEthGas(estimate.evmClaimEth)}` : "—"} />
              </>
            )}
            {direction === "evm-to-sol" && (
              <>
                {estimate.evmApproveEth && (
                  <Row label="EVM approve"   value={`~${formatEthGas(estimate.evmApproveEth)}`} />
                )}
                <Row label="EVM burn tx"     value={estimate.evmDepositEth ? `~${formatEthGas(estimate.evmDepositEth)}` : "—"} />
                <Row label="Solana claim tx" value={`~${formatLamports(estimate.solanaFeeLamports)}`} />
              </>
            )}
            <p className="text-[10px] text-slate-600 pt-0.5">
              Solana fees fetched live from your RPC. EVM fees use live gas price × CCTP gas limits.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
