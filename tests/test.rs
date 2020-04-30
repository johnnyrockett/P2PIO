use std::collections::{HashMap, VecDeque};
use std::fs;

use rand::{Rng, SeedableRng};

use rustdag_lib::{
    dag::{
        blockdag::BlockDAG,
        consensus::key::KeyTipManager,
        contract::{runtime::wasmi::WasmiRuntime, source::ContractSource, ContractValue::U64},
        generic_blockdag::GenericBlockDAG,
        transaction::{updates::TransactionUpdates, Transaction},
    },
    security::keys::eddsa::{get_address, get_public_key, new_key_pair, EdDSAKeyPair},
};

fn spawn<'a, DAG: 'a + BlockDAG<'a>>(
    dag: &'a mut DAG,
    key: &EdDSAKeyPair,
    contract_id: u64,
    name: &str,
) -> (String, Transaction, TransactionUpdates) {
    log::debug!("{}: spawn_player", name);
    let (_, result) = dag
        .execute_contract::<rand::rngs::ThreadRng>(
            key,
            contract_id,
            "spawn_player",
            &[U64(0), U64(0)],
        )
        .unwrap();
    let (transaction, updates) = result.unwrap();
    (name.to_string(), transaction, updates)
}

fn apply_input<'a, DAG: 'a + BlockDAG<'a>>(
    dag: &'a mut DAG,
    key: &EdDSAKeyPair,
    contract_id: u64,
    heading: u64,
    name: &str,
) -> (String, Transaction, TransactionUpdates) {
    log::debug!("{}: applying_input {}", name, heading);

    let (_, result) = dag
        .execute_contract::<rand::rngs::ThreadRng>(key, contract_id, "apply_input", &[U64(heading)])
        .unwrap();
    let (transaction, updates) = result.unwrap();
    (name.to_string(), transaction, updates)
}

fn commit<'a, DAG: 'a + BlockDAG<'a>>(
    dag: &'a mut DAG, dag_name: &'static str,
    trans_tuple: (String, Transaction, TransactionUpdates),
) {
    let (name, trans, updates) = trans_tuple;
    log::debug!(
        "{} committing: {} {} | trunk={}, branch={}",
        dag_name,
        name,
        trans.get_hash(),
        trans.get_trunk_hash(),
        trans.get_branch_hash()
    );
    dag.commit_transaction(trans.clone(), updates.clone())
        .unwrap();
}

#[test]
fn test_random() {
    let _ = simple_logger::init_with_level(log::Level::Info);
    let num_repeats = 1;
    let num_iterations = 5;
    let event_create_prob = 0.5_f32;
    let event_process_prob = 0.5_f32;

    // let seed = rand::random::<u64>();
    // let seed = 11238392701941376174; // TRAP ERROR
    let seed = 14553890773435112203; // MERGE ERROR
    log::info!("Using seed {}", seed);

    let mut rng = rand::rngs::StdRng::seed_from_u64(seed);


    // Get Contract Source
    let path = "contract/pkg/p2pio_contract_bg.wasm";
    let contract_src_bytes = fs::read(path).unwrap_or_else(|_| {
        log::debug!("Generating wasm for contract.");
        std::process::Command::new("wasm-pack")
            .arg("build")
            .current_dir("contract")
            .output()
            .expect("Failed to run wasm-pack build for contract.");
        fs::read(path).expect(&format!(
            "Failed to generate {} using wasm-pack build.",
            path
        ))
    });
    let contract_src = ContractSource::with_vec(contract_src_bytes);


    for _ in 0..num_repeats {

        let contract_key = new_key_pair();
        let contract_id = get_address(&get_public_key(&contract_key));
        let key1 = new_key_pair();
        let key2 = new_key_pair();

        let mut dag1 = GenericBlockDAG::<_, _, _, WasmiRuntime, _>::new(
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            KeyTipManager::new(get_address(&get_public_key(&key1))),
        );
        let mut dag2 = GenericBlockDAG::<_, _, _, WasmiRuntime, _>::new(
            HashMap::new(),
            HashMap::new(),
            HashMap::new(),
            KeyTipManager::new(get_address(&get_public_key(&key2))),
        );

        let (contract_trans, contract_updates) = dag1
            .deploy_contract::<rand::rngs::ThreadRng>(&contract_key, contract_src.clone())
            .unwrap();
        let contract = ("contract".to_string(), contract_trans, contract_updates);
        commit(&mut dag1, "dag1", contract.clone());
        commit(&mut dag2, "dag2", contract.clone());


        if rng.gen::<f32>() <= 0.5 {
            let spawn1 = spawn(&mut dag1, &key1, contract_id, "dag1-spawn");
            commit(&mut dag1, "dag1", spawn1.clone());
            commit(&mut dag2, "dag2", spawn1.clone());

            let spawn2 = spawn(&mut dag2, &key2, contract_id, "dag2-spawn");
            commit(&mut dag1, "dag1", spawn2.clone());
            commit(&mut dag2, "dag2", spawn2.clone());
        } else {
            let spawn2 = spawn(&mut dag2, &key2, contract_id, "dag2-spawn");
            commit(&mut dag1, "dag1", spawn2.clone());
            commit(&mut dag2, "dag2", spawn2.clone());

            let spawn1 = spawn(&mut dag1, &key1, contract_id, "dag1-spawn");
            commit(&mut dag1, "dag1", spawn1.clone());
            commit(&mut dag2, "dag2", spawn1.clone());
        }

        let mut queue_len_sum = 0;
        let mut queue_len_count = 0;
        let mut queue1 = VecDeque::<(String, Transaction, TransactionUpdates)>::new();
        let mut queue2 = VecDeque::<(String, Transaction, TransactionUpdates)>::new();
        for it in 0..num_iterations {
            log::info!("Iteration #{}", it);

            if rng.gen::<f32>() <= event_create_prob {
                let heading = rng.gen::<u64>() % 4;
                let inp1 = apply_input(
                    &mut dag1,
                    &key1,
                    contract_id,
                    heading,
                    &format!("dag1-#{}", it),
                );
                commit(&mut dag1, "dag1", inp1.clone());
                queue2.push_back(inp1);
            }
            if rng.gen::<f32>() <= event_create_prob {
                let heading = rng.gen::<u64>() % 4;
                let inp2 = apply_input(
                    &mut dag2,
                    &key2,
                    contract_id,
                    heading,
                    &format!("dag2-#{}", it),
                );
                commit(&mut dag2, "dag2", inp2.clone());
                queue1.push_back(inp2);
            }

            queue_len_sum += queue1.len() + queue2.len();
            queue_len_count += 2;
            log::debug!("dag1 queue len: {}", queue1.len());
            log::debug!("dag2 queue len: {}", queue2.len());

            if rng.gen::<f32>() <= 1.0 - (1.0 - event_process_prob).powi(queue1.len() as i32) {
                let num_to_take = (rng.gen::<usize>() % queue1.len()) + 1;
                log::debug!("dag1 processing: {}/{}", num_to_take, queue1.len());
                for _ in 0..num_to_take {
                    let inp = queue1.pop_front().unwrap();
                    commit(&mut dag1, "dag1", inp);
                }
            }

            if rng.gen::<f32>() <= 1.0 - (1.0 - event_process_prob).powi(queue2.len() as i32) {
                let num_to_take = (rng.gen::<usize>() % queue2.len()) + 1;
                log::debug!("dag2, processing: {}/{}", num_to_take, queue2.len());
                for _ in 0..num_to_take {
                    let inp = queue2.pop_front().unwrap();
                    commit(&mut dag2, "dag2", inp);
                }
            }
        }
        log::info!("Average queue len was {}", f64::from(queue_len_sum as i32) / f64::from(queue_len_count));
    }
}

