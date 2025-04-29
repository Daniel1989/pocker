import { Card, evaluateHand, generateDeck, determineWinner } from './poker';

interface PlayerSimState {
  id: string;
  cards: Card[];
  folded: boolean;
}

const SIMULATION_COUNT = 1000;

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getRemainingCards(usedCards: Card[]): Card[] {
  const deck = generateDeck();
  return deck.filter(card => !usedCards.includes(card));
}

export function calculateWinProbability(
  players: PlayerSimState[],
  communityCards: Card[],
  remainingCommunityCards: number
): Record<string, number> {
  // Get all active players (not folded)
  const activePlayers = players.filter(p => !p.folded);
  
  // If only one player remains, they have 100% chance
  if (activePlayers.length === 1) {
    const probabilities: Record<string, number> = {};
    players.forEach(p => {
      probabilities[p.id] = p.folded ? 0 : 100;
    });
    return probabilities;
  }

  // Collect all cards currently in play
  const usedCards = [
    ...(communityCards || []),
    ...players.flatMap(p => p.cards || [])
  ].filter(card => card !== null && card !== undefined);

  // Get remaining cards that could be dealt
  const remainingCards = getRemainingCards(usedCards);

  // Track wins for each player
  const wins: Record<string, number> = {};
  players.forEach(p => wins[p.id] = 0);

  // Run Monte Carlo simulation
  for (let i = 0; i < SIMULATION_COUNT; i++) {
    // Shuffle remaining cards
    const shuffledRemaining = shuffleArray(remainingCards);
    
    // Deal remaining community cards for this simulation
    const simulatedCommunityCards = [
      ...(communityCards || []),
      ...shuffledRemaining.slice(0, remainingCommunityCards)
    ].filter(card => card !== null && card !== undefined);

    // Determine winner for this simulation
    const simPlayers = activePlayers.map(p => ({
      userId: p.id,
      cards: p.cards || [],
      folded: false
    }));

    const winner = determineWinner(simPlayers, simulatedCommunityCards);
    if (winner) {
      wins[winner.winnerId]++;
    }
  }

  // Convert win counts to percentages
  const probabilities: Record<string, number> = {};
  players.forEach(p => {
    probabilities[p.id] = p.folded ? 0 : (wins[p.id] / SIMULATION_COUNT) * 100;
  });

  return probabilities;
}

export function getHandStrength(playerCards: Card[], communityCards: Card[]): string {
  if (!playerCards || !Array.isArray(playerCards) || playerCards.length === 0) {
    return 'No hand';
  }

  const validPlayerCards = playerCards.filter(card => card !== null && card !== undefined);
  const validCommunityCards = (communityCards || []).filter(card => card !== null && card !== undefined);

  if (validPlayerCards.length === 0) {
    return 'No hand';
  }

  const result = evaluateHand([...validPlayerCards, ...validCommunityCards]);
  return result ? result.description : 'Incomplete hand';
} 