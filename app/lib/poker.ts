/**
 * Poker utilities for Texas Hold'em
 */

// Card suits and values
export const SUITS = ['H', 'D', 'C', 'S'] as const; // Hearts, Diamonds, Clubs, Spades
export const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;

export type Suit = typeof SUITS[number];
export type Value = typeof VALUES[number];
export type Card = `${Value}${Suit}`;

// Hand rankings
export enum HandRank {
  HighCard = 1,
  Pair = 2,
  TwoPair = 3,
  ThreeOfAKind = 4,
  Straight = 5,
  Flush = 6,
  FullHouse = 7,
  FourOfAKind = 8,
  StraightFlush = 9,
  RoyalFlush = 10,
}

// Hand rank descriptions
export const HandRankDescriptions: Record<HandRank, string> = {
  [HandRank.HighCard]: 'High Card',
  [HandRank.Pair]: 'Pair',
  [HandRank.TwoPair]: 'Two Pair',
  [HandRank.ThreeOfAKind]: 'Three of a Kind',
  [HandRank.Straight]: 'Straight',
  [HandRank.Flush]: 'Flush',
  [HandRank.FullHouse]: 'Full House',
  [HandRank.FourOfAKind]: 'Four of a Kind',
  [HandRank.StraightFlush]: 'Straight Flush',
  [HandRank.RoyalFlush]: 'Royal Flush',
};

// Generates a shuffled deck of cards
export function generateDeck(): Card[] {
  const deck: Card[] = [];
  
  // Create all possible cards
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push(`${value}${suit}` as Card);
    }
  }
  
  // Shuffle the deck using Fisher-Yates algorithm
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  return deck;
}

// Deal cards to players
export function dealCards(numPlayers: number, cardsPerPlayer: number = 2): { 
  playerCards: Card[][],
  remainingDeck: Card[]
} {
  const deck = generateDeck();
  const playerCards: Card[][] = [];
  
  // Deal cards to each player
  for (let i = 0; i < numPlayers; i++) {
    const hand: Card[] = [];
    for (let j = 0; j < cardsPerPlayer; j++) {
      hand.push(deck.pop() as Card);
    }
    playerCards.push(hand);
  }
  
  return {
    playerCards,
    remainingDeck: deck
  };
}

// Deal community cards
export function dealCommunityCards(deck: Card[], count: number): {
  communityCards: Card[],
  remainingDeck: Card[]
} {
  const communityCards = deck.slice(0, count);
  const remainingDeck = deck.slice(count);
  
  return {
    communityCards,
    remainingDeck
  };
}

// Card parsing and value extraction
function parseCard(card: Card): { value: Value, suit: Suit } {
  const value = card[0] as Value;
  const suit = card[1] as Suit;
  return { value, suit };
}

function getCardValue(value: Value): number {
  const valueMap: Record<Value, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return valueMap[value];
}

// Hand evaluation
export function evaluateHand(playerCards: Card[], communityCards: Card[]): {
  rank: HandRank,
  description: string,
  bestHand: Card[]
} {
  const allCards = [...playerCards, ...communityCards];
  
  // Convert cards to value-suit pairs and sort by value (descending)
  const parsedCards = allCards.map(parseCard)
    .sort((a, b) => getCardValue(b.value) - getCardValue(a.value));
  
  // Get all possible 5-card combinations
  const combinations = getCombinations(allCards, 5);
  
  let bestRank = HandRank.HighCard;
  let bestHand: Card[] = combinations[0];
  
  // Evaluate each combination
  for (const hand of combinations) {
    const result = evaluateSingleHand(hand);
    if (result.rank > bestRank) {
      bestRank = result.rank;
      bestHand = hand;
    }
  }
  
  return {
    rank: bestRank,
    description: HandRankDescriptions[bestRank],
    bestHand
  };
}

// Get all possible n-length combinations from array
function getCombinations<T>(array: T[], n: number): T[][] {
  if (n === 1) return array.map(item => [item]);
  
  const result: T[][] = [];
  for (let i = 0; i <= array.length - n; i++) {
    const head = array[i];
    const tailCombinations = getCombinations(
      array.slice(i + 1),
      n - 1
    );
    
    for (const tailCombo of tailCombinations) {
      result.push([head, ...tailCombo]);
    }
  }
  
  return result;
}

