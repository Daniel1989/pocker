import React from 'react';

interface LogEntry {
  playerId: string;
  playerName: string;
  action: string;
  amount?: number;
  timestamp: number;
}

interface GameLogProps {
  logs: LogEntry[];
  isVisible: boolean;
  onClose: () => void;
}

const GameLog: React.FC<GameLogProps> = ({ logs, isVisible, onClose }) => {
  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-lg text-white z-40 overflow-hidden flex flex-col">
      <div className="bg-gray-800 px-4 py-2 flex justify-between items-center border-b border-gray-700">
        <h3 className="font-bold">Game Log</h3>
        <button 
          onClick={onClose}
          className="text-gray-400 hover:text-white focus:outline-none"
        >
          ×
        </button>
      </div>
      
      <div className="p-2 max-h-80 overflow-y-auto flex-1">
        {logs.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No actions yet</p>
        ) : (
          <ul className="space-y-1">
            {logs.map((log, index) => (
              <li key={index} className="text-sm border-b border-gray-800 pb-1 last:border-0">
                <span className="text-blue-400">{log.playerName}</span>
                <span className="text-gray-300"> {log.action}</span>
                {log.amount !== undefined && (
                  <span className="text-yellow-400"> ${log.amount}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default GameLog; 