use clap::Parser;

#[derive(Parser, Debug)]
pub struct App {
    #[clap(flatten)]
    pub args: Args,

    #[clap(subcommand)]
    pub command: Command,
}

#[derive(Parser, Debug)]
#[command(
    name = "meow",
    version = "0.1.3",
    author = "oxwagmi",
    about = "A CLI tool for bridging USDC between Solana and EVM chains",
    long_about = "This tool allows you to bridge USDC between Solana and EVM chains, with options for manual redemption"
)]


pub struct Args {}

#[derive(Debug, Parser)]
pub enum Command {
    BridgeSolanaUSDC {
        #[arg(long, short, default_value = "false")]
        mainnet: bool,
        #[arg(long, default_value = "false")]
        safe_format_usdc: bool,
        #[arg(long)]
        to_chain: String,
        #[arg(long, default_value = "")]
        evm_remote_rpc: String,
        #[arg(long)]
        to: String,
        #[arg(long)]
        amount: u64,
    },
    BridgeEvmUSDC {
        #[arg(long, short, default_value = "false")]
        mainnet: bool,
        // #[arg(long, default_value = "false")]
        // safe_format_usdc: bool,
        #[arg(long)]
        from_chain: String,
        #[arg(long,default_value = "", long_help = "receiving address on solana chain, default to FEE_PAYER on .env")]
        to: String,
        #[arg(long, default_value = "",long_help = "specify a custom rpc url ,defaults to respective rpcs on constants")]
        evm_remote_rpc: String,
        #[arg(long)]
        amount: u64,
        #[arg(long, default_value = "10")]
        retry_secs: u64,
    },
    MannualRedeemUsdc {
        #[arg(long, short, default_value = "false")]
        mainnet: bool,
        #[arg(long)]
        txn_hash: String,
        #[arg(long, default_value = "")]
        to: String,
        #[arg(long)]
        remote_domain: u32,
        #[arg(long, default_value = "")]
        remote_usdc: String,
        #[arg(long, default_value = "")]
        evm_remote_rpc: String,
        #[arg(long, default_value = "10")]
        retry_secs: u64,
    },
    SetEnv {
        #[arg(long, short, default_value = "")]
        path: String,
    },
}
