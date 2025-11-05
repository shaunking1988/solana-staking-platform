use anchor_lang::prelude::*;

declare_id!("Gu7AoXQqr2PsED9FwYeSwedUx8NKSwvbZUvrWyczBhqx");

#[program]
pub mod lottery {
    use super::*;

    /// Initialize the lottery program (one-time setup)
    pub fn initialize(ctx: Context<Initialize>, admin: Pubkey) -> Result<()> {
        let lottery_state = &mut ctx.accounts.lottery_state;
        lottery_state.admin = admin;
        lottery_state.current_week = 0;
        lottery_state.total_tickets_sold = 0;
        lottery_state.total_prizes_claimed = 0;
        lottery_state.bump = ctx.bumps.lottery_state;
        
        msg!("Lottery initialized with admin: {}", admin);
        Ok(())
    }

    /// Start a new weekly lottery (cron job calls this Monday 00:00 UTC)
    pub fn start_week(ctx: Context<StartWeek>) -> Result<()> {
        let lottery_state = &mut ctx.accounts.lottery_state;
        let week_state = &mut ctx.accounts.week_state;
        let clock = Clock::get()?;

        // Calculate week number based on Unix timestamp
        let current_week = (clock.unix_timestamp / 604800) as u64; // 604800 = seconds in a week
        
        require!(
            current_week > lottery_state.current_week,
            LotteryError::WeekAlreadyStarted
        );

        // Initialize new week
        week_state.week_number = current_week;
        week_state.start_time = clock.unix_timestamp;
        week_state.draw_time = 0;
        week_state.ticket_sales_open = true;
        week_state.winning_numbers = [0; 5];
        week_state.total_tickets = 0;
        week_state.prize_pool = 0;
        week_state.rollover_amount = lottery_state.rollover_jackpot;
        week_state.tier_winners = [0; 4];
        week_state.tier_prizes = [0; 4];
        week_state.drawn = false;
        week_state.bump = ctx.bumps.week_state;

        // Update global state
        lottery_state.current_week = current_week;
        lottery_state.rollover_jackpot = 0; // Reset after applying to this week

        msg!("Week {} started with rollover: {}", current_week, week_state.rollover_amount);
        Ok(())
    }

    /// Buy lottery tickets (users call this)
    pub fn buy_tickets(
        ctx: Context<BuyTickets>,
        ticket_numbers: Vec<[u8; 5]>,
    ) -> Result<()> {
        let week_state = &mut ctx.accounts.week_state;
        let lottery_state = &mut ctx.accounts.lottery_state;
        let user_tickets = &mut ctx.accounts.user_tickets;
        let clock = Clock::get()?;

        // Validation
        require!(week_state.ticket_sales_open, LotteryError::SalesClosed);
        require!(!ticket_numbers.is_empty(), LotteryError::NoTickets);
        require!(ticket_numbers.len() <= 100, LotteryError::TooManyTickets);

        // Validate each ticket (5 numbers, 1-59, no duplicates)
        for ticket in &ticket_numbers {
            validate_ticket_numbers(ticket)?;
        }

        let num_tickets = ticket_numbers.len() as u64;
        let total_cost = num_tickets * 10_000_000; // 0.01 SOL per ticket
        let admin_fee = total_cost * 20 / 100; // 20%
        let prize_amount = total_cost - admin_fee; // 80%

        // Transfer SOL from user to prize vault
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.prize_vault.key(),
            prize_amount,
        );
        anchor_lang::solana_program::program::invoke(
            &transfer_ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.prize_vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Transfer admin fee
        let admin_transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.admin_wallet.key(),
            admin_fee,
        );
        anchor_lang::solana_program::program::invoke(
            &admin_transfer_ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.admin_wallet.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // Initialize or update user tickets account
        if user_tickets.tickets.is_empty() {
            user_tickets.user = ctx.accounts.user.key();
            user_tickets.week_number = week_state.week_number;
        }

        // Add tickets
        for ticket in ticket_numbers {
            user_tickets.tickets.push(UserTicket {
                numbers: ticket,
                purchase_time: clock.unix_timestamp,
                claimed: false,
                prize_tier: 0,
                prize_amount: 0,
            });
        }

        // Update week state
        week_state.total_tickets += num_tickets;
        week_state.prize_pool += prize_amount;

        // Update global stats
        lottery_state.total_tickets_sold += num_tickets;

        msg!("User {} bought {} tickets for {} lamports", 
            ctx.accounts.user.key(), num_tickets, total_cost);

        Ok(())
    }

