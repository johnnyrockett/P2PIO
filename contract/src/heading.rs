#[derive(Debug, Eq, PartialEq, Copy, Clone)]
pub enum PlayerHeading {
    Up = 0,
    Down,
    Left,
    Right,
}

impl From<i64> for PlayerHeading {
    fn from(value: i64) -> Self {
        match value {
            0 => PlayerHeading::Up,
            1 => PlayerHeading::Down,
            2 => PlayerHeading::Left,
            3 => PlayerHeading::Right,
            _ => std::process::abort(),
        }
    }
}

impl PlayerHeading {
    pub fn as_i64(&self) -> i64{
        (*self as u8) as i64
    }
}