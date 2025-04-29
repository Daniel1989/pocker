// Card type definitions
export interface Card {
  rank: string;
  suit: string;
}

export interface PlayerState {
  id: string;
  cards?: string[];
  folded: boolean;
  chips: number;
  contribution: number;
  isAllIn: boolean;
  name: string;
}

export interface GameState {
  players: PlayerState[];
  communityCards: string[];
  currentPlayer: string;
  pot: number;
  currentBet: number;
  phase: 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';
  lastAction?: GameAction;
  isComplete: boolean;
  winners?: string[];
}

export interface GameAction {
  playerId: string;
  type: 'fold' | 'check' | 'call' | 'raise' | 'all-in';
  amount?: number;
  sequence: number;
  timestamp: Date;
}

export interface GameRound {
  phase: string;
  actions: GameAction[];
  pot: number;
  communityCards: string[];
}

export interface GameResult {
  id: string;
  players: PlayerState[];
  rounds: GameRound[];
  winners: string[];
  timestamp: Date;
} 