    /// Close ticket sales (cron job calls this Sunday 23:00 UTC)
    pub fn close_sales(ctx: Context<CloseSales>) -> Result<()> {
        let week_state = &mut ctx.accounts.week_state;
        
        require!(week_state.ticket_sales_open, LotteryError::AlreadyClosed);
        
        week_state.ticket_sales_open = false;
        
        msg!("Ticket sales closed for week {}", week_state.week_number);
        Ok(())
    }

    /// Draw winning numbers using VRF (cron job calls this Sunday 23:30 UTC)
    /// NOTE: This is simplified - in production you'd integrate Switchboard VRF here
    pub fn draw_numbers(ctx: Context<DrawNumbers>, vrf_result: [u8; 32]) -> Result<()> {
        let week_state = &mut ctx.accounts.week_state;
        let clock = Clock::get()?;

        require!(!week_state.ticket_sales_open, LotteryError::SalesStillOpen);
        require!(!week_state.drawn, LotteryError::AlreadyDrawn);

        // Convert VRF randomness to 5 numbers (1-59)
        let mut winning_numbers = [0u8; 5];
        for i in 0..5 {
            // Use different bytes from VRF result for each number
            let random_value = u32::from_le_bytes([
                vrf_result[i * 4],
                vrf_result[i * 4 + 1],
                vrf_result[i * 4 + 2],
                vrf_result[i * 4 + 3],
            ]);
            winning_numbers[i] = ((random_value % 59) + 1) as u8;
        }

        // Ensure no duplicate numbers
        winning_numbers.sort();
        for i in 1..5 {
            if winning_numbers[i] == winning_numbers[i - 1] {
                // Add 1 and wrap around if needed
                winning_numbers[i] = ((winning_numbers[i] % 59) + 1) as u8;
            }
        }

        week_state.winning_numbers = winning_numbers;
        week_state.draw_time = clock.unix_timestamp;
        week_state.drawn = true;

        msg!("Winning numbers drawn for week {}: {:?}", 
            week_state.week_number, winning_numbers);

        Ok(())
    }

    /// Announce winners and calculate prizes (cron job scans all tickets off-chain)
    pub fn announce_winners(
        ctx: Context<AnnounceWinners>,
        tier_winner_counts: [u32; 4], // [tier5, tier4, tier3, tier2]
    ) -> Result<()> {
        let week_state = &mut ctx.accounts.week_state;

        require!(week_state.drawn, LotteryError::NotDrawnYet);

        // Calculate prize distribution
        let total_pool = week_state.prize_pool + week_state.rollover_amount;
        
        // Prize percentages: Tier5=50%, Tier4=25%, Tier3=15%, Tier2=10%
        let tier_percentages = [50, 25, 15, 10];
        
        for i in 0..4 {
            week_state.tier_winners[i] = tier_winner_counts[i];
            
            if tier_winner_counts[i] > 0 {
                // Distribute this tier's prize among winners
                let tier_pool = total_pool * tier_percentages[i] / 100;
                week_state.tier_prizes[i] = tier_pool / tier_winner_counts[i] as u64;
            } else {
                // No winners in this tier - rolls over
                week_state.tier_prizes[i] = 0;
            }
        }

        msg!("Winners announced for week {}: {:?}", 
            week_state.week_number, tier_winner_counts);

        Ok(())
    }

    /// Create winner record (called by cron for each winner)
    pub fn create_winner_record(
        ctx: Context<CreateWinnerRecord>,
        ticket_index: u32,
        match_count: u8,
        prize_amount: u64,
    ) -> Result<()> {
        let winner_record = &mut ctx.accounts.winner_record;
        let week_state = &ctx.accounts.week_state;
        let user_tickets = &ctx.accounts.user_tickets;
        let clock = Clock::get()?;

        require!(week_state.drawn, LotteryError::NotDrawnYet);
        require!(match_count >= 2 && match_count <= 5, LotteryError::InvalidMatchCount);
        require!(ticket_index < user_tickets.tickets.len() as u32, LotteryError::InvalidTicketIndex);

        winner_record.week_number = week_state.week_number;
        winner_record.user = ctx.accounts.user.key();
        winner_record.ticket_index = ticket_index;
        winner_record.numbers = user_tickets.tickets[ticket_index as usize].numbers;
        winner_record.match_count = match_count;
        winner_record.prize_amount = prize_amount;
        winner_record.claimed = false;
        winner_record.claim_time = 0;
        winner_record.created_at = clock.unix_timestamp;
        winner_record.bump = ctx.bumps.winner_record;

        msg!("Winner record created: user={}, matches={}, prize={}", 
            ctx.accounts.user.key(), match_count, prize_amount);

        Ok(())
    }

