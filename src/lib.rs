use js_sys::Promise;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

use rustdag_lib::dag::contract::ContractValue;
use rustdag_lib::dag::transaction::data::TransactionData;
use rustdag_lib::security::keys::eddsa::{get_address, get_public_key, new_key_pair, EdDSAKeyPair};

use rustdag_wasm::blockdag::BlockDAG;

use std::{
    cell::{Ref, RefCell},
    panic,
    rc::Rc,
    sync::Mutex,
};

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
    keypair: Rc<RefCell<Option<EdDSAKeyPair>>>,
    event_queue: Rc<Mutex<Vec<Event>>>,
    contract_address: u64,
}

fn get_keypair(rc: &Rc<RefCell<Option<EdDSAKeyPair>>>) -> Ref<'_, EdDSAKeyPair> {
    Ref::map(rc.borrow(), |opt| {
        opt.as_ref()
            .expect("Failed to call spawn_player before applying input.")
    })
}

#[wasm_bindgen]
impl Context {
    #[wasm_bindgen(constructor)]
    pub fn new(url: String, contract_address: String) -> Self {
        Context {
            blockdag: BlockDAG::new(url),
            keypair: Rc::from(RefCell::from(None)),
            event_queue: Rc::from(Mutex::from(Vec::new())),
            contract_address: contract_address
                .parse()
                .expect("Failed to parse contract address."),
        }
    }

    pub fn tips_sync(&self) -> Promise {
        let blockdag = self.blockdag.clone();
        let contract_address = self.contract_address;
        let event_queue = self.event_queue.clone();
        future_to_promise(async move {
            BlockDAG::tips_sync(blockdag, move |trans| match trans.get_data() {
                TransactionData::ExecContract {
                    func_name,
                    args,
                    contract,
                } if *contract == contract_address => {
                    let event = match &func_name[..] {
                        "spawn_player" => match &args[..] {
                            [x, y] => Some(Event::spawn(
                                trans.get_address().to_string(),
                                contract_val_to_i32(*x),
                                contract_val_to_i32(*y),
                            )),
                            _ => panic!(
                                "Unexpected number of arguments. Got {}, expected 2",
                                args.len()
                            ),
                        },
                        "apply_input" => match &args[..] {
                            [heading] => Some(Event::input(
                                trans.get_address().to_string(),
                                unwrap_contract_u64(*heading) as u32,
                            )),
                            _ => panic!(
                                "Unexpected number of arguments. Got {}, expected 2",
                                args.len()
                            ),
                        },
                        _ => None,
                    };
                    if let Some(e) = event {
                        event_queue.lock().unwrap().push(e);
                    }
                }
                _ => (),
            })
            .await?;
            Ok(0.into())
        })
    }

    pub fn get_address(&self) -> String {
        get_address(&get_public_key(&*get_keypair(&self.keypair))).to_string()
    }

    pub fn spawn_player(&self, x: i32, y: i32) -> Promise {
        let inner = self.blockdag.clone_inner();
        self.keypair.borrow_mut().replace(new_key_pair()); // create new keypair
        let keypair = self.keypair.clone();
        let contract_address = self.contract_address;

        future_to_promise(async move {
            inner
                .borrow_mut()
                .execute_contract(
                    &*get_keypair(&keypair),
                    contract_address,
                    "spawn_player",
                    &[i32_to_contract_val(x), i32_to_contract_val(y)],
                )
                .await?;
            Ok(1.into())
        })
    }

