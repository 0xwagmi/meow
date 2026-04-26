# CLAUDE.md

## Structure

```
Cargo.toml                  # Rust workspace root (members: core-lib)
src/
  main.rs                   # meow CLI binary
  app.rs                    # clap Commands enum
  core-lib/src/
    lib.rs                  # load_env(), set_env_path()
    evm/
      evm_manager.rs        # EvmManager::init() — web3 + contracts
      claim.rs              # evm_claim()
      deposit_for_burn.rs   # evm_deposit() — interactive Confirm (CLI only!)
      constants.rs          # RPC URLs, contract addresses
    solana/
      svm_manager.rs        # SolanaManager + SOLANA_MANAGER OnceCell global
      programs.rs           # call_deposit_for_burn(), call_recieve_message()
      irismsg.rs            # get_messages() — polls Circle IRIS API
      constants.rs          # DestinationDomain enum
web/                        # Next.js 16 frontend (Bun)
  app/
    layout.tsx              # RootLayout — wraps <Providers>
    page.tsx                # Main bridge page — tabs + settings modal
    providers.tsx           # SettingsProvider > WagmiInner (wagmi+RainbowKit+Solana)
  components/
    BridgeSolToEvm.tsx      # Sol→EVM form
    BridgeEvmToSol.tsx      # EVM→Sol form
    ManualRedeem.tsx        # Recover tab — terminal UI for stuck bridges
    StepProgress.tsx        # Step indicator during bridge
    SettingsModal.tsx       # Network/RPC settings modal
    WalletBar.tsx           # RainbowKit + Solana wallet buttons
    BridgeSummary.tsx       # Gas estimate summary
  hooks/
    useBridgeSolToEvm.ts    # Bridge logic: deposit Solana → attestation → claim EVM
    useBridgeEvmToSol.ts    # Bridge logic: approve+deposit EVM → attestation → claim Solana
    useManualRedeem.ts      # Recover logic with AbortController cancel support
    useNetworkGuard.ts      # Checks Solana wallet on correct network
  lib/
    chains.ts               # BRIDGE_CHAINS, getChain(), getChainByViemId()
    abis.ts                 # TokenMessenger, MessageTransmitter, USDC ABIs
    cctp.ts                 # buildDepositForBurnTx(), buildReceiveMessageTx(), fetchAttestation()
    wagmi-config.ts         # wagmiConfig — reads custom EVM RPC from localStorage at init
    settings.ts             # Settings type, validateRpcUrl(), loadSettings(), saveSettings()
    settings-context.tsx    # SettingsProvider + useSettings() hook
    types.ts                # BridgeStep type
```

## CLI Commands

```bash
# Rust CLI
cargo build -r
./target/release/meow bridge-solana-usdc --to-chain base --to 0x<addr> --amount 1
./target/release/meow bridge-evm-usdc --from-chain base --amount 1 --retry-secs 300
./target/release/meow mannual-redeem-usdc --txn-hash <hash> --remote-domain 6
./target/release/meow set-env --path /path/to/.env

# Web frontend
cd web
bun dev         # dev server on :3000
bun run build   # production build
bun start       # production server
```

## Environment

### Rust CLI (`.env`)
```env
KEYPAIR_PATH=path/to/solana-keypair.json
FEE_PAYER_KEY=0x<evm-private-key>
FEE_PAYER_ADDRESS=0x<evm-address>
```
Env path stored at `~/.config/meow/env_path` via `set-env` command.

### Web frontend (`web/.env.local`)
```env
NEXT_PUBLIC_MAINNET=false                              # sets default; user can override in Settings UI
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com  # sets default; user can override in Settings UI
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<from cloud.walletconnect.com>
```
User settings stored in `localStorage["meow_bridge_settings_v1"]`. Override env defaults at runtime.

## Chain Domains (CCTP)

| Chain | Domain |
|-------|--------|
| Ethereum | 0 |
| Avalanche | 1 |
| Optimism | 2 |
| Arbitrum | 3 |
| Solana | 5 (source domain for Solana burns) |
| Base | 6 |
| Polygon PoS | 7 |
| Unichain | 10 |

## Bridge Flow

**Sol → EVM** (`useBridgeSolToEvm.ts`):
1. `buildDepositForBurnTx()` → Phantom signs + submits → Solana tx sig
2. `savePendingDeposit()` immediately after confirm (recovery safety net)
3. `fetchAttestation(sig, SOLANA_DOMAIN=5, mainnet)` → polls IRIS API
4. `savePendingClaim()` after attestation (clears deposit key)
5. wagmi `writeContractAsync` → MetaMask calls `receiveMessage` on EVM `MessageTransmitter`

**EVM → Sol** (`useBridgeEvmToSol.ts`):
1. wagmi `writeContractAsync` → MetaMask calls `approve` on USDC (exact amount, not maxUint256)
2. wagmi `writeContractAsync` → MetaMask calls `depositForBurn` on EVM `TokenMessenger`
   - `mintRecipient` MUST be the Solana ATA address (`getAssociatedTokenAddressSync`), NOT wallet pubkey
