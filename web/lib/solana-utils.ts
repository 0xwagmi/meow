import { type Connection, type Transaction } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Send a signed Solana transaction and confirm it.
 *
 * Handles the "already been processed" preflight error: this fires when a
 * previous attempt confirmed on-chain but confirmTransaction timed out, making
 * the UI show an error. On retry the same nonce/PDA is already used, so
 * simulation fails. We catch that case, extract the sig from the signed tx,
 * and proceed straight to confirmTransaction (which returns instantly).
 */
export async function sendAndConfirmSolana(
  connection: Connection,
  signed: Transaction,
  blockhash: string,
  lastValidBlockHeight: number
): Promise<string> {
  let sig: string;

  try {
    sig = await connection.sendRawTransaction(signed.serialize());
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("already been processed")
    ) {
      const sigBytes = signed.signatures[0]?.signature;
      if (!sigBytes) throw err;
      sig = bs58.encode(sigBytes);
    } else {
      throw err;
    }
  }

  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return sig;
}
