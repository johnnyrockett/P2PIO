use js_sys::Promise;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

use rustdag_lib::dag::contract::ContractValue;
use rustdag_lib::security::keys::eddsa::{get_address, get_public_key, new_key_pair, EdDSAKeyPair};

use rustdag_wasm::blockdag::BlockDAG;

use std::{panic, rc::Rc};

use log::info;

#[wasm_bindgen]
pub fn init() -> Result<(), JsValue> {
    panic::set_hook(Box::new(console_error_panic_hook::hook));

    console_log::init_with_level(log::Level::Debug)
        .map_err(|_e| JsValue::from_str("Set Logger Error"))?;

    info!("init finished");
    Ok(())
}

#[wasm_bindgen]
pub struct Context {
    blockdag: BlockDAG,
    keypair: Rc<EdDSAKeyPair>,
    contract_address: u64,
}

#[wasm_bindgen]
impl Context {
    #[wasm_bindgen(constructor)]
    pub fn new(url: String, contract_address: String) -> Self {
        Context {
            blockdag: BlockDAG::new(url),
            keypair: Rc::from(new_key_pair()),
            contract_address: contract_address.parse().expect("Failed to parse contract address."),
        }
    }

    pub fn tips_sync(&self) -> Promise {
        let blockdag = self.blockdag.clone();
        future_to_promise(async move {
            BlockDAG::tips_sync(blockdag).await?;
            Ok(0.into())
        })
    }

    pub fn get_address(&self) -> String {
        get_address(&get_public_key(&self.keypair)).to_string()
    }

    pub fn spawn_player(&self, x: i32, y: i32) -> Promise {
        let inner = self.blockdag.clone_inner();
        let keypair = self.keypair.clone();
        let contract_address = self.contract_address;

        //Convert our signed numbers centered around (0, 0) to unsigned u64 centered around (u32::MAX, u32::MAX)
        let x = (i64::from(x) + i64::from(u32::MAX)) as u64;
        let y = (i64::from(y) + i64::from(u32::MAX)) as u64;

        future_to_promise(async move {
            inner
                .borrow_mut()
                .execute_contract(
                    &keypair,
                    contract_address,
                    "spawn_player",
                    &[ContractValue::U64(x), ContractValue::U64(y)],
                )
                .await?;
            Ok(1.into())
        })
    }

    pub fn get_player(&self, id: String) -> Promise {
        let id = id.parse().expect("Failed to parse id.");
        let inner = self.blockdag.clone_inner();
        let keypair = self.keypair.clone();
        let contract_address = self.contract_address;

        future_to_promise(async move {
            let x = inner
                .borrow_mut()
                .execute_contract(
                    &keypair,
                    contract_address,
                    "get_player_x",
                    &[ContractValue::U64(id)],
                )
                .await?
                .expect("Should return a value");

            let y = inner
                .borrow_mut()
                .execute_contract(
                    &keypair,
                    contract_address,
                    "get_player_y",
                    &[ContractValue::U64(id)],
                )
                .await?
                .expect("Should return a value");

            let heading = inner
                .borrow_mut()
                .execute_contract(
                    &keypair,
                    contract_address,
                    "get_player_heading",
                    &[ContractValue::U64(id)],
                )
                .await?
                .expect("Should return a value");

            Ok(PlayerData::new(x, y, heading).into())
        })
    }

    pub fn apply_input(&self, heading: u32) -> Promise {
        let inner = self.blockdag.clone_inner();
        let keypair = self.keypair.clone();
        let contract_address = self.contract_address;

        future_to_promise(async move {
            inner
                .borrow_mut()
                .execute_contract(
                    &keypair,
                    contract_address,
                    "apply_input",
                    &[ContractValue::U64(heading.into())],
                )
                .await?;
            Ok(1.into())
        })
    }
}
#[wasm_bindgen]
#[allow(dead_code)]
pub struct PlayerData {
    x: i32,
    y: i32,
    heading: u32,
}

impl PlayerData {
    pub fn new(x: ContractValue, y: ContractValue, heading: ContractValue) -> Self {
        match (x, y, heading) {
            (ContractValue::U64(x), ContractValue::U64(y), ContractValue::U64(heading)) => {
                //Convert our unsigned u64 centered around (u32::MAX, u32::MAX) to signed numbers centered around (0, 0)
                let x = (i128::from(x) - i128::from(u32::MAX)) as i32;
                let y = (i128::from(y) - i128::from(u32::MAX)) as i32;

                PlayerData { x, y, heading: heading as u32 }
            }
            _ => panic!("Unexpected return types from contract."),
        }
    }
}


#[wasm_bindgen]
impl PlayerData {

    pub fn x(&self) -> JsValue {
        self.x.into()
    }

    pub fn y(&self) -> JsValue {
        self.y.into()
    }

    pub fn heading(&self) -> JsValue {
        self.heading.into()
    }
}
