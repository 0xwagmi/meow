import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  mainnet,
  base,
  arbitrum,
  optimism,
  avalanche,
  polygon,
  unichain,
  unichainSepolia,
  sepolia,
  baseSepolia,
  arbitrumSepolia,
  optimismSepolia,
  avalancheFuji,
  polygonAmoy,
} from "viem/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "meow bridge",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "meow-bridge",
  chains: [
    mainnet,
    base,
    arbitrum,
    optimism,
    avalanche,
    polygon,
    unichain,
    unichainSepolia,
    sepolia,
    baseSepolia,
    arbitrumSepolia,
    optimismSepolia,
    avalancheFuji,
    polygonAmoy,
  ],
  ssr: true,
});
