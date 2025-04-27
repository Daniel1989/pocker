import React from 'react';
import { Card as CardType } from '../lib/poker';

interface CardProps {
  card: CardType | null;
  faceDown?: boolean;
}

const getCardColor = (card: string): string => {
  if (!card) return '';
  const suit = card[1];
  return (suit === 'H' || suit === 'D') ? 'text-red-500' : 'text-black';
};

const getSuitSymbol = (suit: string): string => {
  switch (suit) {
    case 'H': return '♥';
    case 'D': return '♦';
    case 'C': return '♣';
    case 'S': return '♠';
    default: return '';
  }
};

const getValueDisplay = (value: string): string => {
  switch (value) {
    case 'T': return '10';
    case 'J': return 'J';
    case 'Q': return 'Q';
    case 'K': return 'K';
    case 'A': return 'A';
    default: return value;
  }
};

const Card: React.FC<CardProps> = ({ card, faceDown = false }) => {
  if (!card) return null;
  
  if (faceDown) {
    return (
      <div className="w-16 h-24 rounded-md bg-blue-800 border-2 border-white shadow-md m-1 flex items-center justify-center">
        <div className="bg-white h-16 w-10 rounded opacity-20"></div>
      </div>
    );
  }
  
  const value = card[0];
  const suit = card[1];
  const colorClass = getCardColor(card);
  
  return (
    <div className="w-16 h-24 rounded-md bg-white border-2 border-gray-300 shadow-md m-1 relative flex flex-col items-center justify-center">
      <div className={`absolute top-1 left-2 ${colorClass} text-sm font-bold`}>
        {getValueDisplay(value)}
      </div>
      <div className={`absolute bottom-1 right-2 ${colorClass} text-sm font-bold`}>
        {getValueDisplay(value)}
      </div>
      <div className={`text-2xl ${colorClass}`}>
        {getSuitSymbol(suit)}
      </div>
    </div>
  );
};

export default Card; 