    /// Claim prize (user calls this)
    pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
        let winner_record = &mut ctx.accounts.winner_record;
        let week_state = &ctx.accounts.week_state;
        let lottery_state = &mut ctx.accounts.lottery_state;
        let clock = Clock::get()?;

        require!(!winner_record.claimed, LotteryError::AlreadyClaimed);
        require!(week_state.drawn, LotteryError::NotDrawnYet);

        // Check 30-day claim window
        let days_since_draw = (clock.unix_timestamp - week_state.draw_time) / 86400;
        require!(days_since_draw <= 30, LotteryError::ClaimExpired);

        // Transfer prize from vault to user
        **ctx.accounts.prize_vault.to_account_info().try_borrow_mut_lamports()? -= winner_record.prize_amount;
        **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += winner_record.prize_amount;

        winner_record.claimed = true;
        winner_record.claim_time = clock.unix_timestamp;
        lottery_state.total_prizes_claimed += winner_record.prize_amount;

        msg!("Prize claimed: user={}, amount={}", 
            ctx.accounts.user.key(), winner_record.prize_amount);

        Ok(())
    }

    /// Calculate rollover (cron job calls this Sunday 23:50 UTC)
    pub fn calculate_rollover(ctx: Context<CalculateRollover>) -> Result<()> {
        let week_state = &ctx.accounts.week_state;
        let lottery_state = &mut ctx.accounts.lottery_state;

        require!(week_state.drawn, LotteryError::NotDrawnYet);

        let mut rollover_amount = week_state.rollover_amount;

        // Add unclaimed prize pools to rollover
        let tier_percentages = [50, 25, 15, 10];
        let total_pool = week_state.prize_pool + week_state.rollover_amount;

        for i in 0..4 {
            if week_state.tier_winners[i] == 0 {
                // No winners - add to rollover
                rollover_amount += total_pool * tier_percentages[i] / 100;
            }
        }

        lottery_state.rollover_jackpot = rollover_amount;

        msg!("Rollover calculated for next week: {}", rollover_amount);

        Ok(())
    }

    /// Reclaim unclaimed prizes after 30 days (cron job calls this daily)
    pub fn reclaim_unclaimed(ctx: Context<ReclaimUnclaimed>) -> Result<()> {
        let winner_record = &mut ctx.accounts.winner_record;
        let week_state = &ctx.accounts.week_state;
        let clock = Clock::get()?;

        require!(!winner_record.claimed, LotteryError::AlreadyClaimed);

        // Check if 30 days passed
        let days_since_draw = (clock.unix_timestamp - week_state.draw_time) / 86400;
        require!(days_since_draw > 30, LotteryError::ClaimNotExpired);

        // Transfer unclaimed prize to admin
        **ctx.accounts.prize_vault.to_account_info().try_borrow_mut_lamports()? -= winner_record.prize_amount;
        **ctx.accounts.admin_wallet.to_account_info().try_borrow_mut_lamports()? += winner_record.prize_amount;

        winner_record.claimed = true;
        winner_record.claim_time = clock.unix_timestamp;

        msg!("Unclaimed prize reclaimed: amount={}", winner_record.prize_amount);

        Ok(())
    }

    /// Emergency withdraw - admin can withdraw any amount from prize vault
    pub fn emergency_withdraw(ctx: Context<EmergencyWithdraw>, amount: u64) -> Result<()> {
        // Transfer from prize vault to admin
        **ctx.accounts.prize_vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.admin_wallet.to_account_info().try_borrow_mut_lamports()? += amount;

        msg!("Emergency withdrawal: {} lamports to admin", amount);

        Ok(())
    }

    /// Transfer admin rights to a new wallet
    pub fn transfer_admin(ctx: Context<TransferAdmin>, new_admin: Pubkey) -> Result<()> {
        let lottery_state = &mut ctx.accounts.lottery_state;
        let old_admin = lottery_state.admin;

        lottery_state.admin = new_admin;

        msg!("Admin transferred from {} to {}", old_admin, new_admin);

        Ok(())
    }
}

