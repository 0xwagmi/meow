"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { useSettings } from "@/lib/settings-context";

const SOLANA_MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

export function useSolanaNetworkGuard() {
  const { connection } = useConnection();
  const { settings } = useSettings();
  const [wrongNetwork, setWrongNetwork] = useState(false);

  useEffect(() => {
    let cancelled = false;
    connection.getGenesisHash().then((genesis) => {
      if (cancelled) return;
      const onMainnet = genesis === SOLANA_MAINNET_GENESIS;
      setWrongNetwork(settings.mainnet ? !onMainnet : onMainnet);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [connection, settings.mainnet]);

  return wrongNetwork;
}
