"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi-config";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { useMemo, useEffect } from "react";
import { SettingsProvider, useSettings } from "@/lib/settings-context";
import { activeSolanaRpc } from "@/lib/settings";

import "@rainbow-me/rainbowkit/styles.css";
import "@solana/wallet-adapter-react-ui/styles.css";

const queryClient = new QueryClient();

// Inner component — can safely call useSettings() because SettingsProvider is above it.
function WagmiInner({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  const rpc = activeSolanaRpc(settings);

  useEffect(() => {
    if (!settings.mainnet) return;
    if (rpc.toLowerCase().includes("devnet") || rpc.toLowerCase().includes("testnet")) {
      console.error(
        "[meow] DANGER: mainnet=true but Solana RPC looks like devnet/testnet. " +
          "Update the Solana RPC in Settings."
      );
    }
  }, [settings.mainnet, rpc]);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#3b82f6",
            accentColorForeground: "white",
            borderRadius: "large",
          })}
        >
          <ConnectionProvider endpoint={rpc}>
            <WalletProvider wallets={wallets} autoConnect>
              <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
          </ConnectionProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <WagmiInner>{children}</WagmiInner>
    </SettingsProvider>
  );
}
