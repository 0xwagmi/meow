const PATTERNS: Array<[RegExp, string]> = [
  [/user rejected|user denied|rejected the request/i,    "Cancelled by user."],
  [/insufficient funds for (gas|transaction)/i,          "Insufficient funds for gas."],
  [/insufficient (sol|lamports)/i,                       "Insufficient SOL to pay fee."],
  [/already been processed/i,                            "Already confirmed — check wallet balance."],
  [/blockhash not found|block height exceeded/i,         "Transaction expired. Try again."],
  [/0x1779|InvalidMintRecipient|mintRecipient mismatch/i,"Token account mismatch. Use original recipient address."],
  [/simulation failed.*already/i,                        "May already be complete — check wallet balance."],
  [/simulation failed/i,                                 "Simulation failed. Check wallet and try again."],
  [/execution reverted/i,                                "Contract reverted. May already be claimed."],
  [/network (changed|mismatch)/i,                        "Network changed mid-transaction. Try again."],
  [/timeout|ETIMEDOUT/i,                                 "Request timed out. Check connection."],
  [/403|Access forbidden|rate limit/i,                   "Solana RPC rate limited. Set a private RPC in Settings (Helius, Triton)."],
  [/ATA.*not found|account.*does not exist/i,            "Token account not found. It will be created on first claim."],
];

export function formatBridgeError(raw: string): string {
  for (const [pattern, msg] of PATTERNS) {
    if (pattern.test(raw)) return msg;
  }
  return raw.length > 220 ? raw.slice(0, 220) + "…" : raw;
}
