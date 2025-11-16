'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLotteryProgram } from '@/hooks/useLotteryProgram';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

interface WinningHistoryProps {
  currentWeekNumber: number | null;
}

interface HistoricalWeek {
  weekNumber: number;
  winningNumbers: number[];
  totalPrizePool: number;
  totalTicketsSold: number;
  winners: number;
  drawTime: number;
}

export const WinningHistory: React.FC<WinningHistoryProps> = ({ currentWeekNumber }) => {
  const { fetchWeekState, fetchWeekWinners } = useLotteryProgram();
  
  const [history, setHistory] = useState<HistoricalWeek[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [weeksToShow, setWeeksToShow] = useState(5);

  // Load historical data
  const loadHistory = useCallback(async () => {
    if (currentWeekNumber === null || currentWeekNumber === 0) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const historicalWeeks: HistoricalWeek[] = [];
      
      // Load the last N weeks (but not the current week if it's not complete)
      const weeksToLoad = Math.min(weeksToShow, currentWeekNumber);
      
      for (let i = currentWeekNumber - 1; i >= Math.max(1, currentWeekNumber - weeksToLoad); i--) {
        try {
          const weekState = await fetchWeekState(i);
          
          // Only include weeks where winners were announced
          if (weekState?.winnersAnnounced) {
            const winners = await fetchWeekWinners(i);
            
            historicalWeeks.push({
              weekNumber: i,
              winningNumbers: weekState.winningNumbers || [],
              totalPrizePool: Number(weekState.totalPrizePool || 0) / LAMPORTS_PER_SOL,
              totalTicketsSold: weekState.totalTicketsSold?.toNumber() || 0,
              winners: winners.length,
              drawTime: weekState.drawTime?.toNumber() || 0,
            });
          }
        } catch (err) {
          console.error(`Error loading week ${i}:`, err);
        }
      }
      
      setHistory(historicalWeeks);
    } catch (err) {
      console.error('Error loading history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentWeekNumber, weeksToShow, fetchWeekState, fetchWeekWinners]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Format date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Load more weeks
  const loadMoreWeeks = () => {
    setWeeksToShow(prev => prev + 5);
  };

  if (isLoading) {
    return (
      <div className="lottery-card">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading history...</p>
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="lottery-card">
        <div className="empty-state">
          <div className="empty-state-icon">📜</div>
          <h3>No History Yet</h3>
          <p>Past lottery results will appear here once draws are completed</p>
        </div>
      </div>
    );
  }

  return (
    <div className="winning-history-container">
      <div className="lottery-card">
        <div className="lottery-card-header">
          <h3 className="lottery-card-title">📜 Winning History</h3>
          <p className="lottery-card-subtitle">
            Past lottery results • {history.length} week{history.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* History List */}
        <div className="history-list">
          {history.map((week) => (
            <div 
              key={week.weekNumber}
              className={`history-item ${selectedWeek === week.weekNumber ? 'expanded' : ''}`}
              onClick={() => setSelectedWeek(selectedWeek === week.weekNumber ? null : week.weekNumber)}
            >
              {/* Week Header */}
              <div className="history-header">
                <div className="history-week-info">
                  <span className="history-week-number">Week #{week.weekNumber}</span>
                  <span className="history-date">{formatDate(week.drawTime)}</span>
                </div>
                <div className="history-quick-stats">
                  <span className="quick-stat">
                    <span className="stat-icon">🎫</span>
                    {week.totalTicketsSold}
                  </span>
                  <span className="quick-stat">
                    <span className="stat-icon">🏆</span>
                    {week.winners}
                  </span>
                  <span className="quick-stat">
                    <span className="stat-icon">💰</span>
                    {week.totalPrizePool.toFixed(2)} SOL
                  </span>
                </div>
                <button className="expand-button">
                  {selectedWeek === week.weekNumber ? '▼' : '▶'}
                </button>
              </div>

              {/* Winning Numbers - Always Visible */}
              <div className="history-winning-numbers">
                {week.winningNumbers.map((num, index) => (
                  <span key={index} className="history-ball">
                    {num}
                  </span>
                ))}
              </div>

              {/* Expanded Details */}
              {selectedWeek === week.weekNumber && (
                <div className="history-details">
                  <div className="details-grid">
                    <div className="detail-item">
                      <span className="detail-label">Total Tickets Sold</span>
                      <span className="detail-value">{week.totalTicketsSold.toLocaleString()}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Total Winners</span>
                      <span className="detail-value">{week.winners}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Prize Pool</span>
                      <span className="detail-value">{week.totalPrizePool.toFixed(4)} SOL</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Winners Share (80%)</span>
                      <span className="detail-value">{(week.totalPrizePool * 0.8).toFixed(4)} SOL</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Draw Date</span>
                      <span className="detail-value">{formatDate(week.drawTime)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Avg Prize per Winner</span>
                      <span className="detail-value">
                        {week.winners > 0 
                          ? ((week.totalPrizePool * 0.8) / week.winners).toFixed(4) 
                          : '0.0000'} SOL
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Load More Button */}
        {currentWeekNumber && history.length < currentWeekNumber - 1 && (
          <div className="load-more-section">
            <button 
              className="lottery-button-secondary"
              onClick={loadMoreWeeks}
            >
              📥 Load More History
            </button>
          </div>
        )}

        {/* Statistics Summary */}
        <div className="history-summary">
          <h4>All-Time Statistics</h4>
          <div className="summary-grid">
            <div className="summary-stat">
              <span className="summary-label">Total Weeks</span>
              <span className="summary-value">{history.length}</span>
            </div>
            <div className="summary-stat">
              <span className="summary-label">Total Tickets</span>
              <span className="summary-value">
                {history.reduce((sum, week) => sum + week.totalTicketsSold, 0).toLocaleString()}
              </span>
            </div>
            <div className="summary-stat">
              <span className="summary-label">Total Winners</span>
              <span className="summary-value">
                {history.reduce((sum, week) => sum + week.winners, 0)}
              </span>
            </div>
            <div className="summary-stat">
              <span className="summary-label">Total Prizes</span>
              <span className="summary-value">
                {history.reduce((sum, week) => sum + week.totalPrizePool, 0).toFixed(2)} SOL
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};