use anchor_client::solana_sdk::pubkey::Pubkey;
use anchor_client::{Client, Cluster, solana_client};
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::signature::Keypair;
// use solana_sdk::signature::Signature;
use super::constants::env;
use anyhow::Result;
use anyhow::anyhow;
use once_cell::sync::OnceCell;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{signature::read_keypair_file, signer::Signer};
use std::sync::Arc;

pub static SOLANA_MANAGER: OnceCell<SolanaManager> = OnceCell::new();

pub struct SolanaManager {
    pub payer: Arc<Keypair>,
    pub client: Client<Arc<Keypair>>,
    pub rpc_client: RpcClient,
}

impl SolanaManager {
    pub fn init(mainnet: bool) -> Result<Self> {
        let url = if mainnet {
            Cluster::Mainnet
        } else {
            Cluster::Devnet
        };

        let payer: Keypair = read_keypair_file(env("KEYPAIR_PATH")).expect("error wallet");

        let payer = Arc::new(payer);
        let client =
            Client::new_with_options(url.clone(), payer.clone(), CommitmentConfig::processed());
        let rpc_client = RpcClient::new(url.url().to_string());
        Ok(Self {
            payer,
            client,
            rpc_client,
        })
    }

    // Getter methods
    pub fn payer(&self) -> &Arc<Keypair> {
        &self.payer
    }
    pub fn payer_pubkey(&self) -> Pubkey {
        self.payer.pubkey()
    }

    pub fn client(&self) -> &Client<Arc<Keypair>> {
        &self.client
    }
    pub async fn balance(&self) -> Result<u64> {
        self.rpc_client
            .get_balance(&self.payer_pubkey())
            .map_err(|e| anyhow!("Balance check failed: {}", e))
    }
    pub async fn check_balance(&self, min_balance: u64) -> Result<()> {
        let balance = self.balance().await?;
        if balance > min_balance {
            print!("SOLANA BALANCE:{} in lamports ", balance);
            Ok(())
        } else {
            return Err(anyhow!(
                "Insufficient balance: {} SOL (min required: {})",
                (balance as f64) / 1e9,
                (min_balance as f64) / 1e9
            ));
        }
    }
}

pub fn init_solana_manager(mainnet: bool) -> Result<()> {
    let manager = SolanaManager::init(mainnet)?;
    SOLANA_MANAGER
        .set(manager)
        .map_err(|_| anyhow!("SolanaManager already initialized"))
}
