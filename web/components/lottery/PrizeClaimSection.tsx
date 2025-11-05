'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useLotteryProgram, WinnerRecord } from '@/hooks/useLotteryProgram';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

interface PrizeClaimSectionProps {
  weekNumber: number | null;
}

export const PrizeClaimSection: React.FC<PrizeClaimSectionProps> = ({ weekNumber }) => {
  const { publicKey } = useWallet();
  const { 
    fetchUserTickets, 
    fetchWeekState, 
    fetchWinnerRecord,
    claimPrize,
    isLoading 
  } = useLotteryProgram();
  
  const [userTickets, setUserTickets] = useState<any[]>([]);
  const [weekState, setWeekState] = useState<any>(null);
  const [winnerRecords, setWinnerRecords] = useState<Map<number, WinnerRecord>>(new Map());
  const [claimingTicket, setClaimingTicket] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Load user tickets and check for wins
  const loadUserData = useCallback(async () => {
    if (!publicKey || weekNumber === null) {
      setIsLoadingData(false);
      return;
    }

    try {
      setIsLoadingData(true);
      
      // Fetch user tickets and week state
      const [tickets, week] = await Promise.all([
        fetchUserTickets(weekNumber),
        fetchWeekState(weekNumber),
      ]);

      setUserTickets(tickets);
      setWeekState(week);

      // If numbers are drawn, check each ticket for wins
      if (week?.numbersDrawn && week?.winningNumbers?.length > 0) {
        const winners = new Map<number, WinnerRecord>();
        
        for (const ticket of tickets) {
          try {
            const ticketNum = ticket.ticketNumber.toNumber();
            const winnerRecord = await fetchWinnerRecord(weekNumber, ticketNum);
            if (winnerRecord) {
              winners.set(ticketNum, winnerRecord);
            }
          } catch (err) {
            // No winner record for this ticket (didn't win)
            console.log('No winner record for ticket:', ticket.ticketNumber.toNumber());
          }
        }
        
        setWinnerRecords(winners);
      }
    } catch (err: any) {
      console.error('Error loading user data:', err);
      setError('Failed to load your tickets');
    } finally {
      setIsLoadingData(false);
    }
  }, [publicKey, weekNumber, fetchUserTickets, fetchWeekState, fetchWinnerRecord]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // Handle prize claim
  const handleClaimPrize = async (ticketNumber: number) => {
    if (!weekNumber) return;

    setClaimingTicket(ticketNumber);
    setError(null);
    setSuccessMessage(null);

    try {
      await claimPrize(weekNumber, ticketNumber);
      
      setSuccessMessage('Prize claimed successfully! 🎉');
      
      // Reload data
      await loadUserData();
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      console.error('Claim error:', err);
      setError(err.message || 'Failed to claim prize');
    } finally {
      setClaimingTicket(null);
    }
  };

  // Calculate matches for a ticket
  const calculateMatches = (ticketNumbers: number[], winningNumbers: number[]): number => {
    return ticketNumbers.filter(num => winningNumbers.includes(num)).length;
  };

  if (!publicKey) {
    return (
      <div className="lottery-card">
        <div className="empty-state">
          <div className="empty-state-icon">🔐</div>
          <h3>Wallet Not Connected</h3>
          <p>Connect your wallet to view your tickets and prizes</p>
        </div>
      </div>
    );
  }

  if (isLoadingData) {
    return (
      <div className="lottery-card">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading your tickets...</p>
        </div>
      </div>
    );
  }

  if (userTickets.length === 0) {
    return (
      <div className="lottery-card">
        <div className="empty-state">
          <div className="empty-state-icon">🎫</div>
          <h3>No Tickets</h3>
          <p>You don't have any tickets for this week</p>
        </div>
      </div>
    );
  }

  const winningNumbers = weekState?.winningNumbers || [];
  const numbersDrawn = weekState?.numbersDrawn || false;
  const hasWinningTickets = winnerRecords.size > 0;

  return (
    <div className="prize-claim-container">
      <div className="lottery-card">
        <div className="lottery-card-header">
          <h3 className="lottery-card-title">🎫 Your Tickets</h3>
          <p className="lottery-card-subtitle">
            Week #{weekNumber} • {userTickets.length} ticket{userTickets.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Winning Summary */}
        {numbersDrawn && hasWinningTickets && (
          <div className="winning-summary">
            <div className="winning-summary-icon">🎉</div>
            <div className="winning-summary-content">
              <h4>Congratulations! You have {winnerRecords.size} winning ticket{winnerRecords.size !== 1 ? 's' : ''}!</h4>
              <p>Claim your prize{winnerRecords.size !== 1 ? 's' : ''} below</p>
            </div>
          </div>
        )}

        {/* Ticket List */}
        <div className="user-tickets-list">
          {userTickets.map((ticket) => {
            const ticketNum = ticket.ticketNumber.toNumber();
            const winnerRecord = winnerRecords.get(ticketNum);
            const isWinner = !!winnerRecord;
            const isClaimed = winnerRecord?.claimed || false;
            const matches = numbersDrawn ? calculateMatches(ticket.numbers, winningNumbers) : 0;
            const prizeAmount = winnerRecord ? Number(winnerRecord.prizeAmount) / LAMPORTS_PER_SOL : 0;

            return (
              <div 
                key={ticketNum}
                className={`user-ticket-card ${isWinner ? 'winner' : ''} ${isClaimed ? 'claimed' : ''}`}
              >
                <div className="user-ticket-header">
                  <div className="ticket-info">
                    <span className="ticket-label">Ticket #{ticketNum}</span>
                    {isWinner && !isClaimed && <span className="winner-badge">🏆 WINNER</span>}
                    {isClaimed && <span className="claimed-badge">✅ Claimed</span>}
                  </div>
                  {numbersDrawn && (
                    <div className="matches-badge">
                      {matches} Match{matches !== 1 ? 'es' : ''}
                    </div>
                  )}
                </div>

                {/* Ticket Numbers */}
                <div className="user-ticket-numbers">
                  {ticket.numbers.map((num: number) => {
                    const isMatch = winningNumbers.includes(num);
                    return (
                      <span 
                        key={num} 
                        className={`user-ticket-ball ${numbersDrawn ? (isMatch ? 'match' : 'no-match') : ''}`}
                      >
                        {num}
                      </span>
                    );
                  })}
                </div>

                {/* Prize Info & Claim Button */}
                {isWinner && (
                  <div className="prize-info">
                    <div className="prize-amount">
                      <span className="prize-label">Prize Amount:</span>
                      <span className="prize-value">{prizeAmount.toFixed(4)} SOL</span>
                    </div>
                    
                    {!isClaimed ? (
                      <button
                        className="claim-button"
                        onClick={() => handleClaimPrize(ticketNum)}
                        disabled={claimingTicket === ticketNum}
                      >
                        {claimingTicket === ticketNum ? (
                          <>
                            <span className="button-spinner"></span>
                            Claiming...
                          </>
                        ) : (
                          '💰 Claim Prize'
                        )}
                      </button>
                    ) : (
                      <div className="claimed-message">
                        <span className="claimed-icon">✅</span>
                        Prize Claimed Successfully
                      </div>
                    )}
                  </div>
                )}

                {/* No Win Message */}
                {numbersDrawn && !isWinner && matches > 0 && (
                  <div className="no-prize-message">
                    Close! {matches} match{matches !== 1 ? 'es' : ''} but not enough to win this time
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Winning Numbers Reference */}
        {numbersDrawn && winningNumbers.length > 0 && (
          <div className="winning-numbers-reference">
            <h4>Winning Numbers:</h4>
            <div className="reference-numbers">
              {winningNumbers.map((num: number, index: number) => (
                <span key={index} className="reference-ball">
                  {num}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Status Messages */}
        {!numbersDrawn && (
          <div className="info-message">
            <span className="info-icon">ℹ️</span>
            Numbers haven't been drawn yet. Check back after the draw!
          </div>
        )}
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="success-toast">
          <span className="toast-icon">🎉</span>
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-toast">
          <span className="toast-icon">⚠️</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="toast-close">✕</button>
        </div>
      )}
    </div>
  );
};