// ============================================================================
// CONTEXT STRUCTS
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + LotteryState::INIT_SPACE,
        seeds = [b"lottery_state"],
        bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    /// CHECK: Prize vault PDA
    #[account(
        seeds = [b"prize_vault"],
        bump
    )]
    pub prize_vault: SystemAccount<'info>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartWeek<'info> {
    #[account(
        mut,
        seeds = [b"lottery_state"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(
        init,
        payer = admin,
        space = 8 + WeekState::INIT_SPACE,
        seeds = [b"week_state", (lottery_state.current_week + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub week_state: Account<'info, WeekState>,
    
    #[account(mut, address = lottery_state.admin)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyTickets<'info> {
    #[account(
        mut,
        seeds = [b"lottery_state"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(
        mut,
        seeds = [b"week_state", &week_state.week_number.to_le_bytes()],
        bump = week_state.bump
    )]
    pub week_state: Account<'info, WeekState>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserTickets::INIT_SPACE + (100 * 48), // Max 100 tickets
        seeds = [b"user_tickets", user.key().as_ref(), &week_state.week_number.to_le_bytes()],
        bump
    )]
    pub user_tickets: Account<'info, UserTickets>,
    
    /// CHECK: Prize vault PDA
    #[account(
        mut,
        seeds = [b"prize_vault"],
        bump
    )]
    pub prize_vault: AccountInfo<'info>,
    
    /// CHECK: Admin wallet for fees
    #[account(mut, address = lottery_state.admin)]
    pub admin_wallet: AccountInfo<'info>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseSales<'info> {
    #[account(
        seeds = [b"lottery_state"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(
        mut,
        seeds = [b"week_state", &week_state.week_number.to_le_bytes()],
        bump = week_state.bump
    )]
    pub week_state: Account<'info, WeekState>,
    
    #[account(address = lottery_state.admin)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct DrawNumbers<'info> {
    #[account(
        mut,
        seeds = [b"week_state", &week_state.week_number.to_le_bytes()],
        bump = week_state.bump
    )]
    pub week_state: Account<'info, WeekState>,
    
    #[account(
        seeds = [b"lottery_state"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(address = lottery_state.admin)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct AnnounceWinners<'info> {
    #[account(
        mut,
        seeds = [b"week_state", &week_state.week_number.to_le_bytes()],
        bump = week_state.bump
    )]
    pub week_state: Account<'info, WeekState>,
    
    #[account(
        seeds = [b"lottery_state"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(address = lottery_state.admin)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(ticket_index: u32)]
pub struct CreateWinnerRecord<'info> {
    #[account(
        seeds = [b"lottery_state"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(
        seeds = [b"week_state", &week_state.week_number.to_le_bytes()],
        bump = week_state.bump
    )]
    pub week_state: Account<'info, WeekState>,
    
    #[account(
        seeds = [b"user_tickets", user.key().as_ref(), &week_state.week_number.to_le_bytes()],
        bump
    )]
    pub user_tickets: Account<'info, UserTickets>,
    
    #[account(
        init,
        payer = admin,
        space = 8 + WinnerRecord::INIT_SPACE,
        seeds = [
            b"winner_record",
            user.key().as_ref(),
            &week_state.week_number.to_le_bytes(),
            &ticket_index.to_le_bytes()
        ],
        bump
    )]
    pub winner_record: Account<'info, WinnerRecord>,
    
    /// CHECK: Winner's wallet
    pub user: AccountInfo<'info>,
    
    #[account(mut, address = lottery_state.admin)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(
        mut,
        seeds = [b"lottery_state"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(
        seeds = [b"week_state", &winner_record.week_number.to_le_bytes()],
        bump = week_state.bump
    )]
    pub week_state: Account<'info, WeekState>,
    
    #[account(
        mut,
        seeds = [
            b"winner_record",
            user.key().as_ref(),
            &winner_record.week_number.to_le_bytes(),
            &winner_record.ticket_index.to_le_bytes()
        ],
        bump = winner_record.bump
    )]
    pub winner_record: Account<'info, WinnerRecord>,
    
    /// CHECK: Prize vault PDA
    #[account(
        mut,
        seeds = [b"prize_vault"],
        bump
    )]
    pub prize_vault: AccountInfo<'info>,
    
    #[account(mut, address = winner_record.user)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CalculateRollover<'info> {
    #[account(
        mut,
        seeds = [b"lottery_state"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(
        seeds = [b"week_state", &week_state.week_number.to_le_bytes()],
        bump = week_state.bump
    )]
    pub week_state: Account<'info, WeekState>,
    
    #[account(address = lottery_state.admin)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct ReclaimUnclaimed<'info> {
    #[account(
        seeds = [b"lottery_state"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(
        seeds = [b"week_state", &winner_record.week_number.to_le_bytes()],
        bump = week_state.bump
    )]
    pub week_state: Account<'info, WeekState>,
    
    #[account(
        mut,
        seeds = [
            b"winner_record",
            winner_record.user.as_ref(),
            &winner_record.week_number.to_le_bytes(),
            &winner_record.ticket_index.to_le_bytes()
        ],
        bump = winner_record.bump
    )]
    pub winner_record: Account<'info, WinnerRecord>,
    
    /// CHECK: Prize vault PDA
    #[account(
        mut,
        seeds = [b"prize_vault"],
        bump
    )]
    pub prize_vault: AccountInfo<'info>,
    
    /// CHECK: Admin wallet
    #[account(mut, address = lottery_state.admin)]
    pub admin_wallet: AccountInfo<'info>,
    
    #[account(address = lottery_state.admin)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EmergencyWithdraw<'info> {
    #[account(
        seeds = [b"lottery_state"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    /// CHECK: Prize vault PDA
    #[account(
        mut,
        seeds = [b"prize_vault"],
        bump
    )]
    pub prize_vault: AccountInfo<'info>,
    
    /// CHECK: Admin wallet
    #[account(mut, address = lottery_state.admin)]
    pub admin_wallet: AccountInfo<'info>,
    
    #[account(address = lottery_state.admin)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    #[account(
        mut,
        seeds = [b"lottery_state"],
        bump = lottery_state.bump
    )]
    pub lottery_state: Account<'info, LotteryState>,
    
    #[account(address = lottery_state.admin)]
    pub admin: Signer<'info>,
}

