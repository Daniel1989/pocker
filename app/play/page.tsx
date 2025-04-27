'use client';

import React, { useState, useEffect, useCallback } from 'react';
import PokerTable from '../components/PokerTable';
import ActionControls from '../components/ActionControls';
import GameResult from '../components/GameResult';
import GameLog from '../components/GameLog';
import PlayerStatusBar from '../components/PlayerStatusBar';
import { PlayerInfo } from '../components/Player';
import { generateDeck, dealCards, dealCommunityCards, evaluateHand, determineWinner, Card } from '../lib/poker';
import { makeAIDecision, createAIPersonality, AILevel } from '../lib/ai-player';

// Define PlayerState interface to match ai-player.ts
interface PlayerState {
  id: string;
  chips: number;
  cards: Card[];
  folded: boolean;
  totalBet: number;
}

// Game phases
const PHASES = ['PREFLOP', 'FLOP', 'TURN', 'RIVER', 'SHOWDOWN'];

// Blinds structure
const BLINDS = { small: 10, big: 20 };

// Number of AI players
const NUM_AI_PLAYERS = 3;

// Starting chips
const STARTING_CHIPS = 1000;

// AI names
const AI_NAMES = ['Alex', 'Jordan', 'Taylor', 'Casey', 'Morgan', 'Riley'];

// Delay for AI actions (ms)
const AI_ACTION_DELAY = 1000;

interface LogEntry {
  playerId: string;
  playerName: string;
  action: string;
  amount?: number;
  timestamp: number;
}