3. `savePendingDeposit()` immediately after deposit tx confirms
4. `fetchAttestation(txHash, chain.domain, mainnet)` → polls IRIS API
5. `buildReceiveMessageTx()` → Phantom signs + submits → Solana tx sig

## Settings System

`useSettings()` from `@/lib/settings-context` provides `{ settings, updateSettings }`.

`settings` shape:
- `mainnet: boolean` — live, affects contract addresses + IRIS API URL
- `solanaRpc: string` — live, ConnectionProvider endpoint updates immediately
- `evmRpc: string` — applied on next page load (wagmiConfig reads localStorage at init)

**Never** use `process.env.NEXT_PUBLIC_MAINNET` directly in components/hooks — always use `useSettings().settings.mainnet`.

RPC validation: `https://` or `wss://` only. Localhost rejected. Custom RPCs show security warning.

## Critical Constraints

**Rust CLI only**: `evm_deposit` in `deposit_for_burn.rs` uses `dialoguer::Confirm` (interactive terminal). Do not call from non-TTY.

**`SOLANA_MANAGER` OnceCell**: CLI initializes once per process. All calls use `SOLANA_MANAGER.get().unwrap()`.

**USDC amounts**: `call_deposit_for_burn` with `safe_format=true` takes USDC units (1=$1); `safe_format=false` takes micro-USDC. Web uses `parseUnits(amount, 6)` → always micro-USDC.

**Circle IRIS API**: polls directly from browser. Solana source domain = 5. EVM source = chain.domain.

**Solana CCTP Transactions** — account ordering is exact, wrong order = `InvalidProgramId`:

`depositForBurn` (17 accounts):
```
0  owner (payer)
1  event_rent_payer
2  sender_authority_pda  [seeds: "sender_authority"]
3  burn_token_account    (owner's USDC ATA)
4  message_transmitter   (MessageTransmitter state)
5  token_messenger       (TokenMessengerMinter state)
6  remote_token_messenger
7  token_minter          [seeds: "token_minter"]
8  local_token           [seeds: "local_token", mint]
9  burn_token_mint       (USDC mint)
10 message_sent_event_data (ephemeral keypair, writable+signer)
11 message_transmitter_program
12 token_messenger_minter_program
13 token_program
14 system_program
15 event_authority       TM: CNfZLeePMG6QFgBNBp7BGkGdJRpDtJC6nhv7yt3D7bnm
16 program               TOKEN_MESSENGER_MINTER
```

`receiveMessage` (9 base + 10 remaining_accounts):
```
0  payer
1  caller            (payer)
2  authority_pda     [seeds: "message_transmitter_authority", receiver_program]
3  message_transmitter (state)
4  used_nonces       [seeds: "used_nonces", domain_str, "\x00", first_nonce_str]
                     first_nonce = ((nonce-1)/6400)*6400+1
5  receiver          (TokenMessengerMinter program)
6  system_program
7  event_authority   MT: 6mH8scf1iBsYEFWrNaGsBUFpFJB7TMVWd8PMKoXwnSMk
8  program           MESSAGE_TRANSMITTER
   + 10 remaining_accounts from CCTP program
```

**Event authority PDAs** (double underscore seed):
- TokenMessengerMinter: `CNfZLeePMG6QFgBNBp7BGkGdJRpDtJC6nhv7yt3D7bnm` (seed: `__event_authority`)
- MessageTransmitter: `6mH8scf1iBsYEFWrNaGsBUFpFJB7TMKoXwnSMk` — verify in code

**Discriminators** (first 8 bytes of ix data):
- `depositForBurn`: `[0xd7, 0x3c, 0x3d, 0x2e, 0x72, 0x37, 0x80, 0xb0]`
- `receiveMessage`:  `[0x26, 0x90, 0x7f, 0xe1, 0x1f, 0xe1, 0xee, 0x19]`

**mintRecipient**: In EVM `depositForBurn`, must be the Solana ATA, not wallet pubkey. Bytes 152–184 of the CCTP message contain it. `buildReceiveMessageTx` calls `extractMintRecipient(messageHex)`.

**`eventAccountKeypair`**: ephemeral keypair per `depositForBurn`. Must call `tx.partialSign(eventAccountKeypair)` BEFORE wallet signs.

**`bigintToLE8`**: use `new DataView(ab).setBigUint64(0, value, true)` — browser Buffer polyfill lacks `writeBigUInt64LE`.

**Solana tx confirmation**: always use `{ signature, blockhash, lastValidBlockHeight }` form, not deprecated string form.

## Recovery Flow

Stuck bridges → Recover tab → `ManualRedeem` component.

`savePendingDeposit` / `savePendingClaim` write to localStorage keys `meow_pending_deposit` / `meow_pending_claim`. `ManualRedeem` reads these on mount (useEffect, not useState initializer — avoids SSR hydration mismatch).

If `pending.attestation` exists in stored claim → call `redeemWithAttestation()` (skip IRIS). Otherwise call `redeem()`.

`AbortController` cancels IRIS polling. Cancel button visible during `fetching_attestation` and `countdown` phases.
