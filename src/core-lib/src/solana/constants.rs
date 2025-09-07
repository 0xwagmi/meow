#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DestinationDomain {
    Ethereum = 0,
    Avalanche = 1,
    Optimism = 2,
    Arbitrum = 3,
    // Noble = 4,
    // Solana = 5,
    Base = 6,
    PolygonPos = 7,
    // Sui = 8,
    // Aptos = 9,
    Unichain = 10,
}

impl DestinationDomain {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "ethereum" | "eth" => Some(Self::Ethereum),
            "avalanche" => Some(Self::Avalanche),
            "optimism" => Some(Self::Optimism),
            "arbitrum" | "arb" => Some(Self::Arbitrum),
            // "noble" => Some(Self::Noble),
            // "solana" => Some(Self::Solana),
            "base" => Some(Self::Base),
            "polygonpos" | "polygon" => Some(Self::PolygonPos),
            // "sui" => Some(Self::Sui),
            // "aptos" => Some(Self::Aptos),
            "unichain" => Some(Self::Unichain),
            _ => None,
        }
    }

    pub fn as_u32(&self) -> u32 {
        *self as u32
    }
}

pub fn env(var: &str) -> String {
    std::env::var(var).unwrap_or_else(|_| panic!(" {}    ERROR in env variable", var))
}
