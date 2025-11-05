'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLotteryProgram } from '@/hooks/useLotteryProgram';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

interface CurrentWeekInfoProps {
  weekNumber: number | null;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

export const CurrentWeekInfo: React.FC<CurrentWeekInfoProps> = ({ weekNumber }) => {
  const { fetchWeekState, fetchLotteryState } = useLotteryProgram();
  
  const [weekState, setWeekState] = useState<any>(null);
  const [lotteryState, setLotteryState] = useState<any>(null);
  const [timeToSalesClose, setTimeToSalesClose] = useState<TimeRemaining | null>(null);
  const [timeToDraw, setTimeToDraw] = useState<TimeRemaining | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Calculate time remaining
  const calculateTimeRemaining = useCallback((targetTimestamp: number): TimeRemaining => {
    const total = targetTimestamp - Math.floor(currentTime / 1000);
    
    if (total <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
    }

    const days = Math.floor(total / (60 * 60 * 24));
    const hours = Math.floor((total % (60 * 60 * 24)) / (60 * 60));
    const minutes = Math.floor((total % (60 * 60)) / 60);
    const seconds = total % 60;

    return { days, hours, minutes, seconds, total };
  }, [currentTime]);

  // Load week data
  const loadWeekData = useCallback(async () => {
    if (weekNumber === null) return;

    try {
      setIsLoading(true);
      const [week, lottery] = await Promise.all([
        fetchWeekState(weekNumber),
        fetchLotteryState(),
      ]);
      
      setWeekState(week);
      setLotteryState(lottery);
    } catch (error) {
      console.error('Error loading week data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [weekNumber, fetchWeekState, fetchLotteryState]);

  // Initial load
  useEffect(() => {
    loadWeekData();
  }, [loadWeekData]);

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Calculate countdowns
  useEffect(() => {
    if (!weekState) return;

    const salesCloseTime = weekState.salesCloseTime?.toNumber() || 0;
    const drawTime = weekState.drawTime?.toNumber() || 0;

    setTimeToSalesClose(calculateTimeRemaining(salesCloseTime));
    setTimeToDraw(calculateTimeRemaining(drawTime));
  }, [weekState, calculateTimeRemaining]);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadWeekData();
    }, 30000);

    return () => clearInterval(interval);
  }, [loadWeekData]);

  if (isLoading) {
    return (
      <div className="current-week-loading">
        <div className="loading-spinner"></div>
        <p>Loading week information...</p>
      </div>
    );
  }

  if (!weekState) {
    return (
      <div className="lottery-card">
        <div className="empty-state">
          <div className="empty-state-icon">📅</div>
          <h3>No Active Week</h3>
          <p>The lottery week hasn't started yet. Check back soon!</p>
        </div>
      </div>
    );
  }

  const totalTickets = weekState.totalTicketsSold?.toNumber() || 0;
  const prizePool = Number(weekState.totalPrizePool || 0) / LAMPORTS_PER_SOL;
  const rollover = Number(weekState.rolloverAmount || 0) / LAMPORTS_PER_SOL;
  const totalPrizeWithRollover = prizePool + rollover;
  const winnersPrizePool = totalPrizeWithRollover * 0.8; // 80% to winners
  const adminFee = totalPrizeWithRollover * 0.2; // 20% to admin

  const salesOpen = weekState.salesOpen || false;
  const numbersDrawn = weekState.numbersDrawn || false;
  const winnersAnnounced = weekState.winnersAnnounced || false;
  const winningNumbers = weekState.winningNumbers || [];

  // Determine phase
  let currentPhase = 'Sales Open';
  let phaseColor = 'green';
  
  if (winnersAnnounced) {
    currentPhase = 'Week Complete';
    phaseColor = 'purple';
  } else if (numbersDrawn) {
    currentPhase = 'Numbers Drawn';
    phaseColor = 'blue';
  } else if (!salesOpen) {
    currentPhase = 'Sales Closed';
    phaseColor = 'orange';
  }

  return (
    <div className="current-week-container">
      {/* Phase Banner */}
      <div className={`phase-banner phase-${phaseColor}`}>
        <div className="phase-icon">
          {salesOpen && '🎫'}
          {!salesOpen && !numbersDrawn && '⏳'}
          {numbersDrawn && !winnersAnnounced && '🎲'}
          {winnersAnnounced && '🏆'}
        </div>
        <div className="phase-info">
          <h2 className="phase-title">{currentPhase}</h2>
          <p className="phase-subtitle">Week #{weekNumber}</p>
        </div>
      </div>

      {/* Countdown Timers */}
      {!winnersAnnounced && (
        <div className="countdown-section">
          <div className="lottery-card">
            {salesOpen && timeToSalesClose && timeToSalesClose.total > 0 ? (
              <>
                <h3 className="countdown-title">⏰ Sales Close In</h3>
                <div className="countdown-display">
                  {timeToSalesClose.days > 0 && (
                    <div className="countdown-unit">
                      <span className="countdown-value">{timeToSalesClose.days}</span>
                      <span className="countdown-label">Days</span>
                    </div>
                  )}
                  <div className="countdown-unit">
                    <span className="countdown-value">{String(timeToSalesClose.hours).padStart(2, '0')}</span>
                    <span className="countdown-label">Hours</span>
                  </div>
                  <div className="countdown-separator">:</div>
                  <div className="countdown-unit">
                    <span className="countdown-value">{String(timeToSalesClose.minutes).padStart(2, '0')}</span>
                    <span className="countdown-label">Minutes</span>
                  </div>
                  <div className="countdown-separator">:</div>
                  <div className="countdown-unit">
                    <span className="countdown-value">{String(timeToSalesClose.seconds).padStart(2, '0')}</span>
                    <span className="countdown-label">Seconds</span>
                  </div>
                </div>
              </>
            ) : !salesOpen && timeToDraw && timeToDraw.total > 0 ? (
              <>
                <h3 className="countdown-title">🎲 Draw Time In</h3>
                <div className="countdown-display">
                  {timeToDraw.days > 0 && (
                    <div className="countdown-unit">
                      <span className="countdown-value">{timeToDraw.days}</span>
                      <span className="countdown-label">Days</span>
                    </div>
                  )}
                  <div className="countdown-unit">
                    <span className="countdown-value">{String(timeToDraw.hours).padStart(2, '0')}</span>
                    <span className="countdown-label">Hours</span>
                  </div>
                  <div className="countdown-separator">:</div>
                  <div className="countdown-unit">
                    <span className="countdown-value">{String(timeToDraw.minutes).padStart(2, '0')}</span>
                    <span className="countdown-label">Minutes</span>
                  </div>
                  <div className="countdown-separator">:</div>
                  <div className="countdown-unit">
                    <span className="countdown-value">{String(timeToDraw.seconds).padStart(2, '0')}</span>
                    <span className="countdown-label">Seconds</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 className="countdown-title">⏰ Awaiting Draw</h3>
                <p className="countdown-message">The numbers will be drawn soon!</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Prize Pool */}
      <div className="lottery-card">
        <h3 className="section-title">💰 Prize Pool</h3>
        
        <div className="prize-pool-display">
          <div className="prize-pool-main">
            <span className="prize-pool-label">Total Prize Pool</span>
            <span className="prize-pool-amount">{totalPrizeWithRollover.toFixed(4)} SOL</span>
          </div>
          
          {rollover > 0 && (
            <div className="prize-pool-rollover">
              <span className="rollover-badge">🔄 Rollover: {rollover.toFixed(4)} SOL</span>
            </div>
          )}
        </div>

        <div className="prize-breakdown">
          <div className="breakdown-item">
            <div className="breakdown-bar">
              <div className="breakdown-fill" style={{ width: '80%' }}></div>
            </div>
            <div className="breakdown-info">
              <span className="breakdown-label">Winners (80%)</span>
              <span className="breakdown-value">{winnersPrizePool.toFixed(4)} SOL</span>
            </div>
          </div>
          
          <div className="breakdown-item">
            <div className="breakdown-bar admin">
              <div className="breakdown-fill" style={{ width: '20%' }}></div>
            </div>
            <div className="breakdown-info">
              <span className="breakdown-label">Admin Fee (20%)</span>
              <span className="breakdown-value">{adminFee.toFixed(4)} SOL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🎫</div>
          <div className="stat-content">
            <span className="stat-label">Tickets Sold</span>
            <span className="stat-value">{totalTickets.toLocaleString()}</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💵</div>
          <div className="stat-content">
            <span className="stat-label">Ticket Price</span>
            <span className="stat-value">0.01 SOL</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <span className="stat-label">Current Pool</span>
            <span className="stat-value">{prizePool.toFixed(4)} SOL</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <span className="stat-label">Match Numbers</span>
            <span className="stat-value">5 of 59</span>
          </div>
        </div>
      </div>

      {/* Winning Numbers */}
      {numbersDrawn && winningNumbers.length > 0 && (
        <div className="lottery-card">
          <h3 className="section-title">🎯 Winning Numbers</h3>
          <div className="winning-numbers-display">
            {winningNumbers.map((num: number, index: number) => (
              <div key={index} className="winning-ball">
                <span className="ball-number">{num}</span>
              </div>
            ))}
          </div>
          {winnersAnnounced && (
            <div className="winners-announced-badge">
              <span>✅ Winners Announced - Check Winners Tab to Claim!</span>
            </div>
          )}
        </div>
      )}

      {/* Status Timeline */}
      <div className="lottery-card">
        <h3 className="section-title">📋 Week Timeline</h3>
        <div className="timeline">
          <div className={`timeline-item ${salesOpen ? 'active' : 'completed'}`}>
            <div className="timeline-marker">
              {salesOpen ? '🔄' : '✅'}
            </div>
            <div className="timeline-content">
              <h4>Sales Open</h4>
              <p>Buy tickets for this week's draw</p>
            </div>
          </div>

          <div className={`timeline-item ${!salesOpen && !numbersDrawn ? 'active' : numbersDrawn ? 'completed' : ''}`}>
            <div className="timeline-marker">
              {!salesOpen && !numbersDrawn ? '🔄' : numbersDrawn ? '✅' : '⏳'}
            </div>
            <div className="timeline-content">
              <h4>Sales Closed</h4>
              <p>Waiting for number draw</p>
            </div>
          </div>

          <div className={`timeline-item ${numbersDrawn && !winnersAnnounced ? 'active' : winnersAnnounced ? 'completed' : ''}`}>
            <div className="timeline-marker">
              {numbersDrawn && !winnersAnnounced ? '🔄' : winnersAnnounced ? '✅' : '⏳'}
            </div>
            <div className="timeline-content">
              <h4>Numbers Drawn</h4>
              <p>Calculating winners</p>
            </div>
          </div>

          <div className={`timeline-item ${winnersAnnounced ? 'completed' : ''}`}>
            <div className="timeline-marker">
              {winnersAnnounced ? '✅' : '⏳'}
            </div>
            <div className="timeline-content">
              <h4>Winners Announced</h4>
              <p>Prizes ready to claim</p>
            </div>
          </div>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="refresh-section">
        <button 
          className="lottery-button-secondary"
          onClick={loadWeekData}
        >
          🔄 Refresh Data
        </button>
        <p className="refresh-note">Auto-refreshes every 30 seconds</p>
      </div>
    </div>
  );
};