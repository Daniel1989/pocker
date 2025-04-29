import { TexasHoldem } from 'poker-odds-calc';
import { type Card } from './types';
import { type PlayerState } from './types';

// Convert our card format to poker-odds-calc format
const convertCard = (card: Card): string => {
  const rank = card.rank.toUpperCase();
  const suit = card.suit.toLowerCase();
  return `${rank}${suit}`;
};

// Convert array of cards to poker-odds-calc format
const convertCards = (cards: Card[]): [string, string] => {
  if (cards.length !== 2) {
    throw new Error('Player must have exactly 2 cards');
  }
  return [convertCard(cards[0]), convertCard(cards[1])];
};

const convertCommunityCards = (cards: Card[]): string[] => {
  return cards.map(convertCard);
};

export const calculateWinProbability = (
  playerCards: Card[],
  opponentCards: Card[],
  communityCards: Card[] = []
): number => {
  const table = new TexasHoldem();
  
  table
    .addPlayer(convertCards(playerCards))
    .addPlayer(convertCards(opponentCards));

  if (communityCards.length > 0) {
    table.setBoard(convertCommunityCards(communityCards));
  }

  const result = table.calculate();
  const players = result.getPlayers();
  return Number(players[0].getWinsPercentageString().replace('%', '')) / 100;
};

// Helper function to get hand strength
export const getHandStrength = (
  playerCards: Card[],
  communityCards: Card[] = []
): number => {
  const table = new TexasHoldem();
  table.addPlayer(convertCards(playerCards));
  
  if (communityCards.length > 0) {
    table.setBoard(convertCommunityCards(communityCards));
  }

  const result = table.calculate();
  const players = result.getPlayers();
  return Number(players[0].getWinsPercentageString().replace('%', '')) / 100;
};

// These functions are no longer needed as poker-odds-calc handles card management
export function getRemainingCards(usedCards: string[]): string[] {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const suits = ['h', 'd', 'c', 's'];
  
  const allCards = ranks.flatMap(rank => 
    suits.map(suit => rank + suit)
  );
  
  return allCards.filter(card => !usedCards.includes(card));
}

export function shuffleArray<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
} 