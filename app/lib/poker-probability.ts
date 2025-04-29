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

interface Player {
  id: string;
  cards: string[];
  folded: boolean;
}

// Convert card format from "As" to "A♠"
function convertCardFormat(card: string): string {
  // const suits: { [key: string]: string } = {
  //   's': '♠',
  //   'h': '♥',
  //   'd': '♦',
  //   'c': '♣'
  // };
  const suits: { [key: string]: string } = {
    's': 's',
    'h': 'h',
    'd': 'd',
    'c': 'c'
  };
  const rank = card[0].toUpperCase();
  const suit = suits[card[1].toLowerCase()];
  return `${rank}${suit}`;
}

// Convert array of cards to hand type
function convertToHand(cards: string[]): [string, string] {
  const formattedCards = cards.map(convertCardFormat);
  return formattedCards as [string, string];
}

// Calculate win probability for multiple players
export function calculateWinProbability(
  players: Player[],
  communityCards: string[],
  remainingCards: number = 0
): { [key: string]: number } {
  try {
    const game = new TexasHoldem();
    
    const activaPlayerIndex: number[] = []
    // Add active players to the game
    const activePlayers = players.filter((p, index) => {
      if (!p.folded && p.cards.length === 2) {
        activaPlayerIndex.push(index)
      }
      return !p.folded && p.cards.length === 2
    });
    
    // If only one active player, they have 100% win probability
    if (activePlayers.length === 1) {
      const result: { [key: string]: number } = {};
      players.forEach(p => {
        result[p.id] = p.folded ? 0 : 100;
      });
      return result;
    }

    // Add players to the game
    activePlayers.forEach(player => {
      game.addPlayer(convertToHand(player.cards));
    });

    // Add community cards if any
    if (communityCards.length > 0) {
      game.setBoard(convertToHand(communityCards));
    }

    // Calculate odds
    const result = game.calculate();
    const calcPlayers = result.getPlayers()
    
    // Map results back to player IDs
    const winProbabilities: { [key: string]: number } = {};
    let activeIndex = 0;
    players.forEach((player, index) => {
      if (player.folded) {
        winProbabilities[player.id] = 0;
      } else {
        // The result is an array of objects with getEquity() method
        // const equity = Array.isArray(result) && result[activeIndex] && typeof result[activeIndex].getEquity === 'function' 
        //   ? result[activeIndex].getEquity() 
        //   : 0;

        const activePlayerIndex = activaPlayerIndex.findIndex(i => i === index)
        winProbabilities[player.id] = calcPlayers[activePlayerIndex].getWinsPercentage();
        activeIndex++;
      }
    });

    return winProbabilities;
  } catch (error) {
    console.error('Error calculating win probability:', error);
    // Return 0% for all players on error
    return players.reduce((acc, player) => {
      acc[player.id] = 0;
      return acc;
    }, {} as { [key: string]: number });
  }
}

// Calculate hand strength (0-1)
export function getHandStrength(playerCards: string[], communityCards: string[]): number {
  try {
    const game = new TexasHoldem();
    game.addPlayer(convertToHand(playerCards));
    if (communityCards.length > 0) {
      game.setBoard(convertToHand(communityCards));
    }
    
    const result = game.calculate();
    // The result is an array of objects with getEquity() method
    const equity = Array.isArray(result) && result[0] && typeof result[0].getEquity === 'function'
      ? result[0].getEquity()
      : 0;
    return equity / 100;
  } catch (error) {
    console.error('Error calculating hand strength:', error);
    return 0;
  }
}

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