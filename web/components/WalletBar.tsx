"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";

function shorten(addr: string) {
  return addr.slice(0, 4) + "…" + addr.slice(-4);
}

export function WalletBar() {
  const { setVisible } = useWalletModal();
  const { publicKey, disconnect } = useWallet();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ConnectButton
        label="Connect EVM"
        showBalance={false}
        chainStatus="icon"
        accountStatus="address"
      />
      {publicKey ? (
        <button
          onClick={() => disconnect()}
          className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
          {shorten(publicKey.toBase58())}
        </button>
      ) : (
        <button
          onClick={() => setVisible(true)}
          className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
        >
          Connect Solana
        </button>
      )}
    </div>
  );
}