#[test]
fn test_simple_pattern() {
    let _ = simple_logger::init_with_level(log::Level::Debug);

    let path = "contract/pkg/p2pio_contract_bg.wasm";
    let contract_src_bytes = fs::read(path).unwrap_or_else(|_| {
        log::debug!("Generating wasm for contract.");
        std::process::Command::new("wasm-pack")
            .arg("build")
            .current_dir("contract")
            .output()
            .expect("Failed to run wasm-pack build for contract.");
        fs::read(path).expect(&format!(
            "Failed to generate {} using wasm-pack build.",
            path
        ))
    });
    let contract_src = ContractSource::with_vec(contract_src_bytes);

    let contract_key = new_key_pair();
    let contract_id = get_address(&get_public_key(&contract_key));
    let key1 = new_key_pair();
    let key2 = new_key_pair();

    let mut dag1 = GenericBlockDAG::<_, _, _, WasmiRuntime, _>::new(
        HashMap::new(),
        HashMap::new(),
        HashMap::new(),
        KeyTipManager::new(get_address(&get_public_key(&key1))),
    );
    let mut dag2 = GenericBlockDAG::<_, _, _, WasmiRuntime, _>::new(
        HashMap::new(),
        HashMap::new(),
        HashMap::new(),
        KeyTipManager::new(get_address(&get_public_key(&key2))),
    );

    let (contract_trans, contract_updates) = dag1
        .deploy_contract::<rand::rngs::ThreadRng>(&contract_key, contract_src)
        .unwrap();
    let contract = ("contract".to_string(), contract_trans, contract_updates);
    commit(&mut dag1, "dag1", contract.clone());
    commit(&mut dag2, "dag2", contract.clone());

    let spawn2 = spawn(&mut dag2, &key2, contract_id, "dag2-spawn");
    commit(&mut dag1, "dag1", spawn2.clone());
    commit(&mut dag2, "dag2", spawn2.clone());
    let spawn1 = spawn(&mut dag1, &key1, contract_id, "dag1-spawn");
    commit(&mut dag1, "dag1", spawn1.clone());
    commit(&mut dag2, "dag2", spawn1.clone());


    let dag1_num1 = apply_input(&mut dag1, &key1, contract_id, 0, "dag1-#1");
    commit(&mut dag1, "dag1", dag1_num1.clone());

    let dag2_num1 = apply_input(&mut dag2, &key2, contract_id, 2, "dag2_#1");
    commit(&mut dag2, "dag2", dag2_num1.clone());

    commit(&mut dag2, "dag2", dag1_num1.clone());


    // let dag1_num2 = apply_input(&mut dag1, &key1, contract_id, 3, "dag1-#2");
    // commit(&mut dag1, "dag1", dag1_num2.clone());

    let dag2_num2 = apply_input(&mut dag2, &key2, contract_id, 0, "dag2_#2");
    commit(&mut dag2, "dag2", dag2_num2.clone());

}
