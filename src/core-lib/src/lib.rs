use dirs::config_dir;
use dotenv::from_filename;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
pub mod evm;
pub mod solana;

pub fn set_env_path(path: &str) -> anyhow::Result<()> {
    let env_path = Path::new(path);
    if !env_path.exists() {
        return Err(anyhow::anyhow!(
            "Provided .env file path does not exist: {}",
            path
        ));
    }
    if from_filename(env_path).is_err() {
        return Err(anyhow::anyhow!(
            "Provided path is not a .env file: {}",
            path
        ));
    }

    let config_file = config_dir()
        .unwrap_or_else(|| PathBuf::from(".config"))
        .join("meow/env_path");

    std::fs::create_dir_all(config_file.parent().unwrap())?;
    std::fs::write(config_file, path)?;
    println!("Saved .env path: {}", path);

    Ok(())
}

pub fn load_env() -> anyhow::Result<()> {
    let config_path = config_dir()
        .unwrap_or_else(|| PathBuf::from(".config"))
        .join("meow/env_path");

    // println!("Config file path: {:?}", config_path);

    if config_path.exists() {
        let real_env_path = fs::read_to_string(&config_path)?.trim().to_string();

        match dotenv::from_filename(&real_env_path) {
            Ok(_) => println!(".env loaded successfully from {}", real_env_path),
            Err(err) => eprintln!("Failed to load .env file from {}: {}", real_env_path, err),
        }
    } else {
        println!("No .env path configured. Expected at {:?}", config_path);
    }

    Ok(())
}
