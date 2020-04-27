#[derive(Debug, Eq, PartialEq, Copy, Clone)]
pub enum PlayerHeading {
    Up = 0,
    Down,
    Left,
    Right,
    NoHeading,
}

impl From<i64> for PlayerHeading {
    fn from(value: i64) -> Self {
        match value {
            0 => PlayerHeading::Up,
            1 => PlayerHeading::Down,
            2 => PlayerHeading::Left,
            3 => PlayerHeading::Right,
            4 => PlayerHeading::NoHeading,
            _ => std::process::abort(),
        }
    }
}

impl From<PlayerHeading> for i64 {
    fn from(value: PlayerHeading) -> Self {
        value.as_i64()
    }
}

impl PlayerHeading {
    pub fn as_i64(&self) -> i64{
        (*self as u8) as i64
    }
}