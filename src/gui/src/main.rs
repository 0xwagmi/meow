use iced::widget::{button, column, text, Column};
use iced::{Result, Task};
use core_lib::solana::svm_manager::{SOLANA_MANAGER, SolanaManager, init_solana_manager};

#[derive(Default)]
struct WalletApp {
    address: Option<String>,
    balance: Option<u64>,
}

#[derive(Debug, Clone)]
pub enum Message {
    FetchData,
    AddressFetched { payer: String, balance: u64 },
 
}

impl WalletApp {
    pub fn view(&self) -> Column<Message> {
        let mut col = column![
            text("Cctp stables ui").size(30),
            button("Get Solana Wallet").on_press(Message::FetchData),
        ]
        .spacing(20);

    if let (Some(balance), Some(address)) = (self.balance, &self.address) {
        col = col.push(text(format!("Address: {}", address)));
        col = col.push(text(format!("Balance: {} SOL", balance as f64 / 1_000_000_000.0)));
    }
        col
    }

    pub fn update(&mut self, message: Message) -> Task<Message> {
        match message {
            Message::FetchData => Task::future(async {
                match fetch_solana_data().await {
                    Ok((payer, balance)) => Message::AddressFetched { payer, balance },
                    Err(_) => Message::AddressFetched { payer: String::from("Error"), balance: 0 },
                }
            }),
            Message::AddressFetched { payer, balance } => {
                self.address = Some(payer);
                self.balance = Some(balance);
                Task::none()
            }
        }
    }
}

async fn fetch_solana_data() -> std::result::Result<(String, u64), Box<dyn std::error::Error + Send + Sync>> {
        init_solana_manager(true).unwrap();
    let manager: &SolanaManager = SOLANA_MANAGER.get().ok_or("Solana manager not initialized")?;
    
    let payer = manager.payer_pubkey().to_string();
    let balance = manager.balance().await?;

    Ok((payer, balance))
}

#[tokio::main]
async fn main() -> Result {
        dotenv::dotenv().ok();
        iced::application("Bridge Wallet", WalletApp::update, WalletApp::view).run()
}
// fn theme(state: &State) -> Theme {
//     Theme::TokyoNight
// }