'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLotteryProgram } from '@/hooks/useLotteryProgram';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

interface Ticket {
  id: string;
  numbers: number[];
  isLuckyDip: boolean;
}

interface LotteryTicketPurchaseProps {
  weekNumber: number | null;
}

const MAX_TICKETS = 100;
const TICKET_PRICE_SOL = 0.01;
const TICKET_PRICE_LAMPORTS = TICKET_PRICE_SOL * LAMPORTS_PER_SOL;

export const LotteryTicketPurchase: React.FC<LotteryTicketPurchaseProps> = ({ weekNumber }) => {
  const { buyTickets, isLoading, fetchWeekState } = useLotteryProgram();
  
  // Ticket basket
  const [tickets, setTickets] = useState<Ticket[]>([]);
  
  // Current ticket being created
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [editingTicketId, setEditingTicketId] = useState<string | null>(null);
  
  // UI state
  const [weekState, setWeekState] = useState<any>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load week state
  useEffect(() => {
    const loadWeekState = async () => {
      if (weekNumber !== null) {
        const state = await fetchWeekState(weekNumber);
        setWeekState(state);
      }
    };
    loadWeekState();
  }, [weekNumber, fetchWeekState]);

  // Generate random numbers for lucky dip
  const generateLuckyDip = useCallback((): number[] => {
    const numbers: number[] = [];
    while (numbers.length < 5) {
      const num = Math.floor(Math.random() * 59) + 1;
      if (!numbers.includes(num)) {
        numbers.push(num);
      }
    }
    return numbers.sort((a, b) => a - b);
  }, []);

  // Toggle number selection
  const toggleNumber = (num: number) => {
    if (selectedNumbers.includes(num)) {
      setSelectedNumbers(selectedNumbers.filter(n => n !== num));
    } else {
      if (selectedNumbers.length < 5) {
        setSelectedNumbers([...selectedNumbers, num].sort((a, b) => a - b));
      }
    }
  };

  // Add ticket to basket
  const addTicket = () => {
    if (selectedNumbers.length !== 5) {
      setError('Please select exactly 5 numbers');
      return;
    }

    if (tickets.length >= MAX_TICKETS) {
      setError(`Maximum ${MAX_TICKETS} tickets per cycle`);
      return;
    }

    // Check for duplicate tickets
    const isDuplicate = tickets.some(ticket => 
      JSON.stringify(ticket.numbers) === JSON.stringify(selectedNumbers)
    );

    if (isDuplicate) {
      setError('This ticket already exists in your basket');
      return;
    }

    if (editingTicketId) {
      // Update existing ticket
      setTickets(tickets.map(ticket => 
        ticket.id === editingTicketId 
          ? { ...ticket, numbers: selectedNumbers, isLuckyDip: false }
          : ticket
      ));
      setEditingTicketId(null);
    } else {
      // Add new ticket
      const newTicket: Ticket = {
        id: `ticket-${Date.now()}-${Math.random()}`,
        numbers: selectedNumbers,
        isLuckyDip: false,
      };
      setTickets([...tickets, newTicket]);
    }

    setSelectedNumbers([]);
    setError(null);
  };

  // Add lucky dip ticket
  const addLuckyDip = () => {
    if (tickets.length >= MAX_TICKETS) {
      setError(`Maximum ${MAX_TICKETS} tickets per cycle`);
      return;
    }

    const luckyNumbers = generateLuckyDip();
    
    // Check for duplicate tickets
    const isDuplicate = tickets.some(ticket => 
      JSON.stringify(ticket.numbers) === JSON.stringify(luckyNumbers)
    );

    if (isDuplicate) {
      // Try again with different numbers
      addLuckyDip();
      return;
    }

    const newTicket: Ticket = {
      id: `ticket-${Date.now()}-${Math.random()}`,
      numbers: luckyNumbers,
      isLuckyDip: true,
    };

    setTickets([...tickets, newTicket]);
    setError(null);
  };

  // Add multiple lucky dips
  const addMultipleLuckyDips = (count: number) => {
    const newTickets: Ticket[] = [];
    let attempts = 0;
    const maxAttempts = count * 10; // Prevent infinite loop

    while (newTickets.length < count && attempts < maxAttempts) {
      attempts++;
      
      if (tickets.length + newTickets.length >= MAX_TICKETS) {
        setError(`Maximum ${MAX_TICKETS} tickets per cycle`);
        break;
      }

      const luckyNumbers = generateLuckyDip();
      
      // Check for duplicates in both existing tickets and new tickets
      const isDuplicate = [...tickets, ...newTickets].some(ticket => 
        JSON.stringify(ticket.numbers) === JSON.stringify(luckyNumbers)
      );

      if (!isDuplicate) {
        newTickets.push({
          id: `ticket-${Date.now()}-${Math.random()}-${newTickets.length}`,
          numbers: luckyNumbers,
          isLuckyDip: true,
        });
      }
    }

    setTickets([...tickets, ...newTickets]);
    setError(null);
  };

  // Edit ticket
  const editTicket = (ticketId: string) => {
    const ticket = tickets.find(t => t.id === ticketId);
    if (ticket) {
      setSelectedNumbers(ticket.numbers);
      setEditingTicketId(ticketId);
    }
  };

  // Remove ticket
  const removeTicket = (ticketId: string) => {
    setTickets(tickets.filter(t => t.id !== ticketId));
    if (editingTicketId === ticketId) {
      setEditingTicketId(null);
      setSelectedNumbers([]);
    }
  };

  // Clear all tickets
  const clearAllTickets = () => {
    setTickets([]);
    setSelectedNumbers([]);
    setEditingTicketId(null);
    setError(null);
  };

  // Purchase all tickets
  const purchaseAllTickets = async () => {
    if (tickets.length === 0) {
      setError('No tickets to purchase');
      return;
    }

    if (!weekNumber) {
      setError('No active lottery week');
      return;
    }

    if (!weekState?.salesOpen) {
      setError('Ticket sales are closed for this week');
      return;
    }

    setIsPurchasing(true);
    setError(null);

    try {
      // Purchase each ticket sequentially
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        console.log(`Purchasing ticket ${i + 1}/${tickets.length}:`, ticket.numbers);
        
        await buyTickets(weekNumber, ticket.numbers);
        
        // Small delay between transactions to avoid rate limiting
        if (i < tickets.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Success!
      setPurchaseSuccess(true);
      setTickets([]);
      setSelectedNumbers([]);
      
      // Reset success message after 5 seconds
      setTimeout(() => setPurchaseSuccess(false), 5000);
    } catch (err: any) {
      console.error('Purchase error:', err);
      setError(err.message || 'Failed to purchase tickets');
    } finally {
      setIsPurchasing(false);
    }
  };

  const totalCost = tickets.length * TICKET_PRICE_SOL;

  return (
    <div className="ticket-purchase-container">
      {/* Week Status */}
      {weekState && (
        <div className="lottery-card mb-3">
          <div className="week-status">
            <div className="week-status-item">
              <span className="week-status-label">Sales Status:</span>
              <span className={`week-status-badge ${weekState.salesOpen ? 'open' : 'closed'}`}>
                {weekState.salesOpen ? '🟢 Open' : '🔴 Closed'}
              </span>
            </div>
            <div className="week-status-item">
              <span className="week-status-label">Tickets Sold:</span>
              <span className="week-status-value">{weekState.totalTicketsSold?.toString() || '0'}</span>
            </div>
            <div className="week-status-item">
              <span className="week-status-label">Prize Pool:</span>
              <span className="week-status-value">
                {(Number(weekState.totalPrizePool) / LAMPORTS_PER_SOL).toFixed(2)} SOL
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Number Selection */}
      <div className="lottery-card mb-3">
        <div className="lottery-card-header">
          <h3 className="lottery-card-title">
            {editingTicketId ? '✏️ Edit Ticket' : '🎯 Choose Your Numbers'}
          </h3>
          <p className="lottery-card-subtitle">
            Select 5 numbers from 1 to 59 {selectedNumbers.length > 0 && `(${selectedNumbers.length}/5 selected)`}
          </p>
        </div>

        {/* Number Grid */}
        <div className="number-grid">
          {Array.from({ length: 59 }, (_, i) => i + 1).map((num) => (
            <button
              key={num}
              className={`lottery-ball ${selectedNumbers.includes(num) ? 'selected' : ''}`}
              onClick={() => toggleNumber(num)}
              disabled={!selectedNumbers.includes(num) && selectedNumbers.length >= 5}
            >
              <span className="ball-number">{num}</span>
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="ticket-actions">
          <button
            className="lottery-button"
            onClick={addTicket}
            disabled={selectedNumbers.length !== 5}
          >
            {editingTicketId ? '✅ Update Ticket' : '➕ Add to Basket'}
          </button>
          
          {editingTicketId && (
            <button
              className="lottery-button-secondary"
              onClick={() => {
                setEditingTicketId(null);
                setSelectedNumbers([]);
              }}
            >
              ❌ Cancel Edit
            </button>
          )}

          <button
            className="lottery-button-secondary"
            onClick={() => setSelectedNumbers([])}
            disabled={selectedNumbers.length === 0}
          >
            🔄 Clear Selection
          </button>
        </div>
      </div>

      {/* Lucky Dip */}
      <div className="lottery-card mb-3">
        <div className="lottery-card-header">
          <h3 className="lottery-card-title">🍀 Lucky Dip</h3>
          <p className="lottery-card-subtitle">
            Let fate choose your numbers automatically
          </p>
        </div>

        <div className="lucky-dip-actions">
          <button
            className="lottery-button"
            onClick={addLuckyDip}
            disabled={tickets.length >= MAX_TICKETS}
          >
            🎲 Add 1 Lucky Dip
          </button>
          
          <button
            className="lottery-button"
            onClick={() => addMultipleLuckyDips(5)}
            disabled={tickets.length >= MAX_TICKETS - 4}
          >
            🎲 Add 5 Lucky Dips
          </button>
          
          <button
            className="lottery-button"
            onClick={() => addMultipleLuckyDips(10)}
            disabled={tickets.length >= MAX_TICKETS - 9}
          >
            🎲 Add 10 Lucky Dips
          </button>
        </div>
      </div>

      {/* Ticket Basket */}
      <div className="lottery-card">
        <div className="lottery-card-header">
          <h3 className="lottery-card-title">🛒 Your Basket</h3>
          <p className="lottery-card-subtitle">
            {tickets.length} ticket{tickets.length !== 1 ? 's' : ''} ({tickets.length}/{MAX_TICKETS})
          </p>
        </div>

        {tickets.length === 0 ? (
          <div className="empty-basket">
            <div className="empty-basket-icon">🎫</div>
            <p>No tickets yet. Choose your numbers or try a Lucky Dip!</p>
          </div>
        ) : (
          <>
            {/* Ticket List */}
            <div className="ticket-list">
              {tickets.map((ticket, index) => (
                <div key={ticket.id} className="ticket-item">
                  <div className="ticket-item-header">
                    <span className="ticket-number">Ticket #{index + 1}</span>
                    {ticket.isLuckyDip && <span className="lucky-dip-badge">🍀 Lucky Dip</span>}
                  </div>
                  
                  <div className="ticket-numbers">
                    {ticket.numbers.map((num) => (
                      <span key={num} className="ticket-ball">
                        {num}
                      </span>
                    ))}
                  </div>
                  
                  <div className="ticket-item-actions">
                    <button
                      className="ticket-action-btn edit"
                      onClick={() => editTicket(ticket.id)}
                      title="Edit ticket"
                    >
                      ✏️
                    </button>
                    <button
                      className="ticket-action-btn remove"
                      onClick={() => removeTicket(ticket.id)}
                      title="Remove ticket"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Purchase Summary */}
            <div className="purchase-summary">
              <div className="summary-row">
                <span className="summary-label">Total Tickets:</span>
                <span className="summary-value">{tickets.length}</span>
              </div>
              <div className="summary-row">
                <span className="summary-label">Price per Ticket:</span>
                <span className="summary-value">{TICKET_PRICE_SOL} SOL</span>
              </div>
              <div className="summary-row total">
                <span className="summary-label">Total Cost:</span>
                <span className="summary-value">{totalCost.toFixed(2)} SOL</span>
              </div>
            </div>

            {/* Purchase Buttons */}
            <div className="purchase-actions">
              <button
                className="lottery-button"
                onClick={purchaseAllTickets}
                disabled={isPurchasing || !weekState?.salesOpen}
              >
                {isPurchasing ? '⏳ Purchasing...' : `💳 Purchase ${tickets.length} Ticket${tickets.length !== 1 ? 's' : ''}`}
              </button>
              
              <button
                className="lottery-button-secondary"
                onClick={clearAllTickets}
                disabled={isPurchasing}
              >
                🗑️ Clear All
              </button>
            </div>
          </>
        )}
      </div>

      {/* Success Message */}
      {purchaseSuccess && (
        <div className="success-message">
          <div className="success-icon">🎉</div>
          <h4>Tickets Purchased Successfully!</h4>
          <p>Good luck in the draw! Check the Winners tab to see if you won.</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <div className="error-icon">⚠️</div>
          <p>{error}</p>
          <button onClick={() => setError(null)} className="error-close">✕</button>
        </div>
      )}
    </div>
  );
};