// ============================================================================
// STATE STRUCTS
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct LotteryState {
    pub admin: Pubkey,              // 32
    pub current_week: u64,          // 8
    pub rollover_jackpot: u64,      // 8
    pub total_tickets_sold: u64,    // 8
    pub total_prizes_claimed: u64,  // 8
    pub bump: u8,                   // 1
}

#[account]
#[derive(InitSpace)]
pub struct WeekState {
    pub week_number: u64,           // 8
    pub start_time: i64,            // 8
    pub draw_time: i64,             // 8
    pub ticket_sales_open: bool,    // 1
    pub winning_numbers: [u8; 5],   // 5
    pub total_tickets: u64,         // 8
    pub prize_pool: u64,            // 8
    pub rollover_amount: u64,       // 8
    pub tier_winners: [u32; 4],     // 16 (tier5, tier4, tier3, tier2)
    pub tier_prizes: [u64; 4],      // 32
    pub drawn: bool,                // 1
    pub bump: u8,                   // 1
}

#[account]
#[derive(InitSpace)]
pub struct UserTickets {
    pub user: Pubkey,               // 32
    pub week_number: u64,           // 8
    #[max_len(100)]
    pub tickets: Vec<UserTicket>,   // 4 + (100 * 48)
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct UserTicket {
    pub numbers: [u8; 5],           // 5
    pub purchase_time: i64,         // 8
    pub claimed: bool,              // 1
    pub prize_tier: u8,             // 1
    pub prize_amount: u64,          // 8
}

#[account]
#[derive(InitSpace)]
pub struct WinnerRecord {
    pub week_number: u64,           // 8
    pub user: Pubkey,               // 32
    pub ticket_index: u32,          // 4
    pub numbers: [u8; 5],           // 5
    pub match_count: u8,            // 1
    pub prize_amount: u64,          // 8
    pub claimed: bool,              // 1
    pub claim_time: i64,            // 8
    pub created_at: i64,            // 8
    pub bump: u8,                   // 1
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum LotteryError {
    #[msg("Week already started")]
    WeekAlreadyStarted,
    #[msg("Ticket sales are closed")]
    SalesClosed,
    #[msg("No tickets provided")]
    NoTickets,
    #[msg("Too many tickets (max 100)")]
    TooManyTickets,
    #[msg("Invalid ticket numbers")]
    InvalidNumbers,
    #[msg("Sales already closed")]
    AlreadyClosed,
    #[msg("Sales still open")]
    SalesStillOpen,
    #[msg("Already drawn")]
    AlreadyDrawn,
    #[msg("Not drawn yet")]
    NotDrawnYet,
    #[msg("Invalid match count")]
    InvalidMatchCount,
    #[msg("Invalid ticket index")]
    InvalidTicketIndex,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Claim period expired")]
    ClaimExpired,
    #[msg("Claim period not expired yet")]
    ClaimNotExpired,
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

fn validate_ticket_numbers(numbers: &[u8; 5]) -> Result<()> {
    // Check each number is 1-59
    for &num in numbers.iter() {
        require!(num >= 1 && num <= 59, LotteryError::InvalidNumbers);
    }
    
    // Check no duplicates
    for i in 0..5 {
        for j in (i + 1)..5 {
            require!(numbers[i] != numbers[j], LotteryError::InvalidNumbers);
        }
    }
    
    Ok(())
}