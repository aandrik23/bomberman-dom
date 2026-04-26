export const BASE_DIRS = {
  sounds: "/assets/sounds/",
  images: "/assets/images/",
};

export const AUDIO_PATHS = {
  bgMusic:      `${BASE_DIRS.sounds}background.mp3`,
  explosion:    `${BASE_DIRS.sounds}explosion.flac`,
  playerHit:    `${BASE_DIRS.sounds}player_hit.wav`,
  powerUp:      `${BASE_DIRS.sounds}powerUp.mp3`,
  levelCleared: `${BASE_DIRS.sounds}level_completed.mp3`,
  levelFailed:  `${BASE_DIRS.sounds}level_failed.mp3`,
};

export const IMAGE_PATHS = {
  soundOn:   `${BASE_DIRS.images}sound.png`,
  soundOff:  `${BASE_DIRS.images}enable-sound.png`,
  wall:      `${BASE_DIRS.images}rock.png`,
  brick:     `${BASE_DIRS.images}bricks.png`,
  // Player sprites (4 colors for 4 players)
  player1:   `${BASE_DIRS.images}BombermanRight.png`,
  player2:   `${BASE_DIRS.images}BombermanLeft.png`,
  player3:   `${BASE_DIRS.images}BombermanUp.png`,
  player4:   `${BASE_DIRS.images}BombermanDown.png`,
  bomb:      `${BASE_DIRS.images}bomb.png`,
  explosion: `${BASE_DIRS.images}explosion.png`,
  // Power-ups (bombs/flames/speed)
  powerBomb:  `${BASE_DIRS.images}bomb.png`,
  powerFlame: `${BASE_DIRS.images}explosion.png`,
  powerSpeed: `${BASE_DIRS.images}cherry.png`,
  // Countdown
  countdown3: `${BASE_DIRS.images}3.png`,
  countdown2: `${BASE_DIRS.images}2.png`,
  countdown1: `${BASE_DIRS.images}1.png`,
  countdownGo:`${BASE_DIRS.images}go.png`,
};
