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
import type { Chain } from "viem";

export interface BridgeChain {
  id: string;
  name: string;
  domain: number;
  viemChain: Chain;
  viemChainTestnet: Chain;
  tokenMessenger: string;
  tokenMessengerTestnet: string;
  messageTransmitter: string;
  messageTransmitterTestnet: string;
  usdc: string;
  usdcTestnet: string;
}

// All addresses checksummed via getAddress() and verified against
// src/core-lib/src/evm/constants.rs (Circle CCTP official contracts)
export const BRIDGE_CHAINS: BridgeChain[] = [
  {
    id: "ethereum",
    name: "Ethereum",
    domain: 0,
    viemChain: mainnet,
    viemChainTestnet: sepolia,
    tokenMessenger:        "0xBd3fa81B58Ba92a82136038B25aDec7066af3155",
    tokenMessengerTestnet: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
    messageTransmitter:        "0x0a992d191DEeC32aFe36203Ad87D7d289a738F81",
    messageTransmitterTestnet: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc:        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    usdcTestnet: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  },
  {
    id: "avalanche",
    name: "Avalanche",
    domain: 1,
    viemChain: avalanche,
    viemChainTestnet: avalancheFuji,
    tokenMessenger:        "0x6B25532e1060CE10cc3B0A99e5683b91BFDe6982",
    tokenMessengerTestnet: "0xeb08f243E5d3FCFF26A9E38Ae5520A669f4019d0",
    messageTransmitter:        "0x8186359aF5F57FbB40c6b14A588d2A59C0C29880",
    messageTransmitterTestnet: "0xa9fB1b3009DCb79E2fe346c16a604B8Fa8aE0a79",
    usdc:        "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    usdcTestnet: "0x5425890298aed601595a70AB815c96711a31Bc65",
  },
  {
    id: "optimism",
    name: "Optimism",
    domain: 2,
    viemChain: optimism,
    viemChainTestnet: optimismSepolia,
    tokenMessenger:        "0x2B4069517957735bE00ceE0fadAE88a26365528f",
    tokenMessengerTestnet: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
    messageTransmitter:        "0x4D41f22c5a0e5c74090899E5a8Fb597a8842b3e8",
    messageTransmitterTestnet: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc:        "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    usdcTestnet: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    domain: 3,
    viemChain: arbitrum,
    viemChainTestnet: arbitrumSepolia,
    tokenMessenger:        "0x19330d10D9Cc8751218eaf51E8885D058642E08A",
    tokenMessengerTestnet: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
    messageTransmitter:        "0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca",
    messageTransmitterTestnet: "0xaCF1ceeF35caAc005e15888dDb8A3515C41B4872",
    usdc:        "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    usdcTestnet: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  },
  {
    id: "base",
    name: "Base",
    domain: 6,
    viemChain: base,
    viemChainTestnet: baseSepolia,
    tokenMessenger:        "0x1682Ae6375C4E4A97e4B583BC394c861A46D8962",
    tokenMessengerTestnet: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
    messageTransmitter:        "0xAD09780d193884d503182aD4588450C416D6F9D4",
    messageTransmitterTestnet: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc:        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdcTestnet: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  },
  {
    id: "polygonpos",
    name: "Polygon PoS",
    domain: 7,
    viemChain: polygon,
    viemChainTestnet: polygonAmoy,
    tokenMessenger:        "0x9daF8c91AEFAE50b9c0E69629D3F6Ca40cA3B3FE",
    tokenMessengerTestnet: "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5",
    messageTransmitter:        "0xF3be9355363857F3e001be68856A2f96b4C39Ba9",
    messageTransmitterTestnet: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
    usdc:        "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    usdcTestnet: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
  },
  {
    id: "unichain",
    name: "Unichain",
    domain: 10,
    viemChain: unichain,
    viemChainTestnet: unichainSepolia,
    tokenMessenger:        "0x4e744b28E787c3aD0e810eD65A24461D4ac5a762",
    tokenMessengerTestnet: "0x8ed94B8dAd2Dc5453862ea5e316A8e71AAed9782",
    messageTransmitter:        "0x353bE9E2E38AB1D19104534e4edC21c643Df86f4",
    messageTransmitterTestnet: "0xbc498c326533d675cf571B90A2Ced265ACb7d086",
    usdc:        "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
    usdcTestnet: "0x31d0220469e10c4E71834a79b1f276d740d3768F",
  },
];

export const SOLANA_DOMAIN = 5;

export function getChain(id: string): BridgeChain | undefined {
  return BRIDGE_CHAINS.find((c) => c.id === id);
}

export function getChainByDomain(domain: number): BridgeChain | undefined {
  return BRIDGE_CHAINS.find((c) => c.domain === domain);
}

export function getChainByViemId(chainId: number, mainnet: boolean): BridgeChain | undefined {
  return BRIDGE_CHAINS.find((c) =>
    mainnet ? c.viemChain.id === chainId : c.viemChainTestnet.id === chainId
  );
}
