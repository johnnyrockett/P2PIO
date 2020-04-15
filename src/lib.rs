use wasm_bindgen::prelude::*;

use std::panic;

use log::info;

#[wasm_bindgen]
pub fn init() -> Result<(), JsValue> {
    panic::set_hook(Box::new(console_error_panic_hook::hook));

    console_log::init_with_level(log::Level::Debug)
        .map_err(|_e| JsValue::from_str("Set Logger Error"))?;

    info!("init finished");
    Ok(())
}

pub use rustdag_wasm::blockdag::BlockDAG;
