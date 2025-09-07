use super::evm_manager::EvmManager;
use crate::solana::svm_manager::{SOLANA_MANAGER, SolanaManager};
use dialoguer::Confirm;
use solana_sdk::bs58;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Signer;
use spl_associated_token_account::get_associated_token_address;
use std::str::FromStr;
use web3::Web3;
use web3::contract::Options;
use web3::ethabi::Token;
use web3::transports::Http;
use web3::types::{H160, TransactionParameters};
use web3::types::{H256, U64, U256};

pub async fn evm_deposit(
    from_domain: u32,
    mainnet: bool,
    amount: u64,
    evm_remote_rpc: &str,
    to: &str,
) -> web3::contract::Result<(H256, H160)> {
    let evm = EvmManager::init(from_domain, mainnet, evm_remote_rpc).unwrap();
    let manager: &SolanaManager = SOLANA_MANAGER.get().unwrap();
    let contract = evm.token_messenger_contract;
    let usdc_contract = evm.usdc_contract;
    let wallet = evm.wallet;
    let web3 = evm.web3;
    let wallet_address = evm.wallet_address;
    let nonce = web3.eth().transaction_count(wallet_address, None).await?;
    let gas_price = web3.eth().gas_price().await?;
    let gas_limit = U256::from(1_000_000);

    println!(" Using Deposit wallet Address: {:?}", wallet_address);

    let balance = web3.eth().balance(wallet_address, None).await?;
    println!("Account ETH balance: {}", balance);
    if balance == U256::zero() {
        panic!("Insufficient balance on deposit chain fee payer");
    }
    let usdc_balance: U256 = usdc_contract
        .query(
            "balanceOf",
            (wallet_address,),
            None,
            Options::default(),
            None,
        )
        .await?;

    println!("Account USDC balance: {}", usdc_balance);
    if usdc_balance == U256::zero() {
        panic!("Insufficient balance on deposit chain fee payer");
    }
    let usdc_allowance_check: U256 = usdc_contract
        .query(
            "allowance",
            (wallet_address, evm.token_messenger_contract_address),
            None,
            Options::default(),
            None,
        )
        .await?;
    print!(
        "Account USDC allowance check: {} without 6 decimal division",
        usdc_allowance_check
    );
    if usdc_allowance_check < U256::from(amount) {
        println!("No USDC allowance found for TokenMessenger contract.");
        let msg = format!(
            "USDC allowance amount {} is not set, do you want to approve x100 of it?",
            amount
        );
        let approve = Confirm::new()
            .with_prompt(msg)
            .default(true)
            .interact()
            .unwrap(); // You can also handle error properly if needed

        if approve {
            println!("Approving USDC allowance...");

            let spender = Token::Address(evm.token_messenger_contract_address);
            // let amount = Token::Uint(U256::from(2u64.pow(256) - 1));
            let amount = Token::Uint(U256::from(amount * 100));
            let data = usdc_contract
                .abi()
                .function("approve")?
                .encode_input(&[spender, amount])?;
            let tx_params = TransactionParameters {
                nonce: Some(nonce),
                to: Some(evm.usdc_contract_address),
                value: U256::zero(),
                gas_price: Some(gas_price),
                gas: gas_limit,
                data: web3::types::Bytes(data),
                ..Default::default()
            };

            let signed_tx = web3.accounts().sign_transaction(tx_params, &wallet).await?;

            let tx_hash: H256 = web3
                .eth()
                .send_raw_transaction(signed_tx.raw_transaction)
                .await?;

            println!("Approval transaction sent: {:?}", tx_hash);
            println!("Waiting for transaction confirmations: {:?}", tx_hash);
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
        } else {
            panic!("USDC approval rejected by user, plz approve manually");
        }
    }

    let destination_domain = Token::Uint(U256::from(5u32));
    let amount = Token::Uint(U256::from(amount));

    // let amount = Token::Uint(U256::from(1_000_000u64)); // 1 USDC with 6 decimals
    let usdc_address = if mainnet {
        Pubkey::from_str("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v").unwrap()
    } else {
        Pubkey::from_str("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU").unwrap()
    };
    let to_account: Pubkey = if !to.is_empty() {
        Pubkey::from_str(to).expect("Invalid solana address")
    } else {
        let default_pubkey = manager.payer.pubkey();
        println!("Using default destination account: {:?}", default_pubkey);
        default_pubkey
    };
    let associated_token_account =
        get_associated_token_address(&to_account, &usdc_address);
    let solana_address_to_hex =
        solana_address_to_hex(associated_token_account.to_string().as_str());
    // println!("Solana usdc token programme account to hex: {:?}", solana_address_to_hex);
    // different chains have different usdc addresses this should be handled in the evm manager dynamically but later
    // let usdc_token = Token::Address("0x31d0220469e10c4E71834a79b1f276d740d3768F".parse::<H160>().unwrap());

    let usdc_token = Token::Address(evm.usdc_contract_address);

    let data = contract.abi().function("depositForBurn")?.encode_input(&[
        amount,
        destination_domain,
        solana_address_to_hex,
        usdc_token,
    ])?;

    let tx_params = TransactionParameters {
        nonce: Some(nonce),
        to: Some(evm.token_messenger_contract_address),
        value: U256::zero(),
        gas_price: Some(gas_price),
        gas: gas_limit,
        data: web3::types::Bytes(data),
        ..Default::default()
    };

    let signed_tx = web3.accounts().sign_transaction(tx_params, &wallet).await?;

    let tx_hash: H256 = web3
        .eth()
        .send_raw_transaction(signed_tx.raw_transaction)
        .await?;

    println!("✅ Deposit chain txn sent: {:?}", tx_hash);

    match check_tx_success(&web3, tx_hash).await {
        Ok(_) => println!("Tx successful"),
        Err(e) => {
            eprintln!("Tx failed: {e}");
            std::process::exit(1);
        }
    }

    Ok((tx_hash, evm.usdc_contract_address))
}

pub fn solana_address_to_hex(solana_address: &str) -> Token {
    let decoded = bs58::decode(solana_address)
        .into_vec()
        .expect("Invalid base58 address");

    // Pad to 32 bytes (EVM expects bytes32)
    let mut padded = vec![0u8; 32];
    let start = 32 - decoded.len();
    padded[start..].copy_from_slice(&decoded);

    Token::FixedBytes(padded)
}

pub async fn check_tx_success(web3: &Web3<Http>, tx_hash: H256) -> Result<(), anyhow::Error> {
    let receipt = loop {
        match web3.eth().transaction_receipt(tx_hash).await? {
            Some(r) => break r,
            None => {
                println!("Waiting for tx to be confirmed...");
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    };

    match receipt.status {
        Some(status) if status == U64::from(1) => Ok(()),
        _ => Err(anyhow::anyhow!("Transaction failed or reverted")),
    }
}
