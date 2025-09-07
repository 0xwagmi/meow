use web3::ethabi::Token;
use web3::types::TransactionParameters;
use web3::types::{H256, U256};

use super::evm_manager::EvmManager;

pub async fn evm_claim(
    message_st: &str,
    attestation: &str,
    domain: u32,
    mainnet: bool,
    evm_rpc_url: &str,
) -> web3::contract::Result<H256> {
    let evm = EvmManager::init(domain, mainnet, evm_rpc_url).unwrap();
    let web3 = evm.web3;
    let wallet_address = evm.wallet_address;
    println!(" Using Wallet Address: {:?}", wallet_address);

    let balance = web3.eth().balance(wallet_address, None).await?;
    println!("Account balance: {}", balance);
    if balance == U256::zero() {
        panic!("Insufficient balance on destination  chain fee payer");
    }

    let contract = evm.message_transmitter_contract;
    let message: Vec<u8> =
        hex::decode(message_st.trim_start_matches("0x")).expect("Invalid hex string");

    let attestation: Vec<u8> =
        hex::decode(attestation.trim_start_matches("0x")).expect("Invalid attestation hex string");

    let nonce = web3.eth().transaction_count(wallet_address, None).await?;
    let gas_price = web3.eth().gas_price().await?;
    let gas_limit = U256::from(1_000_000);

    let data = contract
        .abi()
        .function("receiveMessage")?
        .encode_input(&[Token::Bytes(message), Token::Bytes(attestation)])?;

    let tx_params = TransactionParameters {
        nonce: Some(nonce),
        to: Some(evm.message_transmitter_contract_address),
        value: U256::zero(),
        gas_price: Some(gas_price),
        gas: gas_limit,
        data: web3::types::Bytes(data),
        ..Default::default()
    };

    let wallet = evm.wallet;

    let signed_tx = web3.accounts().sign_transaction(tx_params, &wallet).await?;

    let tx_hash: H256 = web3
        .eth()
        .send_raw_transaction(signed_tx.raw_transaction)
        .await?;

    println!("✅ Destination chain txn sent: {:?}", tx_hash);

    Ok(tx_hash)
}

pub async fn evm_balance_check(domain: u32, mainnet: bool, evm_rpc_url: &str) {
    let evm_manager = EvmManager::init(domain, mainnet, evm_rpc_url).unwrap();
    let wallet_address = evm_manager.wallet_address;
    let web3 = evm_manager.web3;
    let balance = web3.eth().balance(wallet_address, None).await.unwrap();
    println!("Evm fee payer balance: {} in WEI ", balance);
    // if balance is 1 wei still not enough to pay for gas
    // if balance == U256::zero() {
    if balance < U256::from(1_000_000_000) {
        // 1 Gwei
        panic!("Insufficient balance on destination  chain fee payer");
    }
}
