# Web Agent Rules

## Next.js version

Next.js 16 (Turbopack). APIs and conventions differ from training data.
Read `node_modules/next/dist/docs/` before writing code. Heed deprecation notices.

## Settings system — read first

All runtime config flows through `useSettings()` from `@/lib/settings-context`.
**Never** read `process.env.NEXT_PUBLIC_MAINNET` directly in components or hooks.
Always use `settings.mainnet` from context.

```ts
import { useSettings } from "@/lib/settings-context";
const { settings } = useSettings();  // { mainnet, solanaRpc, evmRpc }
```

`SettingsProvider` is the outermost wrapper in `providers.tsx`. Do not remove it or move it inside WagmiProvider.

## Provider nesting order

```
SettingsProvider          ← outermost
  WagmiProvider           ← static wagmiConfig (EVM RPC from localStorage at init)
    QueryClientProvider
      RainbowKitProvider
        ConnectionProvider  ← endpoint={settings.solanaRpc} (live)
          WalletProvider
            WalletModalProvider
```

## mainnet flag propagation

Hooks that take `mainnet: boolean` (`useBridgeSolToEvm`, `useBridgeEvmToSol`, `useManualRedeem`) are called from components. Components read `settings.mainnet` from `useSettings()` and pass it in. Do not move `mainnet` reading into the hooks themselves — keep it at call site.

## CCTP Solana account ordering

Account order in `buildDepositForBurnTx` and `buildReceiveMessageTx` is EXACT.
Wrong order → `InvalidProgramId`. See CLAUDE.md for full account lists.

Key traps:
- `system_program` at index 14 in depositForBurn (NOT at end)
- `event_authority` seed is `__event_authority` (double underscore), not `event_authority`
- `eventAccountKeypair` must `partialSign` before wallet signs
- `mintRecipient` in EVM depositForBurn = Solana ATA (`getAssociatedTokenAddressSync`), NOT wallet pubkey

## EVM RPC changes

Custom EVM RPC written to localStorage `meow_bridge_settings_v1.evmRpc`.
`wagmi-config.ts` reads this once at module init via `getStoredEvmRpcSync()`.
Changes apply after page reload — tell the user in the UI, do not try to recreate wagmi config at runtime.

## localStorage patterns

- Always use `useEffect` + `setState` to read localStorage (never `useState(() => localStorage...)`).
  Reason: `useState` initializer runs during SSR where localStorage doesn't exist → hydration mismatch.
- Pending bridge state keys: `meow_pending_deposit`, `meow_pending_claim`.

## Solana transaction confirmation

Always use blockhash strategy:
```ts
await connection.confirmTransaction(
  { signature: sig, blockhash: tx.blockhash, lastValidBlockHeight: tx.lastValidBlockHeight },
  "confirmed"
);
```
Never pass bare string signature — deprecated and unreliable.

## bigint → LE bytes

```ts
// Browser-safe — Buffer polyfill lacks writeBigUInt64LE
const ab = new ArrayBuffer(8);
new DataView(ab).setBigUint64(0, value, true);
```

## Attestation polling

`fetchAttestation` in `cctp.ts` accepts `onProgress` callback and `AbortSignal`.
Always wire up an `AbortController` ref so polling can be cancelled on unmount or user cancel.
Phase values: `"polling"` | `"not_found"` | `"pending"` | `"error"` | `"success"`.

## Recover tab isolation

`ManualRedeem` is conditionally rendered (`{tab === "recover" && <ManualRedeem />}`).
Do NOT make it always-mounted. It mounts fresh each visit so it re-reads localStorage and AbortController cleans up on unmount.
The bridge tabs (Sol→EVM, EVM→Sol) ARE always mounted (CSS hidden) to preserve in-progress state.
