
export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export interface Bird {
  y: number;
  velocity: number;
  rotation: number;
}

export interface Pipe {
  id: number;
  x: number;
  topHeight: number;
  passed: boolean;
}

export interface GameSettings {
  gravity: number;
  jumpStrength: number;
  pipeSpeed: number;
  pipeWidth: number;
  pipeGap: number;
  birdX: number;
  birdSize: number;
}
