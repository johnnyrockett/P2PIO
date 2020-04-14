# p2pio-contract
## Dependencies
```sh
$ cargo install wasm-pack
```
## Build Contract
* Ensure you have cloned submodules
```sh
$ cd contract
$ wasm-pack build
$ cd ..
```
This will produce the contract file at: `contract/pkg/p2pio_contract_bg.wasm`.
This file can then be deployed using the rustdag cli:
```sh
$ cd rustdag/cli
$ cargo run server
... new terminal ...
$ cd rustdag/cli
$ cargo run key generate contract.key
$ cargo run key generate client.key # This command will print out player_id
$ cargo run deploy contract.key ../../contract/pkg/p2pio_contract_bg.wasm # This command will print out contract_id
$ cargo run -- run -c <contract_id> client.key spawn_player 0 0
$ cargo run -- run -c <contract_id> client.key get_player_x <player_id>
```