import { PublicKey, Connection, Transaction, TransactionInstruction, SystemProgram, Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// ── Helpers ──────────────────────────────────────────────────────────────────

function bigintToLE8(value: bigint): Buffer {
  const ab = new ArrayBuffer(8);
  new DataView(ab).setBigUint64(0, value, true);
  return Buffer.from(ab);
}

function readBE64(buf: Buffer, offset: number): bigint {
  return new DataView(buf.buffer, buf.byteOffset + offset, 8).getBigUint64(0, false);
}

function findPda(seeds: Buffer[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function computeFirstNonce(nonce: bigint): bigint {
  const MAX = 6400n;
  return ((nonce - 1n) / MAX) * MAX + 1n;
}

function usedNoncesSeedDelimiter(sourceDomain: number): Buffer {
  return sourceDomain < 11 ? Buffer.alloc(0) : Buffer.from("-");
}

// ── Program IDs ───────────────────────────────────────────────────────────────

const MESSAGE_TRANSMITTER = new PublicKey("CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd");
const TOKEN_MESSENGER_MINTER = new PublicKey("CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3");

// Precomputed: findPda(["__event_authority"], PROGRAM)
const TM_EVENT_AUTHORITY = new PublicKey("CNfZLeeL4RUxwfPnjA3tLiQt4y43jp4V7bMpga673jf9");
const MT_EVENT_AUTHORITY = new PublicKey("6mH8scevHQJsyyp1qxu8kyAapHuzEE67mtjFDJZjSbQW");

const SOLANA_USDC_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const SOLANA_USDC_DEVNET  = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// ── Exports ───────────────────────────────────────────────────────────────────

export function getSolanaRpc(mainnet: boolean): string {
  return mainnet ? "https://api.mainnet.solana.com" : "https://api.devnet.solana.com";
}

export function evmAddressToPubkey(evmAddress: string): PublicKey {
  const bytes = Buffer.from(evmAddress.toLowerCase().replace("0x", ""), "hex");
  const padded = Buffer.alloc(32);
  bytes.copy(padded, 12); // right-align 20 bytes into 32
  return new PublicKey(padded);
}

export function solanaAddressToBytes32(base58: string): `0x${string}` {
  return `0x${Buffer.from(new PublicKey(base58).toBytes()).toString("hex")}` as `0x${string}`;
}

// No network call — always prepend idempotent ATA create (no-op if already exists).
// Avoids getAccountInfo which is blocked by public mainnet RPC (403).
function ensureAta(
  payer: PublicKey,
  mint: PublicKey,
  owner: PublicKey
): { ata: PublicKey; createIx: TransactionInstruction } {
  const ata = getAssociatedTokenAddressSync(mint, owner);
  return {
    ata,
    createIx: createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mint),
  };
}

// ── sha256("global:deposit_for_burn")[0:8] ───────────────────────────────────
const DEPOSIT_FOR_BURN_DISC = Buffer.from([0xd7, 0x3c, 0x3d, 0x2e, 0x72, 0x37, 0x80, 0xb0]);
// ── sha256("global:receive_message")[0:8] ────────────────────────────────────
const RECEIVE_MESSAGE_DISC  = Buffer.from([0x26, 0x90, 0x7f, 0xe1, 0x1f, 0xe1, 0xee, 0x19]);

// ── DepositForBurn ────────────────────────────────────────────────────────────
//
// Account order (from DepositForBurnContext + #[event_cpi]):
//  0  owner                    Signer
//  1  event_rent_payer         Signer + mut
//  2  sender_authority_pda     PDA seeds=["sender_authority"]
//  3  burn_token_account       mut
//  4  message_transmitter      mut
//  5  token_messenger
//  6  remote_token_messenger
//  7  token_minter
//  8  local_token              mut   seeds=["local_token", mint]
//  9  burn_token_mint          mut
// 10  message_sent_event_data  Signer + mut
// 11  message_transmitter_program
// 12  token_messenger_minter_program
// 13  token_program
// 14  system_program           ← struct ends here
// 15  event_authority          #[event_cpi] appends: seeds=["__event_authority"] of TM_MINTER
// 16  program                  #[event_cpi] appends: TOKEN_MESSENGER_MINTER

export interface DepositForBurnParams {
  payer: PublicKey;
  destinationDomain: number;
  mintRecipient: string; // EVM address
  amount: bigint;        // micro-USDC
  mainnet: boolean;
  connection: Connection;
}

export interface TxWithBlockhash {
  tx: Transaction;
  blockhash: string;
  lastValidBlockHeight: number;
}

export async function buildDepositForBurnTx(p: DepositForBurnParams): Promise<TxWithBlockhash> {
  const usdcMint = p.mainnet ? SOLANA_USDC_MAINNET : SOLANA_USDC_DEVNET;

  const { ata: burnTokenAccount, createIx } = ensureAta(p.payer, usdcMint, p.payer);

  const mintRecipientPubkey = evmAddressToPubkey(p.mintRecipient);

  const senderAuthorityPda = findPda([Buffer.from("sender_authority")], TOKEN_MESSENGER_MINTER);
  const messageTransmitterAccount = findPda([Buffer.from("message_transmitter")], MESSAGE_TRANSMITTER);
  const tokenMessengerAccount = findPda([Buffer.from("token_messenger")], TOKEN_MESSENGER_MINTER);
  const tokenMinterAccount = findPda([Buffer.from("token_minter")], TOKEN_MESSENGER_MINTER);
  const localToken = findPda([Buffer.from("local_token"), usdcMint.toBuffer()], TOKEN_MESSENGER_MINTER);
  const remoteTokenMessengerKey = findPda(
    [Buffer.from("remote_token_messenger"), Buffer.from(p.destinationDomain.toString())],
    TOKEN_MESSENGER_MINTER
  );

  const eventAccountKeypair = Keypair.generate();

  // Borsh-encode params: u64 amount + u32 destination_domain + [u8;32] mint_recipient
  const domainBuf = Buffer.alloc(4);
  domainBuf.writeUInt32LE(p.destinationDomain);
  const data = Buffer.concat([
    DEPOSIT_FOR_BURN_DISC,
    bigintToLE8(p.amount),
    domainBuf,
    mintRecipientPubkey.toBuffer(),
  ]);

  const keys = [
    { pubkey: p.payer,                       isSigner: true,  isWritable: false }, // owner
    { pubkey: p.payer,                       isSigner: true,  isWritable: true  }, // event_rent_payer
    { pubkey: senderAuthorityPda,            isSigner: false, isWritable: false }, // sender_authority_pda
    { pubkey: burnTokenAccount,              isSigner: false, isWritable: true  }, // burn_token_account
    { pubkey: messageTransmitterAccount,     isSigner: false, isWritable: true  }, // message_transmitter
    { pubkey: tokenMessengerAccount,         isSigner: false, isWritable: false }, // token_messenger
    { pubkey: remoteTokenMessengerKey,       isSigner: false, isWritable: false }, // remote_token_messenger
    { pubkey: tokenMinterAccount,            isSigner: false, isWritable: false }, // token_minter
    { pubkey: localToken,                    isSigner: false, isWritable: true  }, // local_token
    { pubkey: usdcMint,                      isSigner: false, isWritable: true  }, // burn_token_mint
    { pubkey: eventAccountKeypair.publicKey, isSigner: true,  isWritable: true  }, // message_sent_event_data
    { pubkey: MESSAGE_TRANSMITTER,           isSigner: false, isWritable: false }, // message_transmitter_program
    { pubkey: TOKEN_MESSENGER_MINTER,        isSigner: false, isWritable: false }, // token_messenger_minter_program
    { pubkey: TOKEN_PROGRAM_ID,              isSigner: false, isWritable: false }, // token_program
    { pubkey: SystemProgram.programId,       isSigner: false, isWritable: false }, // system_program
    { pubkey: TM_EVENT_AUTHORITY,            isSigner: false, isWritable: false }, // event_authority (#[event_cpi])
    { pubkey: TOKEN_MESSENGER_MINTER,        isSigner: false, isWritable: false }, // program (#[event_cpi])
  ];

  const ix = new TransactionInstruction({ programId: TOKEN_MESSENGER_MINTER, keys, data });

  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash();
  const tx = new Transaction();
  tx.add(createIx);
  tx.add(ix);
  tx.feePayer = p.payer;
  tx.recentBlockhash = blockhash;
  tx.partialSign(eventAccountKeypair);

  return { tx, blockhash, lastValidBlockHeight };
}

// ── ReceiveMessage ────────────────────────────────────────────────────────────
//
// Account order (ReceiveMessageContext + #[event_cpi] + remaining_accounts):
//  0  payer                     Signer + mut
//  1  caller                    Signer
//  2  authority_pda             PDA seeds=["message_transmitter_authority", receiver_pubkey]
//  3  message_transmitter       mut
//  4  used_nonces               mut   PDA (init_if_needed)
//  5  receiver                  TOKEN_MESSENGER_MINTER (executable)
//  6  system_program            ← struct ends here
//  7  event_authority           #[event_cpi]: seeds=["__event_authority"] of MESSAGE_TRANSMITTER
//  8  program                   #[event_cpi]: MESSAGE_TRANSMITTER
// remaining_accounts (passed to handleReceiveMessage CPI):
//  9  token_messenger
// 10  remote_token_messenger
// 11  token_minter_account      mut
// 12  local_token               mut
// 13  token_pair
// 14  user_token_account        mut
// 15  custody_token_account     mut
// 16  spl_token_program
// 17  token_messenger_event_authority  seeds=["__event_authority"] of TOKEN_MESSENGER_MINTER
// 18  TOKEN_MESSENGER_MINTER

export interface ReceiveMessageParams {
  payer: PublicKey;
  message: string;         // hex
  attestation: string;     // hex
  remoteDomain: number;
  remoteUsdcHex: string;   // EVM USDC contract address (20-byte hex)
  to: string;              // Solana recipient WALLET address (or "" for payer) — used to derive/create ATA
  mainnet: boolean;
  connection: Connection;
}

// Outer CCTP message header = 4+4+4+8+32+32+32 = 116 bytes
// BurnMessage body: mintRecipient at offset 36 → full offset 152
const MINT_RECIPIENT_OFFSET = 152;

export function extractMintRecipient(messageHex: string): PublicKey {
  const bytes = Buffer.from(messageHex.replace("0x", ""), "hex");
  if (bytes.length < MINT_RECIPIENT_OFFSET + 32) throw new Error("Message too short");
  return new PublicKey(bytes.slice(MINT_RECIPIENT_OFFSET, MINT_RECIPIENT_OFFSET + 32));
}

export async function buildReceiveMessageTx(p: ReceiveMessageParams): Promise<TxWithBlockhash> {
  const usdcMint = p.mainnet ? SOLANA_USDC_MAINNET : SOLANA_USDC_DEVNET;

  // Extract the EXACT token account the CCTP program expects from the burn message
  const mintRecipient = extractMintRecipient(p.message);

  // Derive the ATA for the intended recipient wallet to create it if needed
  const toOwner = p.to ? new PublicKey(p.to) : p.payer;
  const { ata: expectedAta, createIx } = ensureAta(p.payer, usdcMint, toOwner);

  // Verify the mintRecipient in the message matches the ATA we'd create
  if (!mintRecipient.equals(expectedAta)) {
    throw new Error(
      `mintRecipient in message (${mintRecipient.toBase58()}) does not match expected ATA for recipient (${expectedAta.toBase58()}). ` +
      `The original deposit may have used a direct wallet address instead of the token account. ` +
      `This transaction cannot be claimed with this recipient address.`
    );
  }

  const userTokenAccount = mintRecipient;

  const messageBytes = Buffer.from(p.message.replace("0x", ""), "hex");
  const nonce = readBE64(messageBytes, 12);

  // used_nonces PDA: seeds = ["used_nonces", domain_str, delimiter, first_nonce_str]
  const firstNonce = computeFirstNonce(nonce);
  const usedNonces = findPda(
    [
      Buffer.from("used_nonces"),
      Buffer.from(p.remoteDomain.toString()),
      usedNoncesSeedDelimiter(p.remoteDomain),
      Buffer.from(firstNonce.toString()),
    ],
    MESSAGE_TRANSMITTER
  );

  // PDAs
  const messageTransmitterAccount = findPda([Buffer.from("message_transmitter")], MESSAGE_TRANSMITTER);
  const authorityPda = findPda(
    [Buffer.from("message_transmitter_authority"), TOKEN_MESSENGER_MINTER.toBuffer()],
    MESSAGE_TRANSMITTER
  );
  const tokenMessengerAccount = findPda([Buffer.from("token_messenger")], TOKEN_MESSENGER_MINTER);
  const tokenMinterAccount = findPda([Buffer.from("token_minter")], TOKEN_MESSENGER_MINTER);
  const localToken = findPda([Buffer.from("local_token"), usdcMint.toBuffer()], TOKEN_MESSENGER_MINTER);

  // remote USDC → 32-byte padded pubkey for token_pair PDA
  const remoteUsdcBytes = Buffer.from(p.remoteUsdcHex.replace("0x", ""), "hex");
  const remoteUsdcPadded = Buffer.alloc(32);
  remoteUsdcBytes.copy(remoteUsdcPadded, 32 - remoteUsdcBytes.length);

  const remoteDomainBytes = Buffer.from(p.remoteDomain.toString());
  const remoteTokenMessengerKey = findPda(
    [Buffer.from("remote_token_messenger"), remoteDomainBytes],
    TOKEN_MESSENGER_MINTER
  );
  const tokenPair = findPda(
    [Buffer.from("token_pair"), remoteDomainBytes, remoteUsdcPadded],
    TOKEN_MESSENGER_MINTER
  );
  const custodyTokenAccount = findPda(
    [Buffer.from("custody"), usdcMint.toBuffer()],
    TOKEN_MESSENGER_MINTER
  );

  // Borsh-encode params: Vec<u8> message + Vec<u8> attestation
  const attBytes = Buffer.from(p.attestation.replace("0x", ""), "hex");
  const msgLenBuf = Buffer.alloc(4); msgLenBuf.writeUInt32LE(messageBytes.length);
  const attLenBuf = Buffer.alloc(4); attLenBuf.writeUInt32LE(attBytes.length);
  const data = Buffer.concat([RECEIVE_MESSAGE_DISC, msgLenBuf, messageBytes, attLenBuf, attBytes]);

  const keys = [
    { pubkey: p.payer,                    isSigner: true,  isWritable: true  }, // payer
    { pubkey: p.payer,                    isSigner: true,  isWritable: false }, // caller
    { pubkey: authorityPda,               isSigner: false, isWritable: false }, // authority_pda
    { pubkey: messageTransmitterAccount,  isSigner: false, isWritable: true  }, // message_transmitter
    { pubkey: usedNonces,                 isSigner: false, isWritable: true  }, // used_nonces
    { pubkey: TOKEN_MESSENGER_MINTER,     isSigner: false, isWritable: false }, // receiver
    { pubkey: SystemProgram.programId,    isSigner: false, isWritable: false }, // system_program
    { pubkey: MT_EVENT_AUTHORITY,         isSigner: false, isWritable: false }, // event_authority (#[event_cpi])
    { pubkey: MESSAGE_TRANSMITTER,        isSigner: false, isWritable: false }, // program (#[event_cpi])
    // remaining_accounts → passed to handleReceiveMessage CPI
    { pubkey: tokenMessengerAccount,      isSigner: false, isWritable: false },
    { pubkey: remoteTokenMessengerKey,    isSigner: false, isWritable: false },
    { pubkey: tokenMinterAccount,         isSigner: false, isWritable: true  },
    { pubkey: localToken,                 isSigner: false, isWritable: true  },
    { pubkey: tokenPair,                  isSigner: false, isWritable: false },
    { pubkey: userTokenAccount,           isSigner: false, isWritable: true  },
    { pubkey: custodyTokenAccount,        isSigner: false, isWritable: true  },
    { pubkey: TOKEN_PROGRAM_ID,           isSigner: false, isWritable: false },
    { pubkey: TM_EVENT_AUTHORITY,         isSigner: false, isWritable: false }, // TM __event_authority
    { pubkey: TOKEN_MESSENGER_MINTER,     isSigner: false, isWritable: false },
  ];

  const ix = new TransactionInstruction({ programId: MESSAGE_TRANSMITTER, keys, data });

  const { blockhash, lastValidBlockHeight } = await p.connection.getLatestBlockhash();
  const tx = new Transaction();
  tx.add(createIx);
  tx.add(ix);
  tx.feePayer = p.payer;
  tx.recentBlockhash = blockhash;

  return { tx, blockhash, lastValidBlockHeight };
}

// ── IRIS attestation polling ───────────────────────────────────────────────────

export interface AttestationProgress {
  attempt: number;
  maxAttempts: number;
  phase: "polling" | "not_found" | "pending" | "error";
  retryInSeconds: number;
  detail?: string; // HTTP status + body snippet on error
}

export async function fetchAttestation(
  txHash: string,
  sourceDomain: number,
  mainnet: boolean,
  onProgress?: (p: AttestationProgress) => void,
  signal?: AbortSignal
): Promise<{ message: string; attestation: string } | null> {
  const base = mainnet
    ? "https://iris-api.circle.com"
    : "https://iris-api-sandbox.circle.com";

  const MAX = 60;
  const WAIT_MS = 15000;

  for (let i = 0; i < MAX; i++) {
    if (signal?.aborted) return null;
    onProgress?.({ attempt: i + 1, maxAttempts: MAX, phase: "polling", retryInSeconds: 0 });
    try {
      const res = await fetch(`${base}/messages/${sourceDomain}/${encodeURIComponent(txHash)}`, { signal });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const detail = `HTTP ${res.status}${body ? ": " + body.slice(0, 120) : ""}`;
        onProgress?.({ attempt: i + 1, maxAttempts: MAX, phase: "error", retryInSeconds: WAIT_MS / 1000, detail });
        await sleep(WAIT_MS); continue;
      }
      const data = await res.json();
      if (data.error?.toLowerCase().includes("not found")) {
        onProgress?.({ attempt: i + 1, maxAttempts: MAX, phase: "not_found", retryInSeconds: WAIT_MS / 1000 });
        await sleep(WAIT_MS); continue;
      }
      const msg = data.messages?.[0];
      if (msg?.attestation && msg.attestation !== "PENDING") {
        return { message: msg.message, attestation: msg.attestation };
      }
      onProgress?.({ attempt: i + 1, maxAttempts: MAX, phase: "pending", retryInSeconds: WAIT_MS / 1000 });
    } catch (err: unknown) {
      if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) return null;
      const detail = err instanceof Error ? err.message : String(err);
      onProgress?.({ attempt: i + 1, maxAttempts: MAX, phase: "error", retryInSeconds: WAIT_MS / 1000, detail });
    }
    if (signal?.aborted) return null;
    await sleep(WAIT_MS);
  }
  return null;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