// Evaluate a single 5-card hand
function evaluateSingleHand(hand: Card[]): { rank: HandRank } {
  const parsedCards = hand.map(parseCard)
    .sort((a, b) => getCardValue(b.value) - getCardValue(a.value));
  
  // Check for flush (all same suit)
  const isFlush = parsedCards.every(card => card.suit === parsedCards[0].suit);
  
  // Check for straight (sequential values)
  const values = parsedCards.map(card => getCardValue(card.value));
  let isStraight = true;
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] !== values[i] + 1) {
      isStraight = false;
      break;
    }
  }
  
  // Special case for A-5 straight
  if (!isStraight && values[0] === 14) {
    const lowAceValues = [5, 4, 3, 2, 1];
    const aceValues = parsedCards.map(card => {
      const value = getCardValue(card.value);
      return value === 14 ? 1 : value;
    }).sort((a, b) => b - a);
    
    isStraight = aceValues.every((val, i) => val === lowAceValues[i]);
  }
  
  // Check for royal flush
  if (isFlush && isStraight && values[0] === 14 && values[4] === 10) {
    return { rank: HandRank.RoyalFlush };
  }
  
  // Check for straight flush
  if (isFlush && isStraight) {
    return { rank: HandRank.StraightFlush };
  }
  
  // Count occurrences of each value
  const valueCounts = new Map<number, number>();
  for (const value of values) {
    valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
  }
  
  // Check for four of a kind
  if (Array.from(valueCounts.values()).includes(4)) {
    return { rank: HandRank.FourOfAKind };
  }
  
  // Check for full house (three of a kind + pair)
  if (Array.from(valueCounts.values()).includes(3) && 
      Array.from(valueCounts.values()).includes(2)) {
    return { rank: HandRank.FullHouse };
  }
  
  // Check for flush
  if (isFlush) {
    return { rank: HandRank.Flush };
  }
  
  // Check for straight
  if (isStraight) {
    return { rank: HandRank.Straight };
  }
  
  // Check for three of a kind
  if (Array.from(valueCounts.values()).includes(3)) {
    return { rank: HandRank.ThreeOfAKind };
  }
  
  // Check for two pair
  if (Array.from(valueCounts.values()).filter(count => count === 2).length === 2) {
    return { rank: HandRank.TwoPair };
  }
  
  // Check for pair
  if (Array.from(valueCounts.values()).includes(2)) {
    return { rank: HandRank.Pair };
  }
  
  // Default to high card
  return { rank: HandRank.HighCard };
}

// Determine winning hand among multiple players
export function determineWinner(playerHands: { 
  userId: string, 
  cards: Card[], 
  folded: boolean 
}[], communityCards: Card[]): {
  winnerId: string,
  winningHand: {
    rank: HandRank,
    description: string,
    bestHand: Card[]
  }
} | null {
  // Filter out folded players
  const activePlayers = playerHands.filter(player => !player.folded);
  
  if (activePlayers.length === 0) {
    return null;
  }
  
  if (activePlayers.length === 1) {
    // Only one player left, they automatically win
    const winner = activePlayers[0];
    return {
      winnerId: winner.userId,
      winningHand: evaluateHand(winner.cards, communityCards)
    };
  }
  
  // Evaluate hands for all active players
  const evaluatedHands = activePlayers.map(player => ({
    userId: player.userId,
    evaluation: evaluateHand(player.cards, communityCards)
  }));
  
  // Sort by hand rank (highest first)
  evaluatedHands.sort((a, b) => b.evaluation.rank - a.evaluation.rank);
  
  // Get the highest rank
  const highestRank = evaluatedHands[0].evaluation.rank;
  
  // Filter players with the highest rank
  const playersWithHighestRank = evaluatedHands.filter(
    player => player.evaluation.rank === highestRank
  );
  
  // If only one player has the highest rank, they win
  if (playersWithHighestRank.length === 1) {
    return {
      winnerId: playersWithHighestRank[0].userId,
      winningHand: playersWithHighestRank[0].evaluation
    };
  }
  
  // Tiebreaker logic would go here for hands of the same rank
  // For now, just return the first player with the highest rank
  return {
    winnerId: playersWithHighestRank[0].userId,
    winningHand: playersWithHighestRank[0].evaluation
  };
} 