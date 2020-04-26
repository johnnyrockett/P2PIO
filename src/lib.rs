// use futures::lock::Mutex;
use js_sys::Promise;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::future_to_promise;

use rustdag_lib::dag::contract::ContractValue;
use rustdag_lib::dag::transaction::data::TransactionData;
use rustdag_lib::security::keys::eddsa::{get_address, get_public_key, new_key_pair, EdDSAKeyPair};

use rustdag_wasm::blockdag::BlockDAG;

use std::sync::mpsc::{channel, Receiver, Sender};

use std::{panic, rc::Rc, sync::RwLock};

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
    keypair: Rc<RwLock<Option<EdDSAKeyPair>>>,
    event_sender: Sender<Event>,
    event_receiver: Receiver<Event>,
    contract_address: u64,
}

#[wasm_bindgen]
impl Context {
    #[wasm_bindgen(constructor)]
    pub fn new(url: String, contract_address: String) -> Self {
        let (send, recv) = channel();
        Context {
            blockdag: BlockDAG::new(url),
            keypair: Rc::from(RwLock::from(None)),
            event_sender: send,
            event_receiver: recv,
            contract_address: contract_address
                .parse()
                .expect("Failed to parse contract address."),
        }
    }

    pub fn tips_sync(&self) -> Promise {
        let blockdag = self.blockdag.clone();
        let contract_address = self.contract_address;
        let sender = self.event_sender.clone();

        future_to_promise(async move {
            BlockDAG::tips_sync(blockdag.clone(), move |trans| match trans.get_data() {
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
                                trans.get_timestamp(),
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
                                trans.get_timestamp(),
                            )),
                            _ => panic!(
                                "Unexpected number of arguments. Got {}, expected 2",
                                args.len()
                            ),
                        },
                        _ => None,
                    };
                    if let Some(e) = event {
                        sender.send(e).expect("Failed to send in the event mpsc");
                    }
                }
                _ => (),
            })
            .await?;

            Ok(0.into())
        })
    }

    pub fn get_address(&self) -> String {
        get_address(&get_public_key(
            self.keypair
                .read()
                .expect("Failed to acquire lock")
                .as_ref()
                .expect("Failed to call spawn_player before applying input."),
        ))
        .to_string()
    }

    pub fn spawn_player(&self, x: i32, y: i32) -> Promise {
        let inner = self.blockdag.clone_inner();
        self.keypair
            .write()
            .expect("Failed to acquire lock.")
            .replace(new_key_pair()); // create new keypair
        let keypair = self.keypair.clone();
        let contract_address = self.contract_address;
        let event_sender = self.event_sender.clone();

        future_to_promise(async move {
            let (_, trans) = inner
                .lock()
                .await
                .execute_contract(
                    keypair
                        .read()
                        .expect("Failed to acquire lock")
                        .as_ref()
                        .expect("Failed to call spawn_player before applying input."),
                    contract_address,
                    "spawn_player",
                    &[i32_to_contract_val(x), i32_to_contract_val(y)],
                )
                .await?;

            let trans =
                trans.expect("apply_input contract execution failed to produce a transaction.");

            event_sender
                .send(Event::spawn(
                    trans.get_address().to_string(),
                    x,
                    y,
                    trans.get_timestamp(),
                ))
                .expect("Failed to send in the event mpsc");

            Ok(1.into())
        })
    }

    pub fn get_player(&self, id: String) -> Promise {
        let id_num = id.parse().expect("Failed to parse id.");
        let inner = self.blockdag.clone_inner();
        let keypair = self.keypair.clone();
        let contract_address = self.contract_address;

        future_to_promise(async move {
            let (x, _) = inner
                .lock()
                .await
                .execute_contract(
                    keypair
                        .read()
                        .expect("Failed to acquire lock")
                        .as_ref()
                        .expect("Failed to call spawn_player before applying input."),
                    contract_address,
                    "get_player_x",
                    &[ContractValue::U64(id_num)],
                )
                .await?;
            let x = x.expect("Should return a value");

            let (y, _) = inner
                .lock()
                .await
                .execute_contract(
                    keypair
                        .read()
                        .expect("Failed to acquire lock")
                        .as_ref()
                        .expect("Failed to call spawn_player before applying input."),
                    contract_address,
                    "get_player_y",
                    &[ContractValue::U64(id_num)],
                )
                .await?;
            let y = y.expect("Should return a value");

            let (heading, _) = inner
                .lock()
                .await
                .execute_contract(
                    keypair
                        .read()
                        .expect("Failed to acquire lock")
                        .as_ref()
                        .expect("Failed to call spawn_player before applying input."),
                    contract_address,
                    "get_player_heading",
                    &[ContractValue::U64(id_num)],
                )
                .await?;
            let heading = heading.expect("Should return a value");

            Ok(PlayerData::from_contract(x, y, heading).into())
        })
    }

    pub fn apply_input(&self, heading: u32) -> Promise {
        let inner = self.blockdag.clone_inner();
        let keypair = self.keypair.clone();
        let contract_address = self.contract_address;
        let event_sender = self.event_sender.clone();

        future_to_promise(async move {
            let (_, trans) = inner
                .lock()
                .await
                .execute_contract(
                    keypair
                        .read()
                        .expect("Failed to acquire lock")
                        .as_ref()
                        .expect("Failed to call spawn_player before applying input."),
                    contract_address,
                    "apply_input",
                    &[ContractValue::U64(heading.into())],
                )
                .await?;

            let trans =
                trans.expect("apply_input contract execution failed to produce a transaction.");

            event_sender
                .send(Event::input(
                    trans.get_address().to_string(),
                    heading,
                    trans.get_timestamp(),
                ))
                .expect("Failed to send in the event mpsc");

            Ok(1.into())
        })
    }

    pub fn take_events(&self) -> JsValue {
        self.event_receiver
            .try_iter()
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
    timestamp: u64,
}

#[wasm_bindgen]
#[derive(PartialEq, Debug)]
pub enum EventKind {
    Spawn,
    Input,
}

impl Event {
    pub fn spawn(
        id: String,
        x: i32,
        y: i32,
        timestamp: u64,
    ) -> Self {
        Event {
            id,
            x,
            y,
            heading: 0,
            kind: EventKind::Spawn,
            timestamp,
        }
    }

    pub fn input(
        id: String,
        heading: u32,
        timestamp: u64,
    ) -> Self {
        Event {
            id,
            x: 0,
            y: 0,
            heading,
            kind: EventKind::Input,
            timestamp,
        }
    }
}

#[wasm_bindgen]
impl Event {
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

    pub fn get_id(&self) -> JsValue {
        self.id.clone().into()
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

    pub fn get_timestamp(&self) -> JsValue {
        self.timestamp.to_string().into()
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
