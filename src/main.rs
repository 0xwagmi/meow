use anyhow::anyhow;
use clap::Parser;
use core_lib::evm::claim::evm_balance_check;
use core_lib::evm::claim::evm_claim;
use core_lib::evm::deposit_for_burn::evm_deposit;
use core_lib::load_env;
use core_lib::solana::constants::DestinationDomain;
use core_lib::solana::irismsg::TxHash;
use core_lib::solana::irismsg::get_messages;
use core_lib::solana::programs::call_recieve_message;
use core_lib::solana::svm_manager::{SOLANA_MANAGER, SolanaManager, init_solana_manager};
use solana_sdk::signature::Signature;
use web3::types::H256;
pub mod app;
use app::{App, Command};
// use web3::types::H256;
// #[tokio::main(flavor = "multi_thread")]
#[tokio::main]
async fn main() {
    // match dotenv::from_filename(".env") {
    //     Ok(_) => println!(".env file loaded successfully"),
    //     Err(err) => eprintln!("Failed to load .env file: {}", err),
    // }
    load_env().unwrap();

    let app = App::parse();

    match app.command {
        Command::BridgeSolanaUSDC {
            mainnet,
            safe_format_usdc,
            amount,
            to_chain,
            evm_remote_rpc,
            to,
        } => {
            let domain = DestinationDomain::from_str(&to_chain)
                .ok_or_else(|| anyhow!("Invalid chain: {}", to_chain))
                .unwrap();

            let fixed_domain = domain.as_u32();

            init_solana_manager(mainnet).unwrap();
            println!("CHECKING BALANCES OF BOTH SIDES BEFORE SENDING....");
            evm_balance_check(fixed_domain, mainnet, evm_remote_rpc.as_str()).await;
            let manager: &SolanaManager = SOLANA_MANAGER.get().unwrap();
            let _ = manager.check_balance(1000).await.unwrap();

            let deposit_for_burn_sig = core_lib::solana::programs::call_deposit_for_burn(
                fixed_domain,
                &to,
                amount,
                mainnet,
                safe_format_usdc,
            )
            .await
            .unwrap();
            let deposit_for_burn_sig = TxHash::Solana(deposit_for_burn_sig);
            let attestation_data = get_messages(&deposit_for_burn_sig, mainnet, 5, 10)
                .await
                .unwrap();
            evm_claim(
                &attestation_data.message,
                &attestation_data.attestation,
                fixed_domain,
                mainnet,
                evm_remote_rpc.as_str(),
            )
            .await
            .unwrap();
        }
        Command::BridgeEvmUSDC {
            mainnet,
            // safe_format_usdc,
            amount,
            from_chain,
            evm_remote_rpc,
            to,
            retry_secs,
        } => {
            println!("Bridging from EVM to Solana..");
            init_solana_manager(mainnet).unwrap();
            let domain = DestinationDomain::from_str(&from_chain)
                .ok_or_else(|| anyhow!("Invalid chain: {}", from_chain))
                .unwrap();

            let fixed_domain = domain.as_u32();
            println!("CHECKING BALANCES OF BOTH SIDES BEFORE SENDING....");
            evm_balance_check(fixed_domain, mainnet, evm_remote_rpc.as_str()).await;
            let manager: &SolanaManager = SOLANA_MANAGER.get().unwrap();
            let _ = manager.check_balance(1000).await.unwrap();
            //////////////////////////////////////////////////////////////////

            let (sig, remote_usdc) =
                match evm_deposit(fixed_domain, mainnet, amount, evm_remote_rpc.as_str(),to.as_str()).await {
                    Ok(res) => res,
                    Err(e) => {
                        eprintln!("EVM Deposit failed: {:#?}", e);
                        std::process::exit(1);
                    }
                };
            let tx_hash = TxHash::Ethereum(sig);
            println!("Attempting to get attestation_data for tx: {:?}", sig);
            let attestation_data = get_messages(&tx_hash, mainnet, fixed_domain, retry_secs)
                .await
                .unwrap();
            println!("Attestation data: {:?}", attestation_data);
            call_recieve_message(
                remote_usdc.to_string().as_str(),
                &attestation_data.message,
                &attestation_data.attestation,
                fixed_domain,
                mainnet,
                &to
            )
            .await
            .unwrap();
        }

        Command::MannualRedeemUsdc {
            mainnet,
            txn_hash,
            remote_domain,
            remote_usdc,
            evm_remote_rpc,
            retry_secs,
            to
        } => {
            println!("Starting manual redeem USDC");
            init_solana_manager(mainnet).unwrap();
            let tx_hash = if is_solana_tx(&txn_hash) {
                println!("Detected as a Solana transaction hash");
                TxHash::Solana(
                    txn_hash
                        .parse::<Signature>()
                        .expect("Invalid Solana Signature"),
                )
            } else {
                println!("Detected as a EVM transaction hash");
                TxHash::Ethereum(txn_hash.parse::<H256>().expect(" Invalid Ethereum tx hash"))
            };

            println!("⏳ Fetching attestation data for {:?}", tx_hash);
            let attestation_data = get_messages(&tx_hash, mainnet, remote_domain, retry_secs)
                .await
                .expect(" Failed to fetch attestation data");
            println!("Attestation data received!");

            match tx_hash {
                TxHash::Solana(_) => {
                    println!("claiming on eth from solana usdc deposits...");
                    evm_claim(
                        &attestation_data.message,
                        &attestation_data.attestation,
                        remote_domain,
                        mainnet,
                        evm_remote_rpc.as_str(),
                    )
                    .await
                    .expect("Failed to claim on EVM");
                }

                TxHash::Ethereum(_) => {
                    println!("claiming on  Solana  EVM usdc deposit...");
                    if remote_usdc.is_empty() {
                        panic!(
                            " Remote USDC address from evm chains is required to claim usdc on solana chain  "
                        );
                    }
                    println!("remote_usdc: {:?}", remote_usdc);
                    call_recieve_message(
                        &remote_usdc.to_string().as_str(),
                        &attestation_data.message,
                        &attestation_data.attestation,
                        remote_domain,
                        mainnet,
                        &to
                    )
                    .await
                    .expect(" Failed to call receiveMessage on Solana");
                }
            }

            println!("USDC manually redeemed successfully!");
        }
        Command::SetEnv { path } => {
            if let Err(e) = core_lib::set_env_path(path.as_str()) {
                eprintln!("Error setting env path: {}", e);
            }
        }
    }
}
fn is_solana_tx(tx: &str) -> bool {
    !tx.starts_with("0x") && tx.len() >= 43 && tx.len() <= 88
}
