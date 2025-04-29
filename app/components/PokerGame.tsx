import { useState, useEffect, useRef } from 'react';
import PokerTable from './PokerTable';
import PlayerStatusBar from './PlayerStatusBar';
import GameLog from './GameLog';
import { generateDeck, dealCards, dealCommunityCards } from '../lib/poker';
import { makeAIDecision, createAIPersonality, AILevel } from '../lib/ai-player';
import { calculateWinProbability } from '../lib/poker-probability';
import { Card } from '../lib/types';

type GamePhase = 'pre-flop' | 'flop' | 'turn' | 'river' | 'showdown';

interface PlayerState {
  id: string;
  name: string;
  chips: number;
  cards: string[];
  folded: boolean;
  currentBet: number;
  isAI: boolean;
  aiLevel?: AILevel;
  lastAction?: string;
}

interface WinnerInfo {
  playerIndex: number;
  handRank: string;
  winningHand: string[];
}

interface LogEntry {
  playerId: string;
  playerName: string;
  action: string;
  timestamp: number;
  type: 'action' | 'phase' | 'result';
}

interface GameAction {
  id: string;
  gameId: string;
  playerId: string;
  type: 'fold' | 'call' | 'raise' | 'check';
  amount?: number;
  sequence: number;
  createdAt: Date;
}

interface PokerGameProps {
  gameId?: string;
  isReviewMode?: boolean;
}