    pub fn get_player(&self, id: String) -> Promise {
        let id_num = id.parse().expect("Failed to parse id.");
        let inner = self.blockdag.clone_inner();
        let keypair = self.keypair.clone();
        let contract_address = self.contract_address;

        future_to_promise(async move {
            let x = inner
                .borrow_mut()
                .execute_contract(
                    &*get_keypair(&keypair),
                    contract_address,
                    "get_player_x",
                    &[ContractValue::U64(id_num)],
                )
                .await?
                .expect("Should return a value");

            let y = inner
                .borrow_mut()
                .execute_contract(
                    &*get_keypair(&keypair),
                    contract_address,
                    "get_player_y",
                    &[ContractValue::U64(id_num)],
                )
                .await?
                .expect("Should return a value");

            let heading = inner
                .borrow_mut()
                .execute_contract(
                    &*get_keypair(&keypair),
                    contract_address,
                    "get_player_heading",
                    &[ContractValue::U64(id_num)],
                )
                .await?
                .expect("Should return a value");

            Ok(PlayerData::from_contract(x, y, heading).into())
        })
    }

    pub fn apply_input(&self, heading: u32) -> Promise {
        let inner = self.blockdag.clone_inner();
        let keypair = self.keypair.clone();
        let contract_address = self.contract_address;

        self.event_queue.lock().unwrap().push(Event::input(self.get_address(), heading));

        future_to_promise(async move {
            inner
                .borrow_mut()
                .execute_contract(
                    &*get_keypair(&keypair),
                    contract_address,
                    "apply_input",
                    &[ContractValue::U64(heading.into())],
                )
                .await?;
            Ok(1.into())
        })
    }

    pub fn take_events(&self) -> JsValue {
        self.event_queue
            .lock()
            .unwrap()
            .drain(..)
            .map(|e| JsValue::from(e))
            .collect::<js_sys::Array>()
            .into()
    }
}

#[wasm_bindgen]
pub struct PlayerData {
    x: i32,
    y: i32,
    heading: u32,
}

impl PlayerData {
    pub fn from_contract(x: ContractValue, y: ContractValue, heading: ContractValue) -> Self {
        let x = contract_val_to_i32(x);
        let y = contract_val_to_i32(y);
        let heading = unwrap_contract_u64(heading);

        PlayerData {
            x,
            y,
            heading: heading as u32,
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

#[wasm_bindgen]
#[derive(PartialEq, Debug)]
pub struct Event {
    id: String,
    x: i32,
    y: i32,
    heading: u32,
    kind: EventKind,
}

#[wasm_bindgen]
#[derive(PartialEq, Debug)]
pub enum EventKind {
    Spawn,
    Input,
}

#[wasm_bindgen]
impl Event {
    pub fn spawn(id: String, x: i32, y: i32) -> Self {
        Event {
            id,
            x,
            y,
            heading: 0,
            kind: EventKind::Spawn,
        }
    }

    pub fn input(id: String, heading: u32) -> Self {
        Event {
            id,
            x: 0,
            y: 0,
            heading,
            kind: EventKind::Input,
        }
    }

    pub fn is_spawn(&self) -> bool {
        self.kind == EventKind::Spawn
    }

    pub fn is_input(&self) -> bool {
        self.kind == EventKind::Input
    }

    pub fn get_input_heading(&self) -> JsValue {
        if self.is_input() {
            self.heading.into()
        } else {
            JsValue::UNDEFINED
        }
    }

    pub fn get_spawn_x(&self) -> JsValue {
        if self.is_spawn() {
            self.x.into()
        } else {
            JsValue::UNDEFINED
        }
    }

    pub fn get_spawn_y(&self) -> JsValue {
        if self.is_spawn() {
            self.y.into()
        } else {
            JsValue::UNDEFINED
        }
    }
}

// UTIL

fn unwrap_contract_u64(cv: ContractValue) -> u64 {
    if let ContractValue::U64(x) = cv {
        x
    } else {
        panic!(
            "Unexpected return types from contract. Expected U64, got: {:?}",
            cv
        )
    }
}
fn contract_val_to_i32(cv: ContractValue) -> i32 {
    (i128::from(unwrap_contract_u64(cv)) - i128::from(u32::MAX)) as i32
}

//Convert our signed numbers centered around (0, 0) to unsigned u64 centered around (u32::MAX, u32::MAX)
fn i32_to_contract_val(x: i32) -> ContractValue {
    ContractValue::U64((i64::from(x) + i64::from(u32::MAX)) as u64)
}