const PokerGamePage = () => {
  // User info
  const [userId] = useState('user-1');
  const [userName] = useState('You');
  
  // Game state
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [communityCards, setCommunityCards] = useState<Card[]>([]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [pot, setPot] = useState(0);
  const [currentBet, setCurrentBet] = useState(0);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [dealerIndex, setDealerIndex] = useState(0);
  const [gamePhase, setGamePhase] = useState('');
  const [isGameActive, setIsGameActive] = useState(false);
  const [showdown, setShowdown] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState<any>(null);
  const [playerContributions, setPlayerContributions] = useState<Record<string, number>>({});
  const [gameLogs, setGameLogs] = useState<LogEntry[]>([]);
  const [isLogVisible, setIsLogVisible] = useState(true);
  
  // Initialize or reset the game
  const initializeGame = useCallback(() => {
    // Generate random AI players
    const shuffledNames = [...AI_NAMES].sort(() => Math.random() - 0.5);
    const aiPlayers: PlayerInfo[] = Array.from({ length: NUM_AI_PLAYERS }).map((_, i) => ({
      id: `ai-${i+1}`,
      name: shuffledNames[i],
      chips: STARTING_CHIPS,
      cards: [],
      folded: false,
      isAI: true,
    }));
    
    // Create user player
    const userPlayer: PlayerInfo = {
      id: userId,
      name: userName,
      chips: STARTING_CHIPS,
      cards: [],
      folded: false,
    };
    
    // Combine players with user first
    const allPlayers = [userPlayer, ...aiPlayers];
    
    // Randomly select dealer
    const randomDealerIndex = Math.floor(Math.random() * allPlayers.length);
    
    // Initialize player contributions
    const initialContributions: Record<string, number> = {};
    allPlayers.forEach(player => {
      initialContributions[player.id] = 0;
    });
    
    // Set initial state
    setPlayers(allPlayers);
    setCommunityCards([]);
    setPot(0);
    setCurrentBet(0);
    setDealerIndex(randomDealerIndex);
    setGamePhase('');
    setIsGameActive(false);
    setShowdown(false);
    setWinnerInfo(null);
    setPlayerContributions(initialContributions);
  }, [userId, userName]);
  
  // Start a new game
  const startGame = () => {
    // Generate and shuffle deck
    const newDeck = generateDeck();
    
    // Deal 2 cards to each player
    const { playerCards, remainingDeck } = dealCards(players.length);
    
    // Update players with their cards
    const updatedPlayers = players.map((player, index) => ({
      ...player,
      cards: playerCards[index],
      folded: false,
    }));
    
    // Calculate positions
    const smallBlindPos = (dealerIndex + 1) % players.length;
    const bigBlindPos = (dealerIndex + 2) % players.length;
    
    // Collect blinds
    const newPot = BLINDS.small + BLINDS.big;
    
    // Update player chips and contributions
    const newPlayers = updatedPlayers.map((player, index) => {
      if (index === smallBlindPos) {
        return {
          ...player,
          chips: player.chips - BLINDS.small,
          lastAction: `Small Blind (${BLINDS.small})`,
        };
      }
      if (index === bigBlindPos) {
        return {
          ...player,
          chips: player.chips - BLINDS.big,
          lastAction: `Big Blind (${BLINDS.big})`,
        };
      }
      return player;
    });
    
    // Update player contributions
    const newContributions = { ...playerContributions };
    newContributions[newPlayers[smallBlindPos].id] = BLINDS.small;
    newContributions[newPlayers[bigBlindPos].id] = BLINDS.big;
    
    // First player to act is after the big blind
    const firstToAct = (bigBlindPos + 1) % players.length;
    
    // Add logs for blinds
    const newLogs: LogEntry[] = [
      {
        playerId: newPlayers[smallBlindPos].id,
        playerName: newPlayers[smallBlindPos].name,
        action: 'posted small blind',
        amount: BLINDS.small,
        timestamp: Date.now()
      },
      {
        playerId: newPlayers[bigBlindPos].id,
        playerName: newPlayers[bigBlindPos].name,
        action: 'posted big blind',
        amount: BLINDS.big,
        timestamp: Date.now()
      }
    ];
    
    // Update state
    setDeck(remainingDeck);
    setPlayers(newPlayers);
    setPot(newPot);
    setCurrentBet(BLINDS.big);
    setCurrentPlayerIndex(firstToAct);
    setGamePhase(PHASES[0]); // PREFLOP
    setPlayerContributions(newContributions);
    setIsGameActive(true);
    setGameLogs(newLogs);
    
    // Check if the first player is AI, and if so, trigger their action
    if (newPlayers[firstToAct].isAI) {
      console.log(`First player is AI: ${newPlayers[firstToAct].name}`);
      triggerAIAction(firstToAct, newPlayers, BLINDS.big, newContributions);
    } else {
      console.log(`First player is human: ${newPlayers[firstToAct].name}`);
    }
  };
  
  // Handle player action (fold, check, call, bet, raise, all-in)
  const handlePlayerAction = (action: string, amount?: number) => {
    const currentPlayer = players[currentPlayerIndex];
    const playerId = currentPlayer.id;
    
    // Copy current state
    const updatedPlayers = [...players];
    const newContributions = { ...playerContributions };
    let newPot = pot;
    let newCurrentBet = currentBet;
    
    // Create new log entry
    let logEntry: LogEntry | null = null;
    
    // Process action
    switch (action) {
      case 'FOLD':
        updatedPlayers[currentPlayerIndex] = {
          ...currentPlayer,
          folded: true,
          lastAction: 'Fold',
        };
        logEntry = {
          playerId,
          playerName: currentPlayer.name,
          action: 'folded',
          timestamp: Date.now()
        };
        break;
        
      case 'CHECK':
        updatedPlayers[currentPlayerIndex] = {
          ...currentPlayer,
          lastAction: 'Check',
        };
        logEntry = {
          playerId,
          playerName: currentPlayer.name,
          action: 'checked',
          timestamp: Date.now()
        };
        break;
        
      case 'CALL':
        if (amount) {
          updatedPlayers[currentPlayerIndex] = {
            ...currentPlayer,
            chips: currentPlayer.chips - amount,
            lastAction: `Call (${amount})`,
          };
          newPot += amount;
          newContributions[playerId] = (newContributions[playerId] || 0) + amount;
          logEntry = {
            playerId,
            playerName: currentPlayer.name,
            action: 'called',
            amount,
            timestamp: Date.now()
          };
        }
        break;
        
      case 'BET':
        if (amount) {
          updatedPlayers[currentPlayerIndex] = {
            ...currentPlayer,
            chips: currentPlayer.chips - amount,
            lastAction: `Bet (${amount})`,
          };
          newPot += amount;
          newCurrentBet = amount;
          newContributions[playerId] = (newContributions[playerId] || 0) + amount;
          logEntry = {
            playerId,
            playerName: currentPlayer.name,
            action: 'bet',
            amount,
            timestamp: Date.now()
          };
        }
        break;
        
      case 'RAISE':
        if (amount) {
          // Amount is the new total bet, so we need to calculate the increase
          const additionalAmount = amount - newContributions[playerId];
          
          updatedPlayers[currentPlayerIndex] = {
            ...currentPlayer,
            chips: currentPlayer.chips - additionalAmount,
            lastAction: `Raise to ${amount}`,
          };
          newPot += additionalAmount;
          newCurrentBet = amount;
          newContributions[playerId] = amount;
          logEntry = {
            playerId,
            playerName: currentPlayer.name,
            action: 'raised to',
            amount,
            timestamp: Date.now()
          };
        }
        break;
        
      case 'ALL_IN':
        const allInAmount = currentPlayer.chips;
        updatedPlayers[currentPlayerIndex] = {
          ...currentPlayer,
          chips: 0,
          lastAction: `All-In (${allInAmount})`,
        };
        newPot += allInAmount;
        if (allInAmount + newContributions[playerId] > newCurrentBet) {
          newCurrentBet = allInAmount + newContributions[playerId];
        }
        newContributions[playerId] = (newContributions[playerId] || 0) + allInAmount;
        logEntry = {
          playerId,
          playerName: currentPlayer.name,
          action: 'went all-in',
          amount: allInAmount,
          timestamp: Date.now()
        };
        break;
    }
    
    // Update state
    setPlayers(updatedPlayers);
    setPot(newPot);
    setCurrentBet(newCurrentBet);
    setPlayerContributions(newContributions);
    
    // Add log entry if valid
    if (logEntry) {
      setGameLogs(prevLogs => [...prevLogs, logEntry!]);
    }
    
    // Move to next player or next phase
    moveToNextPlayerOrPhase(updatedPlayers, newCurrentBet, newContributions);
  };
  
  // Move to next player or next phase
  const moveToNextPlayerOrPhase = (
    updatedPlayers: PlayerInfo[],
    newCurrentBet: number,
    newContributions: Record<string, number>
  ) => {
    // Check if all players have acted and all active players have matched the current bet
    const activePlayers = updatedPlayers.filter(p => !p.folded);
    
    // If only one player remains, they win
    if (activePlayers.length === 1) {
      console.log('Only one player remains, ending hand');
      endHand(updatedPlayers, activePlayers[0]);
      return;
    }
    
    // Check if all active players have acted and matched the current bet
    const allPlayersActed = activePlayers.every(player => {
      const contribution = newContributions[player.id] || 0;
      return contribution === newCurrentBet || player.chips === 0;
    });
    
    console.log(`All players acted: ${allPlayersActed}, Current phase: ${gamePhase}`);
    
    if (allPlayersActed) {
      // Move to next phase
      const currentPhaseIndex = PHASES.indexOf(gamePhase);
      
      if (currentPhaseIndex < PHASES.length - 1) {
        console.log(`Moving to next phase from ${gamePhase} to ${PHASES[currentPhaseIndex + 1]}`);
        moveToNextPhase(updatedPlayers, newCurrentBet);
      } else {
        // End the hand if we're at the final phase
        console.log('Final phase reached, ending hand');
        endHand(updatedPlayers);
      }
    } else {
      // Find next active player
      let nextPlayerIndex = (currentPlayerIndex + 1) % updatedPlayers.length;
      
      // Skip folded players and players who are all-in
      while (
        updatedPlayers[nextPlayerIndex].folded ||
        updatedPlayers[nextPlayerIndex].chips === 0
      ) {
        nextPlayerIndex = (nextPlayerIndex + 1) % updatedPlayers.length;
      }
      
      console.log(`Moving to next player: ${updatedPlayers[nextPlayerIndex].name} (index: ${nextPlayerIndex})`);
      
      // Update current player
      setCurrentPlayerIndex(nextPlayerIndex);
      
      // If next player is AI, trigger their action
      if (updatedPlayers[nextPlayerIndex].isAI) {
        console.log(`Next player is AI: ${updatedPlayers[nextPlayerIndex].name}`);
        triggerAIAction(nextPlayerIndex, updatedPlayers, newCurrentBet, newContributions);
      } else {
        console.log(`Next player is human: ${updatedPlayers[nextPlayerIndex].name}`);
      }
    }
  };
  
  // Move to next phase
  const moveToNextPhase = (
    updatedPlayers: PlayerInfo[],
    newCurrentBet: number
  ) => {
    const currentPhaseIndex = PHASES.indexOf(gamePhase);
    const nextPhase = PHASES[currentPhaseIndex + 1];
    
    console.log(`Moving to next phase: ${nextPhase}`);
    
    // Deal community cards based on the phase
    let newCommunityCards = [...communityCards];
    let remainingDeck = [...deck];
    
    // Create log entry for phase change
    let phaseLog: LogEntry = {
      playerId: 'system',
      playerName: 'Dealer',
      action: `dealing the ${nextPhase.toLowerCase()}`,
      timestamp: Date.now()
    };
    
    switch (nextPhase) {
      case 'FLOP':
        // Deal 3 cards for the flop
        const flopResult = dealCommunityCards(remainingDeck, 3);
        newCommunityCards = flopResult.communityCards;
        remainingDeck = flopResult.remainingDeck;
        console.log(`Flop cards: ${newCommunityCards.join(', ')}`);
        break;
        
      case 'TURN':
      case 'RIVER':
        // Deal 1 card for turn or river
        const cardResult = dealCommunityCards(remainingDeck, 1);
        newCommunityCards = [...newCommunityCards, ...cardResult.communityCards];
        remainingDeck = cardResult.remainingDeck;
        console.log(`${nextPhase} card: ${cardResult.communityCards[0]}`);
        break;
        
      case 'SHOWDOWN':
        // No new cards, just evaluate hands
        phaseLog = {
          playerId: 'system',
          playerName: 'Dealer',
          action: 'starting showdown',
          timestamp: Date.now()
        };
        console.log('Starting showdown');
        setShowdown(true);
        endHand(updatedPlayers);
        return;
    }
    
    // Add phase change to logs
    setGameLogs(prevLogs => [...prevLogs, phaseLog]);
    
    // Reset current bet for the new phase
    setCurrentBet(0);
    
    // Reset player contributions for the new betting round
    const newContributions: Record<string, number> = {};
    updatedPlayers.forEach(player => {
      newContributions[player.id] = 0;
    });
    
    // Start with player after dealer
    let nextPlayerIndex = (dealerIndex + 1) % updatedPlayers.length;
    
    // Find next active player
    while (
      updatedPlayers[nextPlayerIndex].folded ||
      updatedPlayers[nextPlayerIndex].chips === 0
    ) {
      nextPlayerIndex = (nextPlayerIndex + 1) % updatedPlayers.length;
    }
    
    console.log(`First to act in ${nextPhase}: ${updatedPlayers[nextPlayerIndex].name} (index: ${nextPlayerIndex})`);

    // Update state
    setCommunityCards(newCommunityCards);
    setDeck(remainingDeck);
    setGamePhase(nextPhase);
    setCurrentPlayerIndex(nextPlayerIndex);
    setPlayerContributions(newContributions);
    
    // If next player is AI, trigger their action
    if (updatedPlayers[nextPlayerIndex].isAI) {
      console.log(`First player in ${nextPhase} is AI: ${updatedPlayers[nextPlayerIndex].name}`);
      triggerAIAction(nextPlayerIndex, updatedPlayers, 0, newContributions);
    } else {
      console.log(`First player in ${nextPhase} is human: ${updatedPlayers[nextPlayerIndex].name}`);
    }
  };
  
  // Schedule AI action
  const scheduleAIAction = (
    aiIndex: number,
    currentPlayers: PlayerInfo[],
    currentBetAmount: number,
    currentContributions: Record<string, number>
  ) => {
    setTimeout(() => {
      if (!isGameActive) return;
      
      const aiPlayer = currentPlayers[aiIndex];
      
      // Log the AI action scheduling for debugging
      console.log(`Scheduling action for AI player: ${aiPlayer.name}`);
      
      // Prepare game state for AI decision
      const gameState = {
        currentBet: currentBetAmount,
        pot,
        communityCards,
        phase: gamePhase,
        players: currentPlayers.map(p => ({
          id: p.id,
          chips: p.chips,
          cards: p.cards || [],
          folded: p.folded || false,
          totalBet: currentContributions[p.id] || 0,
        })),
      };
      
      // Get AI personality based on player index (harder AIs at higher indices)
      const aiLevel = aiIndex % 3 === 0 ? AILevel.EASY : 
                     aiIndex % 3 === 1 ? AILevel.MEDIUM : AILevel.HARD;
      const personality = createAIPersonality(aiLevel);
      
      // Get AI decision
      const aiPlayerState: PlayerState = {
        id: aiPlayer.id,
        chips: aiPlayer.chips,
        cards: aiPlayer.cards || [],
        folded: aiPlayer.folded || false,
        totalBet: currentContributions[aiPlayer.id] || 0,
      };
      
      const decision = makeAIDecision(aiPlayerState, gameState, personality);
      console.log(`AI ${aiPlayer.name} decision:`, decision);
      
      // Execute AI action
      handlePlayerAction(decision.action, decision.amount);
      
    }, AI_ACTION_DELAY);
  };
  
  // Add this new function after the scheduleAIAction function
  const triggerAIAction = (
    aiIndex: number,
    players: PlayerInfo[],
    currentBetAmount: number,
    contributions: Record<string, number>
  ) => {
    console.log(`Triggering AI action for ${players[aiIndex].name}`);
    // Use setTimeout to delay AI action for visual effect
    setTimeout(() => {
      if (isGameActive) {
        scheduleAIAction(aiIndex, players, currentBetAmount, contributions);
      }
    }, 1000);
  };
  
  // End the hand and determine the winner
  const endHand = (finalPlayers: PlayerInfo[], forcedWinner?: PlayerInfo) => {
    if (forcedWinner) {
      // If only one player remains, they win automatically
      const winnings = pot;
      
      // Update player chips
      const playersWithUpdatedChips = finalPlayers.map(player => {
        if (player.id === forcedWinner.id) {
          return {
            ...player,
            chips: player.chips + winnings,
          };
        }
        return player;
      });
      
      // Add log entry for winner
      const winnerLog: LogEntry = {
        playerId: forcedWinner.id,
        playerName: forcedWinner.name,
        action: 'wins',
        amount: winnings,
        timestamp: Date.now()
      };
      setGameLogs(prevLogs => [...prevLogs, winnerLog]);
      
      setWinnerInfo({
        winner: forcedWinner,
        handDescription: 'Last player standing',
        handRank: 0,
        pot: winnings,
        bestHand: [] as Card[],
        isUser: forcedWinner.id === userId,
      });
      
      setPlayers(playersWithUpdatedChips);
      setIsGameActive(false);
      return;
    }
    
    // Get active players and their cards
    const activePlayers = finalPlayers
      .filter(p => !p.folded)
      .map(p => ({
        userId: p.id,
        cards: p.cards as Card[],
        folded: p.folded || false,
      }));
    
    // Determine the winner
    const winner = determineWinner(activePlayers, communityCards);
    
    if (winner) {
      const winningPlayer = finalPlayers.find(p => p.id === winner.winnerId);
      
      if (winningPlayer) {
        // Add log entry for winner
        const winnerLog: LogEntry = {
          playerId: winningPlayer.id,
          playerName: winningPlayer.name,
          action: `wins with ${winner.winningHand.description}`,
          amount: pot,
          timestamp: Date.now()
        };
        setGameLogs(prevLogs => [...prevLogs, winnerLog]);
        
        // Update player chips
        const playersWithUpdatedChips = finalPlayers.map(player => {
          if (player.id === winningPlayer.id) {
            return {
              ...player,
              chips: player.chips + pot,
            };
          }
          return player;
        });
        
        setWinnerInfo({
          winner: winningPlayer,
          handDescription: winner.winningHand.description,
          handRank: winner.winningHand.rank,
          pot,
          bestHand: winner.winningHand.bestHand,
          isUser: winningPlayer.id === userId,
        });
        
        setPlayers(playersWithUpdatedChips);
      }
    }
    
    setIsGameActive(false);
  };
  
  // Start a new hand
  const startNewHand = () => {
    // Rotate dealer position
    const newDealerIndex = (dealerIndex + 1) % players.length;
    setDealerIndex(newDealerIndex);
    
    // Add log entry for new hand
    const newHandLog: LogEntry = {
      playerId: 'system',
      playerName: 'Dealer',
      action: 'starting new hand',
      timestamp: Date.now()
    };
    setGameLogs(prevLogs => [...prevLogs, newHandLog]);
    
    // Reset game state for new hand
    setCommunityCards([]);
    setPot(0);
    setCurrentBet(0);
    setGamePhase('');
    setIsGameActive(false);
    setShowdown(false);
    setWinnerInfo(null);
    
    // If any player is out of chips, they're removed from the game
    const playersWithChips = players.filter(p => p.chips > 0);
    
    // Check if game is over (user is out of chips or only user remains)
    const userPlayer = playersWithChips.find(p => p.id === userId);
    const aiPlayers = playersWithChips.filter(p => p.id !== userId);
    
    if (!userPlayer || aiPlayers.length === 0) {
      // Game over - reinitialize
      initializeGame();
    } else {
      // Continue with players who have chips
      setPlayers(playersWithChips);
    }
  };
  
  // Handle user actions
  const handleFold = () => handlePlayerAction('FOLD');
  const handleCheck = () => handlePlayerAction('CHECK');
  const handleCall = (amount: number) => handlePlayerAction('CALL', amount);
  const handleBet = (amount: number) => handlePlayerAction('BET', amount);
  const handleRaise = (amount: number) => handlePlayerAction('RAISE', amount);
  const handleAllIn = () => handlePlayerAction('ALL_IN');
  
  // Initialize game on first load
  useEffect(() => {
    initializeGame();
  }, [initializeGame]);
  
  // Player information for the current user
  const userPlayer = players.find(p => p.id === userId);
  const isUserTurn = userPlayer && currentPlayerIndex === players.indexOf(userPlayer);
  
  // Determine if user can check (no current bet or already matched the bet)
  const userContribution = playerContributions[userId] || 0;
  const canUserCheck = currentBet === 0 || userContribution === currentBet;
  
  // Toggle log visibility
  const toggleLogVisibility = () => {
    setIsLogVisible(!isLogVisible);
  };
  
  return (
    <div className="flex flex-col min-h-screen bg-gray-900">
      <header className="bg-gray-800 p-4 text-white flex justify-between items-center">
        <h1 className="text-2xl font-bold">Texas Hold'em Poker</h1>
        <button 
          onClick={toggleLogVisibility}
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
        >
          {isLogVisible ? 'Hide Log' : 'Show Log'}
        </button>
      </header>
      
      <main className="flex-grow flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-4xl">
          {!isGameActive && !winnerInfo && (
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
            players={players}
            communityCards={communityCards}
            pot={pot}
            currentPlayerIndex={currentPlayerIndex}
            dealerIndex={dealerIndex}
            gamePhase={gamePhase}
            userId={userId}
            showdown={showdown}
          />
          
          {isGameActive && userPlayer && isUserTurn && (
            <div className="mt-6">
              <ActionControls
                currentBet={currentBet}
                playerChips={userPlayer.chips}
                playerContribution={userContribution}
                isPlayerTurn={true}
                canCheck={canUserCheck}
                canRaise={currentBet > 0}
                onFold={handleFold}
                onCheck={handleCheck}
                onCall={handleCall}
                onBet={handleBet}
                onRaise={handleRaise}
                onAllIn={handleAllIn}
              />
            </div>
          )}
        </div>
      </main>
      
      <PlayerStatusBar
        players={players}
        currentPlayerIndex={currentPlayerIndex}
        dealerIndex={dealerIndex}
        playerContributions={playerContributions}
      />
      
      <GameLog 
        logs={gameLogs}
        isVisible={isLogVisible}
        onClose={() => setIsLogVisible(false)}
      />
      
      {winnerInfo && (
        <GameResult
          winner={winnerInfo.winner}
          handDescription={winnerInfo.handDescription}
          handRank={winnerInfo.handRank}
          pot={winnerInfo.pot}
          bestHand={winnerInfo.bestHand}
          isUser={winnerInfo.isUser}
          onPlayAgain={startNewHand}
        />
      )}
    </div>
  );
};

export default PokerGamePage; 