export function PokerGame({ gameId: initialGameId, isReviewMode }: PokerGameProps) {
  // Game state
  const [isGameActive, setIsGameActive] = useState(false);
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [dealerIndex, setDealerIndex] = useState(0);
  const [deck, setDeck] = useState<string[]>([]);
  const [communityCards, setCommunityCards] = useState<string[]>([]);
  const [pot, setPot] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [phase, setPhase] = useState<GamePhase>('pre-flop');
  const [showdown, setShowdown] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<WinnerInfo | null>(null);
  const [gameLogs, setGameLogs] = useState<LogEntry[]>([]);
  const [isLogVisible, setIsLogVisible] = useState(true);
  const [gameActions, setGameActions] = useState<GameAction[]>([]);
  const [currentActionIndex, setCurrentActionIndex] = useState(0);
  const [playerContributions, setPlayerContributions] = useState<Record<string, number>>({});
  
  // User info
  const [userId] = useState('user-1');
  
  // AI state
  const isAIActing = useRef(false);
  
  // Game ID state
  const [gameId, setGameId] = useState<string | null>(initialGameId || null);

  useEffect(() => {
    if (isReviewMode && gameId) {
      loadGameHistory();
    }
  }, [isReviewMode, gameId]);

  const loadGameHistory = async () => {
    try {
      const response = await fetch(`/api/games/${gameId}`);
      const gameData = await response.json();
      
      // Set initial game state
      setPlayers(gameData.players);
      setCommunityCards(gameData.communityCards || []);
      setPot(gameData.pot || 0);
      setCurrentBet(gameData.currentBet || 0);
      setPhase(gameData.phase || 'pre-flop');
      
      // Load all actions
      setGameActions(gameData.actions);
      setCurrentActionIndex(0);
    } catch (error) {
      console.error('Error loading game history:', error);
    }
  };

  const startGame = async () => {
    // Initialize a new game
    const newDeck = generateDeck();
    const initialPlayers: PlayerState[] = [
      {
        id: userId,
        name: 'You',
        chips: 1000,
        cards: [],
        folded: false,
        currentBet: 0,
        isAI: false
      },
      {
        id: 'ai-1',
        name: 'AI Player 1',
        chips: 1000,
        cards: [],
        folded: false,
        currentBet: 0,
        isAI: true,
        aiLevel: AILevel.MEDIUM
      }
    ];

    // Create a new game in the database
    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          players: initialPlayers,
          initialChips: 1000
        })
      });

      const gameData = await response.json();
      setGameId(gameData.id);

      // Deal initial cards
      const { remainingDeck, playerCards } = dealCards(newDeck, 2);
      const playersWithCards = initialPlayers.map((player, index) => ({
        ...player,
        cards: playerCards[index]
      }));

      setDeck(remainingDeck);
      setPlayers(playersWithCards);
      setIsGameActive(true);
      setPhase('pre-flop');
      addToLog('Game started', 'phase', userId, 'You');
    } catch (error) {
      console.error('Error creating new game:', error);
    }
  };

  const handlePlayerAction = async (action: string, amount?: number) => {
    if (!isGameActive || !gameId) return;

    const currentPlayer = players[currentPlayerIndex];
    if (!currentPlayer || currentPlayer.folded) return;

    try {
      // Store the action in the database
      const response = await fetch(`/api/games/${gameId}/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          playerId: currentPlayer.id,
          type: action,
          amount,
          sequence: gameActions.length
        })
      });

      if (!response.ok) {
        throw new Error('Failed to store action');
      }

      // Update game state based on action
      const updatedPlayers = [...players];
      switch (action) {
        case 'fold':
          updatedPlayers[currentPlayerIndex].folded = true;
          addToLog(`${currentPlayer.name} folds`, 'action', currentPlayer.id, currentPlayer.name);
          break;
        case 'call':
          // Handle call action
          break;
        case 'raise':
          // Handle raise action
          break;
      }

      setPlayers(updatedPlayers);
      moveToNextPlayer();
    } catch (error) {
      console.error('Error handling player action:', error);
    }
  };

  const moveToNextPlayer = () => {
    let nextPlayerIndex = (currentPlayerIndex + 1) % players.length;
    while (players[nextPlayerIndex].folded && nextPlayerIndex !== currentPlayerIndex) {
      nextPlayerIndex = (nextPlayerIndex + 1) % players.length;
    }
    setCurrentPlayerIndex(nextPlayerIndex);
  };

  const addToLog = (
    action: string,
    type: LogEntry['type'],
    playerId: string,
    playerName: string
  ) => {
    setGameLogs(prev => [...prev, {
      playerId,
      playerName,
      action,
      timestamp: Date.now(),
      type
    }]);
  };

  const replayNextAction = () => {
    if (currentActionIndex >= gameActions.length) return;
    
    const action = gameActions[currentActionIndex];
    applyAction(action);
    setCurrentActionIndex(prev => prev + 1);
  };

  const replayPreviousAction = () => {
    if (currentActionIndex <= 0) return;
    
    setCurrentActionIndex(prev => prev - 1);
    // Reset game state to previous action
    if (currentActionIndex > 0) {
      const previousState = calculateGameStateAtAction(currentActionIndex - 1);
      applyGameState(previousState);
    }
  };

  const calculateGameStateAtAction = (actionIndex: number) => {
    // Calculate game state after applying all actions up to actionIndex
    const relevantActions = gameActions.slice(0, actionIndex);
    // ... implement state calculation based on actions
    return {
      players: [] as PlayerState[],
      communityCards: [] as string[],
      pot: 0,
      currentBet: 0,
      phase: 'pre-flop' as GamePhase
    };
  };

  const applyGameState = (state: ReturnType<typeof calculateGameStateAtAction>) => {
    setPlayers(state.players);
    setCommunityCards(state.communityCards);
    setPot(state.pot);
    setCurrentBet(state.currentBet);
    setPhase(state.phase);
  };

  const applyAction = (action: GameAction) => {
    const updatedPlayers = [...players];
    const playerIndex = players.findIndex(p => p.id === action.playerId);
    
    if (playerIndex === -1) return;
    const player = players[playerIndex];

    switch (action.type) {
      case 'fold':
        updatedPlayers[playerIndex].folded = true;
        addToLog('folds', 'action', player.id, player.name);
        break;
      case 'call':
        if (typeof action.amount === 'number') {
          updatedPlayers[playerIndex].chips -= action.amount;
          updatedPlayers[playerIndex].currentBet += action.amount;
          setPot(prev => prev + action.amount);
          addToLog(`calls ${action.amount}`, 'action', player.id, player.name);
        }
        break;
      case 'raise':
        if (typeof action.amount === 'number') {
          updatedPlayers[playerIndex].chips -= action.amount;
          updatedPlayers[playerIndex].currentBet += action.amount;
          setPot(prev => prev + action.amount);
          setCurrentBet(action.amount);
          addToLog(`raises to ${action.amount}`, 'action', player.id, player.name);
        }
        break;
    }

    setPlayers(updatedPlayers);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-900">
      <header className="bg-gray-800 p-4 text-white flex justify-between items-center">
        <h1 className="text-2xl font-bold">Texas Hold'em Poker</h1>
        <div className="flex gap-4">
          {isReviewMode && (
            <div className="flex gap-2">
              <button
                onClick={replayPreviousAction}
                disabled={currentActionIndex <= 0}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded"
              >
                Previous
              </button>
              <button
                onClick={replayNextAction}
                disabled={currentActionIndex >= gameActions.length}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded"
              >
                Next
              </button>
            </div>
          )}
          <button 
            onClick={() => setIsLogVisible(!isLogVisible)}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
          >
            {isLogVisible ? 'Hide Log' : 'Show Log'}
          </button>
        </div>
      </header>
      
      <main className="flex-grow flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          {!isReviewMode && !isGameActive && !winnerInfo && (
            <div className="text-center mb-6">
              <button
                onClick={startGame}
                className="bg-green-600 hover:bg-green-700 text-white py-3 px-8 rounded-lg text-xl font-bold"
              >
                Start Game
              </button>
            </div>
          )}
          
          <PokerTable
            players={players.map(p => ({
              id: p.id,
              name: p.name,
              chips: p.chips,
              cards: p.cards,
              folded: p.folded,
              isAI: p.isAI,
              lastAction: p.lastAction
            }))}
            communityCards={communityCards}
            pot={pot}
            currentPlayerIndex={currentPlayerIndex}
            dealerIndex={dealerIndex}
            gamePhase={phase}
            userId={userId}
            showdown={showdown}
          />
          
          {isLogVisible && (
            <GameLog
              logs={gameLogs}
              isVisible={isLogVisible}
              onClose={() => setIsLogVisible(false)}
            />
          )}
        </div>
      </main>
      
      <PlayerStatusBar
        players={players.map(p => ({
          id: p.id,
          name: p.name,
          chips: p.chips,
          cards: p.cards,
          folded: p.folded,
          isAI: p.isAI,
          lastAction: p.lastAction
        }))}
        currentPlayerIndex={currentPlayerIndex}
        dealerIndex={dealerIndex}
        playerContributions={playerContributions}
      />
    </div>
  );
} 