use rustdag_wasm_api::globals::{
    api_get_sender_address,
};
use rustdag_wasm_api::mapping::Mapping;

use crate::index::{PLAYER_X_MAPPING_INDEX, PLAYER_Y_MAPPING_INDEX, PLAYER_HEADING_MAPPING_INDEX, PLAYER_TICK_MAPPING_INDEX};

use crate::heading::PlayerHeading;

pub struct Player {
    id: i64,
    x_mapping: Mapping,
    y_mapping: Mapping,
    heading_mapping: Mapping,
    tick_mapping: Mapping,
}

impl Default for Player {
    fn default() -> Self {
        Self::load(api_get_sender_address())
    }
}

impl Player {
    pub fn load(id: i64) -> Self {
        Player {
            id,
            x_mapping: Mapping(PLAYER_X_MAPPING_INDEX),
            y_mapping: Mapping(PLAYER_Y_MAPPING_INDEX),
            heading_mapping: Mapping(PLAYER_HEADING_MAPPING_INDEX),
            tick_mapping: Mapping(PLAYER_TICK_MAPPING_INDEX),
        }
    }

    pub fn spawn(id: i64, x: i64, y: i64, tick: i64) -> Self {
        let mut player = Self::load(id);
        player.set_position(x, y, tick);
        player.set_heading(PlayerHeading::NoHeading);

        player
    }

    pub fn get_position(&self, now_tick: i64) -> (i64, i64) {
        let tick = self.tick_mapping.get(self.id);

        let delta_t = now_tick - tick;
        if delta_t < 0 {
            // Called on a tick before position was set
            std::process::abort()
        }
        let mut x = self.x_mapping.get(self.id);
        let mut y = self.y_mapping.get(self.id);
        let heading = self.get_heading();

        match heading {
            PlayerHeading::Up => y += delta_t,
            PlayerHeading::Down => y -= delta_t,
            PlayerHeading::Left => x -= delta_t,
            PlayerHeading::Right => x += delta_t,
            PlayerHeading::NoHeading => (),
        }

        (x, y)
    }

    pub fn get_heading(&self) -> PlayerHeading {
        PlayerHeading::from(self.heading_mapping.get(self.id))
    }

    pub fn apply_input(&mut self, heading: PlayerHeading, now_tick: i64) {
        let (x, y) = self.get_position(now_tick);
        self.set_position(x, y, now_tick);
        self.set_heading(heading);
    }

    fn set_position(&mut self, x: i64, y: i64, tick: i64) {
        self.x_mapping.set(self.id, x);
        self.y_mapping.set(self.id, y);
        self.tick_mapping.set(self.id, tick);
    }

    fn set_heading(&mut self, heading: PlayerHeading) {
        self.heading_mapping.set(self.id, heading.as_i64());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_player_get_position() {
        let mut player = Player::spawn(3, 10, 10, 0);

        assert_eq!(player.get_position(0), (10, 10));
        for (heading, expected_position) in [
            (PlayerHeading::Up, (10, 11)),
            (PlayerHeading::Down, (10, 9)),
            (PlayerHeading::Left, (9, 10)),
            (PlayerHeading::Right, (11, 10)),
        ].iter() {
            player.set_heading(*heading);
            assert_eq!(player.get_heading(), *heading);
            assert_eq!(&player.get_position(1), expected_position, "Heading {:?}", heading);
        }
    }

    #[test]
    fn test_spawn_players() {
        let player1 = Player::spawn(1, 10, 10, 0);
        let player2 = Player::spawn(2, 10, 42, 5);

        assert_eq!(player1.get_position(5), (15, 10));
        assert_eq!(player2.get_position(5), (10, 42));

        assert_eq!(player1.get_position(10), (20, 10));
        assert_eq!(player2.get_position(10), (15, 42));
    }
}