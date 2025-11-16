"use client";

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useLotteryProgram } from '@/hooks/useLotteryProgram';
import { Sparkles, Shuffle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface LotteryTicketPurchaseProps {
  weekNumber: number | null;
}

export function LotteryTicketPurchase({ weekNumber }: LotteryTicketPurchaseProps) {
  const { publicKey } = useWallet();
  const { buyTickets, isLoading } = useLotteryProgram();
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);

  // Organize numbers into rows
  const numberRows = [
    { range: '1-9', numbers: Array.from({ length: 9 }, (_, i) => i + 1) },
    { range: '10-19', numbers: Array.from({ length: 10 }, (_, i) => i + 10) },
    { range: '20-29', numbers: Array.from({ length: 10 }, (_, i) => i + 20) },
    { range: '30-39', numbers: Array.from({ length: 10 }, (_, i) => i + 30) },
    { range: '40-49', numbers: Array.from({ length: 10 }, (_, i) => i + 40) },
    { range: '50-59', numbers: Array.from({ length: 10 }, (_, i) => i + 50) },
  ];

  const toggleNumber = (num: number) => {
    if (selectedNumbers.includes(num)) {
      setSelectedNumbers(selectedNumbers.filter(n => n !== num));
    } else if (selectedNumbers.length < 5) {
      setSelectedNumbers([...selectedNumbers, num]);
    } else {
      toast.error('Maximum 5 numbers allowed');
    }
  };

  const luckyDip = () => {
    const numbers: number[] = [];
    while (numbers.length < 5) {
      const random = Math.floor(Math.random() * 59) + 1;
      if (!numbers.includes(random)) {
        numbers.push(random);
      }
    }
    setSelectedNumbers(numbers.sort((a, b) => a - b));
    toast.success('Lucky numbers generated!');
  };

  const clearSelection = () => {
    setSelectedNumbers([]);
  };

  const handleBuyTicket = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet');
      return;
    }

    if (!weekNumber) {
      toast.error('No active lottery week');
      return;
    }

    if (selectedNumbers.length !== 5) {
      toast.error('Please select exactly 5 numbers');
      return;
    }

    try {
      const { tx, ticketNumber } = await buyTickets(weekNumber, selectedNumbers);
      toast.success('Ticket purchased successfully!', {
        description: `Ticket #${ticketNumber} - TX: ${tx.slice(0, 8)}...`,
      });
      setSelectedNumbers([]);
    } catch (error: any) {
      toast.error('Failed to purchase ticket', {
        description: error.message,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Pick Your Lucky Numbers
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Select 5 numbers to play this week's lottery
        </p>
      </div>

      {/* Selected Numbers Display */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg p-6 border-2 border-indigo-200 dark:border-indigo-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span className="font-semibold text-gray-900 dark:text-white">
              Your Numbers: {selectedNumbers.length}/5
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={luckyDip}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:from-green-700 hover:to-emerald-700 transition-all hover-scale-102 text-sm disabled:opacity-50"
            >
              <Shuffle className="w-4 h-4" />
              Lucky Dip
            </button>
            <button
              onClick={clearSelection}
              disabled={selectedNumbers.length === 0 || isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-all hover-scale-102 text-sm disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>
        
        <div className="flex gap-3 flex-wrap justify-center min-h-[80px] items-center">
          {selectedNumbers.length === 0 ? (
            <span className="text-gray-500 dark:text-gray-400 italic">
              No numbers selected yet
            </span>
          ) : (
            selectedNumbers.sort((a, b) => a - b).map((num) => (
              <div
                key={num}
                className="lottery-ball-selected"
              >
                <div className="lottery-ball-number">{num}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3D Lottery Ball Number Picker */}
      <div className="space-y-4">
        {numberRows.map((row) => (
          <div key={row.range} className="space-y-2">
            <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 pl-2">
              {row.range}
            </div>
            <div className="grid grid-cols-9 sm:grid-cols-10 gap-3">
              {row.numbers.map((num) => {
                const isSelected = selectedNumbers.includes(num);
                return (
                  <button
                    key={num}
                    onClick={() => toggleNumber(num)}
                    disabled={!isSelected && selectedNumbers.length >= 5}
                    className={`lottery-ball ${isSelected ? 'lottery-ball-active' : ''}`}
                  >
                    <div className="lottery-ball-inner">
                      <div className="lottery-ball-front">
                        <span className="lottery-ball-number">{num}</span>
                      </div>
                      <div className="lottery-ball-shine"></div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Buy Button */}
      <div className="pt-4">
        <button
          onClick={handleBuyTicket}
          disabled={isLoading || selectedNumbers.length !== 5 || !publicKey}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-lg font-bold text-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover-scale-102 shadow-lg"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Processing...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5" />
              Buy Ticket - 0.01 SOL
            </span>
          )}
        </button>
      </div>

      <style jsx>{`
        .lottery-ball {
          position: relative;
          aspect-ratio: 1;
          border: none;
          background: transparent;
          cursor: pointer;
          padding: 0;
          transition: transform 0.3s ease;
        }

        .lottery-ball:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .lottery-ball:not(:disabled):hover {
          transform: scale(1.15) translateY(-2px);
        }

        .lottery-ball-inner {
          position: relative;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: linear-gradient(145deg, #e0e0e0, #ffffff);
          box-shadow: 
            0 8px 16px rgba(0, 0, 0, 0.15),
            inset 0 -2px 8px rgba(0, 0, 0, 0.1),
            inset 0 2px 8px rgba(255, 255, 255, 0.8);
          transition: all 0.3s ease;
        }

        .dark .lottery-ball-inner {
          background: linear-gradient(145deg, #2a2a2a, #3a3a3a);
          box-shadow: 
            0 8px 16px rgba(0, 0, 0, 0.4),
            inset 0 -2px 8px rgba(0, 0, 0, 0.3),
            inset 0 2px 8px rgba(255, 255, 255, 0.1);
        }

        .lottery-ball-front {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          z-index: 2;
        }

        .lottery-ball-number {
          font-size: clamp(0.875rem, 2vw, 1.125rem);
          font-weight: 800;
          color: #4f46e5;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }

        .dark .lottery-ball-number {
          color: #818cf8;
        }

        .lottery-ball-shine {
          position: absolute;
          top: 15%;
          left: 20%;
          width: 35%;
          height: 35%;
          background: radial-gradient(
            circle at 30% 30%,
            rgba(255, 255, 255, 0.8),
            rgba(255, 255, 255, 0.3) 50%,
            transparent 70%
          );
          border-radius: 50%;
          z-index: 3;
          pointer-events: none;
        }

        .lottery-ball-active .lottery-ball-inner {
          background: linear-gradient(145deg, #6366f1, #8b5cf6);
          box-shadow: 
            0 12px 24px rgba(99, 102, 241, 0.4),
            inset 0 -2px 8px rgba(0, 0, 0, 0.2),
            inset 0 2px 8px rgba(255, 255, 255, 0.3),
            0 0 20px rgba(139, 92, 246, 0.5);
          transform: scale(1.1);
        }

        .lottery-ball-active .lottery-ball-number {
          color: #ffffff;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }

        .lottery-ball-active .lottery-ball-shine {
          background: radial-gradient(
            circle at 30% 30%,
            rgba(255, 255, 255, 0.9),
            rgba(255, 255, 255, 0.4) 50%,
            transparent 70%
          );
        }

        .lottery-ball-selected {
          position: relative;
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: linear-gradient(145deg, #6366f1, #8b5cf6);
          box-shadow: 
            0 8px 16px rgba(99, 102, 241, 0.4),
            inset 0 -2px 8px rgba(0, 0, 0, 0.2),
            inset 0 2px 8px rgba(255, 255, 255, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          animation: ballPop 0.3s ease;
        }

        .lottery-ball-selected::before {
          content: '';
          position: absolute;
          top: 15%;
          left: 20%;
          width: 35%;
          height: 35%;
          background: radial-gradient(
            circle at 30% 30%,
            rgba(255, 255, 255, 0.9),
            rgba(255, 255, 255, 0.4) 50%,
            transparent 70%
          );
          border-radius: 50%;
        }

        .lottery-ball-selected .lottery-ball-number {
          font-size: 1.5rem;
          font-weight: 800;
          color: #ffffff;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          z-index: 2;
        }

        @keyframes ballPop {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.2);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @media (max-width: 640px) {
          .lottery-ball-selected {
            width: 50px;
            height: 50px;
          }
          
          .lottery-ball-selected .lottery-ball-number {
            font-size: 1.25rem;
          }
        }
      `}</style>
    </div>
  );
}