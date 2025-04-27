import React from 'react';
import Card from './Card';
import { PlayerInfo } from './Player';
import { Card as CardType } from '../lib/poker';

interface GameResultProps {
  winner: PlayerInfo;
  handDescription: string;
  handRank: number;
  pot: number;
  bestHand: CardType[];
  isUser: boolean;
  onPlayAgain: () => void;
}

const GameResult: React.FC<GameResultProps> = ({
  winner,
  handDescription,
  handRank,
  pot,
  bestHand,
  isUser,
  onPlayAgain,
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-4 border-yellow-500 rounded-lg p-6 max-w-md w-full text-center">
        <h2 className="text-2xl font-bold text-white mb-2">
          {isUser ? 'You won!' : `${winner.name} wins!`}
        </h2>
        
        <div className="text-yellow-400 text-3xl font-bold mb-4">
          ${pot}
        </div>
        
        <div className="mb-4">
          <p className="text-white font-semibold">Winning Hand:</p>
          <p className="text-green-400 font-bold text-xl">{handDescription}</p>
        </div>
        
        <div className="flex justify-center mb-6">
          {bestHand.map((card, index) => (
            <Card key={index} card={card} />
          ))}
        </div>
        
        <button
          onClick={onPlayAgain}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-8 rounded-lg font-bold text-lg"
        >
          Play Again
        </button>
      </div>
    </div>
  );
};

export default GameResult; 