use rustdag_wasm_api::contract::Contract;
use rustdag_wasm_api::globals::{
    api_get_sender_address, api_get_timestamp, GlobalI64,
};

use rustdag_wasm_api::contract_extern;

mod player;
mod heading;
mod index;

use index::START_TIME_INDEX;
use player::Player;

pub struct P2PIOContract {
    start_time: GlobalI64,
}

impl Default for P2PIOContract {
    fn default() -> Self {
        P2PIOContract {
            start_time: GlobalI64(START_TIME_INDEX),
        }
    }
}

impl Contract for P2PIOContract {
    fn init(&mut self) {
        self.start_time.set(api_get_timestamp());
    }
}

#[contract_extern]
impl P2PIOContract {
    pub fn get_start_time(&self) -> i64 {
        self.start_time.get()
    }

    pub fn spawn_player(&self, x: i64, y: i64) {
        Player::spawn(api_get_sender_address(), x, y, self.get_current_game_tick());
    }

    pub fn get_player_x(&self, id: i64) -> i64 {
        let player = Player::load(id);
        let (x, _) = player.get_position(self.get_current_game_tick());
        x
    }

    pub fn get_player_y(&self, id: i64) -> i64 {
        let player = Player::load(id);
        let (_, y) = player.get_position(self.get_current_game_tick());
        y
    }

    pub fn get_current_game_tick(&self) -> i64 {
        let start_time = self.get_start_time();
        let now_time = api_get_timestamp();
        ms_delta_to_tick(now_time - start_time)
    }
}

/// Convert a delta in milliseconds to a game tick incremented from zero
fn ms_delta_to_tick(delta_t: i64) -> i64 {
    let tick = ((delta_t as f64) / 1000.0) * 60.0;
    tick.floor() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ms_delta_to_tick() {
        assert_eq!(ms_delta_to_tick(0), 0);
        assert_eq!(ms_delta_to_tick(6000), 360);
    }

    #[test]
    fn test_spawn_player() {
        let mut contract = P2PIOContract::default();
        contract.init();
        contract.spawn_player(0, 15);
        assert_eq!(contract.get_player_x(0), 0);
        assert_eq!(contract.get_player_y(0), 15);
    }
}