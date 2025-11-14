use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self as token, Token};
use anchor_spl::token_interface::{
    self as token_interface,
    Mint,
    TokenAccount,
    TokenInterface,
    TransferChecked,
};

declare_id!("4zqJTEGr5Q6pU7Uq311idgt4uaAEqKx5WiK737RXjSEs");

const SECONDS_PER_YEAR: u64 = 31_536_000; // 365 days

// ✅ NEW: Helper to check if a mint is Native SOL
fn is_native_sol(mint: &Pubkey) -> bool {
    mint.to_string() == "So11111111111111111111111111111111111111112"
}

// ✅ NEW: Helper to transfer tokens (supports SPL, Token-2022, and Native SOL)
fn transfer_tokens<'info>(
    from: AccountInfo<'info>,
    to: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    amount: u64,
    signer_seeds: Option<&[&[&[u8]]]>,
) -> Result<()> {
    if is_native_sol(&mint.key()) {
        // Native SOL transfer using system program
        msg!("💰 Transferring Native SOL: {} lamports", amount);
        let transfer_ix = system_program::Transfer {
            from: from.clone(),
            to: to.clone(),
        };
        
        if let Some(seeds) = signer_seeds {
            system_program::transfer(
                CpiContext::new_with_signer(system_program, transfer_ix, seeds),
                amount,
            )?;
        } else {
            system_program::transfer(
                CpiContext::new(system_program, transfer_ix),
                amount,
            )?;
        }
    } else {
        // SPL Token or Token-2022 transfer
        msg!("🪙 Transferring SPL/Token-2022: {} units", amount);
        let transfer_ix = TransferChecked {
            from,
            to,
            authority,
            mint: mint.to_account_info(),
        };
        
        if let Some(seeds) = signer_seeds {
            token_interface::transfer_checked(
                CpiContext::new_with_signer(token_program, transfer_ix, seeds),
                amount,
                mint.decimals,
            )?;
        } else {
            token_interface::transfer_checked(
                CpiContext::new(token_program, transfer_ix),
                amount,
                mint.decimals,
            )?;
        }
    }
    
    Ok(())
}

#[program]
pub mod staking_program {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        platform_token_fee_bps: u64,
        platform_sol_fee: u64,
    ) -> Result<()> {
        let platform = &mut ctx.accounts.platform;
        
        platform.admin = ctx.accounts.admin.key();
        platform.fee_collector = ctx.accounts.fee_collector.key();
        platform.platform_token_fee_bps = platform_token_fee_bps;
        platform.platform_sol_fee = platform_sol_fee;
        platform.is_initialized = true;
        platform.bump = ctx.bumps.platform;
        
        emit!(PlatformInitialized {
            admin: platform.admin,
            fee_collector: platform.fee_collector,
            platform_token_fee_bps,
            platform_sol_fee,
        });
        
        Ok(())
    }

    pub fn create_project(
        ctx: Context<CreateProject>,
        token_mint: Pubkey,
        pool_id: u64,
    ) -> Result<()> {
        let project = &mut ctx.accounts.project;
        
        project.admin = ctx.accounts.admin.key();
        project.token_mint = token_mint;
        project.pool_id = pool_id;
        project.staking_vault = ctx.accounts.staking_vault.key();
        project.reward_vault = ctx.accounts.reward_vault.key();
        project.reflection_vault = None;
        project.reflection_token = None;
        
        project.total_staked = 0;
        project.total_rewards_deposited = 0;
        project.total_rewards_claimed = 0;
        
        project.rate_bps_per_year = 0;
        project.rate_mode = 0;
        project.reward_rate_per_second = 0;
        project.lockup_seconds = 0;
        project.pool_duration_seconds = 0;
        project.pool_start_time = 0;
        project.pool_end_time = 0;
        
        project.last_update_time = 0;
        project.reward_per_token_stored = 0;
        project.reflection_per_token_stored = 0;
        project.last_reflection_update_time = 0;
        project.last_reflection_balance = 0;  // Initialize reflection balance tracker
        
        project.referrer = None;
        project.referrer_split_bps = 0;
        
        project.is_paused = false;
        project.deposit_paused = false;
        project.withdraw_paused = false;
        project.claim_paused = false;
        project.is_initialized = false;
        
        project.bump = ctx.bumps.project;
        project.total_reflection_debt = 0;  // ✅ ADD: Initialize debt tracking
        
        emit!(ProjectCreated {
            project: project.key(),
            token_mint,
            staking_vault: ctx.accounts.staking_vault.key(),
            reward_vault: ctx.accounts.reward_vault.key(),
            admin: ctx.accounts.admin.key(),
        });
        
        Ok(())
    }

    pub fn initialize_pool(
    ctx: Context<InitializePool>,
    token_mint: Pubkey,              // ← ADD THIS PARAMETER
    pool_id: u64,                    // ← ADD THIS PARAMETER
    params: InitializePoolParams,
) -> Result<()> {
    let project = &mut ctx.accounts.project;
    
    require!(!project.is_initialized, ErrorCode::AlreadyInitialized);
    require!(params.pool_duration_seconds > 0, ErrorCode::InvalidPoolDuration);
    
    // ✅ ADD: Validate that passed parameters match the project
    require!(
        project.token_mint == token_mint,
        ErrorCode::WrongTokenType
    );
    require!(
        project.pool_id == pool_id,
        ErrorCode::InvalidProject
    );
    
    let current_time = Clock::get()?.unix_timestamp;
    
    project.rate_bps_per_year = params.rate_bps_per_year;
    project.rate_mode = params.rate_mode;
    project.lockup_seconds = params.lockup_seconds;
    project.pool_duration_seconds = params.pool_duration_seconds;
    project.pool_start_time = current_time;
    project.pool_end_time = current_time
        .checked_add(params.pool_duration_seconds as i64)
        .ok_or(ErrorCode::MathOverflow)?;
    
    project.last_update_time = current_time;
    project.last_reflection_update_time = current_time;
    
    if params.rate_mode == 0 {
        // Fixed APY pool - multiply by 1e9 (WORKING FORMULA from Oct 21)
        // Formula: (rateBpsPerYear × 1e9) / (10000 × 31,536,000)
        let numerator = (params.rate_bps_per_year as u128)
            .checked_mul(1_000_000_000u128)  // Single 1e9 multiplication
            .ok_or(ErrorCode::MathOverflow)?;
        
        let denominator = (10_000u128)
            .checked_mul(31_536_000u128)
            .ok_or(ErrorCode::MathOverflow)?;
            
        let rate_per_second = numerator
            .checked_div(denominator)
            .ok_or(ErrorCode::DivisionByZero)?;
        
        require!(rate_per_second <= u64::MAX as u128, ErrorCode::AprTooHigh);
        project.reward_rate_per_second = rate_per_second as u64;
        
        msg!("Fixed APY pool rate: {}", project.reward_rate_per_second);
    }
    
    if let Some(referrer) = params.referrer {
        project.referrer = Some(referrer);
        project.referrer_split_bps = params.referrer_split_bps.unwrap_or(0);
    }
    
    if params.enable_reflections {
        // ✅ NEW: Validate that reflection_token param is provided
        require!(
            params.reflection_token.is_some(),
            ErrorCode::ReflectionTokenRequired
        );
        require!(
            ctx.accounts.reflection_token_mint.is_some(),
            ErrorCode::ReflectionTokenRequired
        );
        require!(
            ctx.accounts.reflection_token_account.is_some(),
            ErrorCode::ReflectionVaultRequired
        );
        require!(
            ctx.accounts.associated_token_program.is_some(),
            ErrorCode::MissingAssociatedTokenProgram
        );
        
        let reflection_mint_info = ctx.accounts.reflection_token_mint.as_ref().unwrap();
        let reflection_account_info = ctx.accounts.reflection_token_account.as_ref().unwrap();
        let ata_program = ctx.accounts.associated_token_program.as_ref().unwrap();
        
        // ✅ NEW: Verify the provided reflection_token matches the account
        require!(
            reflection_mint_info.key() == params.reflection_token.unwrap(),
            ErrorCode::InvalidReflectionVault
        );
        
        // ✅ Manually validate or create the ATA
        let expected_ata = anchor_spl::associated_token::get_associated_token_address(
            &ctx.accounts.staking_vault.key(),
            &reflection_mint_info.key()
        );
        
        require!(
            reflection_account_info.key() == expected_ata,
            ErrorCode::InvalidReflectionVault
        );
        
        // ✅ If ATA doesn't exist, create it
        if reflection_account_info.data_is_empty() {
            msg!("Creating reflection token ATA...");
            
            // ✅ Get the correct token program for reflections
            let reflection_token_program = if let Some(ref prog) = ctx.accounts.reflection_token_program {
                prog.clone()
            } else {
                ctx.accounts.token_program.to_account_info()
            };
            
            let cpi_accounts = anchor_spl::associated_token::Create {
                payer: ctx.accounts.admin.to_account_info(),
                associated_token: reflection_account_info.clone(),
                authority: ctx.accounts.staking_vault.to_account_info(),
                mint: reflection_mint_info.clone(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: reflection_token_program.clone(),  // ← CHANGED: Use reflection token program
            };
            
            let cpi_ctx = CpiContext::new(ata_program.clone(), cpi_accounts);
            anchor_spl::associated_token::create(cpi_ctx)?;
            
            msg!("Reflection token ATA created: {}", expected_ata);
        }
        
        // ✅ Store both the token mint AND the ATA address
        project.reflection_token = Some(reflection_mint_info.key());
        project.reflection_vault = Some(expected_ata);
        
        msg!("Reflections enabled with token: {}", reflection_mint_info.key());
        msg!("Reflection ATA: {}", expected_ata);
    }
    
    project.is_initialized = true;
    project.total_reflection_debt = 0;
    
    emit!(PoolInitialized {
        project: project.key(),
        staking_vault: project.staking_vault,
        reward_vault: project.reward_vault,
        reflection_vault: project.reflection_vault,
        rate_bps_per_year: params.rate_bps_per_year,
        rate_mode: params.rate_mode,
        lockup_seconds: params.lockup_seconds,
        pool_duration_seconds: params.pool_duration_seconds,
        reflections_enabled: params.enable_reflections,
    });
    
    Ok(())
}

    pub fn deposit(
        ctx: Context<Deposit>,
        token_mint: Pubkey,
        pool_id: u64,
        amount: u64
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        let platform_token_fee_bps = ctx.accounts.platform.platform_token_fee_bps;
        let platform_sol_fee = ctx.accounts.platform.platform_sol_fee;
        let fee_collector = ctx.accounts.platform.fee_collector;
        
        let project_is_initialized = ctx.accounts.project.is_initialized;
        let project_is_paused = ctx.accounts.project.is_paused;
        let project_deposit_paused = ctx.accounts.project.deposit_paused;
        let project_pool_end_time = ctx.accounts.project.pool_end_time;
        let project_key = ctx.accounts.project.key();
        let project_token_mint = ctx.accounts.project.token_mint;
        let project_pool_id = ctx.accounts.project.pool_id;
        let project_bump = ctx.accounts.project.bump;
        let project_referrer = ctx.accounts.project.referrer;
        let project_referrer_split_bps = ctx.accounts.project.referrer_split_bps;
        let project_reward_per_token_stored = ctx.accounts.project.reward_per_token_stored;
        let project_reflection_per_token_stored = ctx.accounts.project.reflection_per_token_stored;
        
        require!(project_is_initialized, ErrorCode::NotInitialized);
        require!(!project_is_paused, ErrorCode::ProjectPaused);
        require!(!project_deposit_paused, ErrorCode::DepositsPaused);
        
        let rent_minimum = 890880u64;
        require!(
            ctx.accounts.user.lamports() >= platform_sol_fee.saturating_add(rent_minimum),
            ErrorCode::InsufficientSolForFee
        );
        
        let current_time = Clock::get()?.unix_timestamp;
        require!(current_time < project_pool_end_time, ErrorCode::PoolEnded);
        
        let token_fee = amount
            .checked_mul(platform_token_fee_bps)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?;
        
        let amount_after_fee = amount
            .checked_sub(token_fee)
            .ok_or(ErrorCode::MathOverflow)?;
        
        let stake = &mut ctx.accounts.stake;
        let is_initialized = stake.bump != 0;
        
        if !is_initialized {
    stake.user = ctx.accounts.user.key();
    stake.project = project_key;
    stake.amount = amount_after_fee;
    stake.last_stake_timestamp = current_time;
    stake.withdrawal_wallet = ctx.accounts.user.key();
    stake.reward_per_token_paid = project_reward_per_token_stored;
    stake.rewards_pending = 0;
    stake.total_rewards_claimed = 0;
    stake.reflection_per_token_paid = project_reflection_per_token_stored;
    stake.reflections_pending = 0;
    stake.total_reflections_claimed = 0;
    stake.reflection_debt = 0;
    stake.reward_rate_snapshot = ctx.accounts.project.reward_rate_per_second;
    stake.bump = ctx.bumps.stake;
    
    // ✅ ADD: Update project.total_staked for initial stake
    let project_mut = &mut ctx.accounts.project;
    project_mut.total_staked = project_mut.total_staked
        .checked_add(amount_after_fee)
        .ok_or(ErrorCode::MathOverflow)?;
} else {
    require!(stake.user == ctx.accounts.user.key(), ErrorCode::Unauthorized);
    require!(stake.project == project_key, ErrorCode::InvalidProject);
    
    update_reward(&mut ctx.accounts.project, stake)?;
    update_reflection(&mut ctx.accounts.project, stake, ctx.accounts.reflection_vault.as_ref())?;
    
    stake.amount = stake.amount
        .checked_add(amount_after_fee)
        .ok_or(ErrorCode::MathOverflow)?;
    
    let project_mut = &mut ctx.accounts.project;
    project_mut.total_staked = project_mut.total_staked
        .checked_add(amount_after_fee)
        .ok_or(ErrorCode::MathOverflow)?;
    
    stake.last_stake_timestamp = current_time;
}
                       
        // ✅ Transfer tokens to staking vault (supports SPL, Token-2022, Native SOL)
        transfer_tokens(
            ctx.accounts.user_token_account.to_account_info(),
            ctx.accounts.staking_vault.to_account_info(),
            ctx.accounts.user.to_account_info(),
            &ctx.accounts.token_mint_account,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            amount_after_fee,
            None,
        )?;
        
        // ✅ Transfer token fee to fee collector
        if token_fee > 0 {
            transfer_tokens(
                ctx.accounts.user_token_account.to_account_info(),
                ctx.accounts.fee_collector_token_account.to_account_info(),
                ctx.accounts.user.to_account_info(),
                &ctx.accounts.token_mint_account,
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                token_fee,
                None,
            )?;
        }
        
        if platform_sol_fee > 0 {
            if let Some(referrer_key) = project_referrer {
                if let Some(ref referrer_account) = ctx.accounts.referrer {
                    require!(
                        referrer_account.key() == referrer_key,
                        ErrorCode::InvalidReferrer
                    );
                    
                    let referrer_amount = platform_sol_fee
                        .checked_mul(project_referrer_split_bps)
                        .ok_or(ErrorCode::MathOverflow)?
                        .checked_div(10000)
                        .ok_or(ErrorCode::MathOverflow)?;
                    
                    let admin_amount = platform_sol_fee
                        .checked_sub(referrer_amount)
                        .ok_or(ErrorCode::MathOverflow)?;
                    
                    system_program::transfer(
                        CpiContext::new(
                            ctx.accounts.system_program.to_account_info(),
                            system_program::Transfer {
                                from: ctx.accounts.user.to_account_info(),
                                to: ctx.accounts.fee_collector.to_account_info(),
                            },
                        ),
                        admin_amount,
                    )?;
                    
                    if referrer_amount > 0 {
                        system_program::transfer(
                            CpiContext::new(
                                ctx.accounts.system_program.to_account_info(),
                                system_program::Transfer {
                                    from: ctx.accounts.user.to_account_info(),
                                    to: referrer_account.to_account_info(),
                                },
                            ),
                            referrer_amount,
                        )?;
                    }
                } else {
                    system_program::transfer(
                        CpiContext::new(
                            ctx.accounts.system_program.to_account_info(),
                            system_program::Transfer {
                                from: ctx.accounts.user.to_account_info(),
                                to: ctx.accounts.fee_collector.to_account_info(),
                            },
                        ),
                        platform_sol_fee,
                    )?;
                }
            } else {
                system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.user.to_account_info(),
                            to: ctx.accounts.fee_collector.to_account_info(),
                        },
                    ),
                    platform_sol_fee,
                )?;
            }
        }
        
        emit!(TokensDeposited {
            user: ctx.accounts.user.key(),
            project: project_key,
            amount: amount_after_fee,
            token_fee,
            sol_fee: platform_sol_fee,
            new_total: stake.amount,
        });
        
        Ok(())
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        token_mint: Pubkey,
        pool_id: u64,
        amount: u64
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(ctx.accounts.stake.amount >= amount, ErrorCode::InsufficientBalance);
        
        // ✅ Access directly - no local variable copies
        require!(ctx.accounts.project.is_initialized, ErrorCode::NotInitialized);
        require!(!ctx.accounts.project.is_paused, ErrorCode::ProjectPaused);
        require!(!ctx.accounts.project.withdraw_paused, ErrorCode::WithdrawalsPaused);
        
        let rent_minimum = 890880u64;
        require!(
            ctx.accounts.user.lamports() >= ctx.accounts.platform.platform_sol_fee.saturating_add(rent_minimum),
            ErrorCode::InsufficientSolForFee
        );
        
        let token_fee = amount
            .checked_mul(ctx.accounts.platform.platform_token_fee_bps)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?;
        
        let amount_after_fee = amount
            .checked_sub(token_fee)
            .ok_or(ErrorCode::MathOverflow)?;
        
        require!(
            ctx.accounts.staking_vault.amount >= amount,
            ErrorCode::InsufficientVaultBalance
        );
        
        // ✅ Call updates early
        update_reward(&mut ctx.accounts.project, &mut ctx.accounts.stake)?;
        
        if ctx.accounts.project.reflection_vault.is_some() {
            let reflection_vault_opt = ctx.accounts.reflection_vault.as_ref();
            if let Some(vault) = reflection_vault_opt {
                require!(
                    Some(vault.key()) == ctx.accounts.project.reflection_vault,
                    ErrorCode::InvalidReflectionVault
                );
                update_reflection(&mut ctx.accounts.project, &mut ctx.accounts.stake, Some(vault))?;
            }
        }
        
        let current_time = Clock::get()?.unix_timestamp;
        let time_staked = current_time
            .checked_sub(ctx.accounts.stake.last_stake_timestamp)
            .ok_or(ErrorCode::MathOverflow)?;
        
        require!(time_staked >= 0, ErrorCode::InvalidTimestamp);
        
        if time_staked < ctx.accounts.project.lockup_seconds as i64 {
            return Err(ErrorCode::LockupNotExpired.into());
        }
        
        // Update stake amount
        ctx.accounts.stake.amount = ctx.accounts.stake.amount
            .checked_sub(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        
        // Update total staked
        require!(
            ctx.accounts.project.total_staked >= amount,
            ErrorCode::InconsistentTotalStaked
        );
        ctx.accounts.project.total_staked = ctx.accounts.project.total_staked
            .checked_sub(amount)
            .ok_or(ErrorCode::MathOverflow)?;
        
        // ✅ Only create seeds when needed
        let seeds = &[
            b"project",
            ctx.accounts.project.token_mint.as_ref(),
            &ctx.accounts.project.pool_id.to_le_bytes(),
            &[ctx.accounts.project.bump],
        ];
        let signer = &[&seeds[..]];
        
        // ✅ Transfer tokens to user (supports SPL, Token-2022, Native SOL)
        transfer_tokens(
            ctx.accounts.staking_vault.to_account_info(),
            ctx.accounts.withdrawal_token_account.to_account_info(),
            ctx.accounts.project.to_account_info(),
            &ctx.accounts.token_mint_account,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            amount_after_fee,
            Some(signer),
        )?;
        
        // ✅ Transfer token fee to fee collector
        if token_fee > 0 {
            transfer_tokens(
                ctx.accounts.staking_vault.to_account_info(),
                ctx.accounts.fee_collector_token_account.to_account_info(),
                ctx.accounts.project.to_account_info(),
                &ctx.accounts.token_mint_account,
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                token_fee,
                Some(signer),
            )?;
        }
        
        // Collect SOL fee
        if ctx.accounts.platform.platform_sol_fee > 0 {
            if let Some(referrer_key) = ctx.accounts.project.referrer {
                if let Some(ref referrer_account) = ctx.accounts.referrer {
                    require!(
                        referrer_account.key() == referrer_key,
                        ErrorCode::InvalidReferrer
                    );
                    
                    let referrer_amount = ctx.accounts.platform.platform_sol_fee
                        .checked_mul(ctx.accounts.project.referrer_split_bps)
                        .ok_or(ErrorCode::MathOverflow)?
                        .checked_div(10000)
                        .ok_or(ErrorCode::MathOverflow)?;
                    
                    let admin_amount = ctx.accounts.platform.platform_sol_fee
                        .checked_sub(referrer_amount)
                        .ok_or(ErrorCode::MathOverflow)?;
                    
                    system_program::transfer(
                        CpiContext::new(
                            ctx.accounts.system_program.to_account_info(),
                            system_program::Transfer {
                                from: ctx.accounts.user.to_account_info(),
                                to: ctx.accounts.fee_collector.to_account_info(),
                            },
                        ),
                        admin_amount,
                    )?;
                    
                    if referrer_amount > 0 {
                        system_program::transfer(
                            CpiContext::new(
                                ctx.accounts.system_program.to_account_info(),
                                system_program::Transfer {
                                    from: ctx.accounts.user.to_account_info(),
                                    to: referrer_account.to_account_info(),
                                },
                            ),
                            referrer_amount,
                        )?;
                    }
                } else {
                    system_program::transfer(
                        CpiContext::new(
                            ctx.accounts.system_program.to_account_info(),
                            system_program::Transfer {
                                from: ctx.accounts.user.to_account_info(),
                                to: ctx.accounts.fee_collector.to_account_info(),
                            },
                        ),
                        ctx.accounts.platform.platform_sol_fee,
                    )?;
                }
            } else {
                system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.user.to_account_info(),
                            to: ctx.accounts.fee_collector.to_account_info(),
                        },
                    ),
                    ctx.accounts.platform.platform_sol_fee,
                )?;
            }
        }
        
        emit!(TokensWithdrawn {
            user: ctx.accounts.user.key(),
            project: ctx.accounts.project.key(),
            amount: amount_after_fee,
            remaining: ctx.accounts.stake.amount,
        });
        
        Ok(())
    }
    pub fn claim(
        ctx: Context<Claim>,
        token_mint: Pubkey,
        pool_id: u64
    ) -> Result<()> {
    require!(ctx.accounts.stake.amount > 0, ErrorCode::NoStake);
    
    let platform_sol_fee = ctx.accounts.platform.platform_sol_fee;
    let fee_collector = ctx.accounts.platform.fee_collector;
    
    let project_is_initialized = ctx.accounts.project.is_initialized;
    let project_is_paused = ctx.accounts.project.is_paused;
    let project_claim_paused = ctx.accounts.project.claim_paused;
    let project_token_mint = ctx.accounts.project.token_mint;
    let project_pool_id = ctx.accounts.project.pool_id;
    let project_bump = ctx.accounts.project.bump;
    let project_key = ctx.accounts.project.key();
    let project_referrer = ctx.accounts.project.referrer;
    let project_referrer_split_bps = ctx.accounts.project.referrer_split_bps;
    
    require!(project_is_initialized, ErrorCode::NotInitialized);
    require!(!project_is_paused, ErrorCode::ProjectPaused);
    require!(!project_claim_paused, ErrorCode::ClaimsPaused);
    
    // Check user has enough SOL for fee
    let rent_minimum = 890880u64;
    require!(
        ctx.accounts.user.lamports() >= platform_sol_fee.saturating_add(rent_minimum),
        ErrorCode::InsufficientSolForFee
    );
    
    update_reward(&mut ctx.accounts.project, &mut ctx.accounts.stake)?;
    
    if ctx.accounts.project.reflection_vault.is_some() {
        if let Some(ref vault) = ctx.accounts.reflection_vault {
            require!(Some(vault.key()) == ctx.accounts.project.reflection_vault, ErrorCode::InvalidReflectionVault);
            update_reflection(&mut ctx.accounts.project, &mut ctx.accounts.stake, Some(vault))?;
        }
    }

    let rewards = ctx.accounts.stake.rewards_pending;
    require!(rewards > 0, ErrorCode::NoRewards);
    require!(
        ctx.accounts.reward_vault.amount >= rewards,
        ErrorCode::InsufficientRewardVault
    );
    
    let stake_mut = &mut ctx.accounts.stake;
    stake_mut.rewards_pending = 0;
    stake_mut.last_stake_timestamp = Clock::get()?.unix_timestamp;
    stake_mut.total_rewards_claimed = stake_mut.total_rewards_claimed
        .checked_add(rewards)
        .ok_or(ErrorCode::MathOverflow)?;
    
    let project_mut = &mut ctx.accounts.project;
    project_mut.total_rewards_claimed = project_mut.total_rewards_claimed
        .checked_add(rewards)
        .ok_or(ErrorCode::MathOverflow)?;
    
    let seeds = &[
        b"project",
        project_token_mint.as_ref(),
        &project_pool_id.to_le_bytes(),
        &[project_bump],
    ];
    let signer = &[&seeds[..]];
    
    // ✅ Transfer rewards (supports SPL, Token-2022, Native SOL)
    transfer_tokens(
        ctx.accounts.reward_vault.to_account_info(),
        ctx.accounts.user_token_account.to_account_info(),
        ctx.accounts.project.to_account_info(),
        &ctx.accounts.token_mint_account,
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        rewards,
        Some(signer),
    )?;
    
    // Collect SOL fee (with referral split if applicable)
    if platform_sol_fee > 0 {
        if let Some(referrer_key) = project_referrer {
            if let Some(ref referrer_account) = ctx.accounts.referrer {
                require!(
                    referrer_account.key() == referrer_key,
                    ErrorCode::InvalidReferrer
                );
                
                let referrer_amount = platform_sol_fee
                    .checked_mul(project_referrer_split_bps)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_div(10000)
                    .ok_or(ErrorCode::MathOverflow)?;
                
                let admin_amount = platform_sol_fee
                    .checked_sub(referrer_amount)
                    .ok_or(ErrorCode::MathOverflow)?;
                
                system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.user.to_account_info(),
                            to: ctx.accounts.fee_collector.to_account_info(),
                        },
                    ),
                    admin_amount,
                )?;
                
                if referrer_amount > 0 {
                    system_program::transfer(
                        CpiContext::new(
                            ctx.accounts.system_program.to_account_info(),
                            system_program::Transfer {
                                from: ctx.accounts.user.to_account_info(),
                                to: referrer_account.to_account_info(),
                            },
                        ),
                        referrer_amount,
                    )?;
                }
            } else {
                system_program::transfer(
                    CpiContext::new(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.user.to_account_info(),
                            to: ctx.accounts.fee_collector.to_account_info(),
                        },
                    ),
                    platform_sol_fee,
                )?;
            }
        } else {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.user.to_account_info(),
                        to: ctx.accounts.fee_collector.to_account_info(),
                    },
                ),
                platform_sol_fee,
            )?;
        }
    }
    
    emit!(RewardsClaimed {
        user: ctx.accounts.user.key(),
        project: project_key,
        amount: rewards,
    });
    
    Ok(())
}

    pub fn claim_reflections(
        ctx: Context<ClaimReflections>,
        token_mint: Pubkey,
        pool_id: u64
    ) -> Result<()> {
        require!(ctx.accounts.stake.amount > 0, ErrorCode::NoStake);
        
        let project_is_initialized = ctx.accounts.project.is_initialized;
        let project_is_paused = ctx.accounts.project.is_paused;
        let project_reflection_vault = ctx.accounts.project.reflection_vault;
        let project_token_mint = ctx.accounts.project.token_mint;
        let project_pool_id = ctx.accounts.project.pool_id;
        let project_bump = ctx.accounts.project.bump;
        let project_key = ctx.accounts.project.key();
        
        require!(project_is_initialized, ErrorCode::NotInitialized);
        require!(!project_is_paused, ErrorCode::ProjectPaused);
        require!(project_reflection_vault.is_some(), ErrorCode::ReflectionsNotEnabled);
        require!(
            Some(ctx.accounts.reflection_vault.key()) == project_reflection_vault,
            ErrorCode::InvalidReflectionVault
        );
        
        // Update reflections - this will automatically process any new tokens
        update_reflection_internal(&mut ctx.accounts.project, &mut ctx.accounts.stake, Some(&ctx.accounts.reflection_vault), true)?;
        
        let reflections = ctx.accounts.stake.reflections_pending;
        require!(reflections > 0, ErrorCode::NoReflections);
        
        // Check vault balance - handle Native SOL differently
        let is_native = is_native_sol(&ctx.accounts.reflection_token_mint.key());
        let vault_balance = if is_native {
            // For Native SOL, get lamports and subtract rent-exempt minimum
            let total_lamports = ctx.accounts.reflection_vault.to_account_info().lamports();
            let rent = Rent::get()?;
            let rent_exempt_minimum = rent.minimum_balance(ctx.accounts.reflection_vault.to_account_info().data_len());
            total_lamports.saturating_sub(rent_exempt_minimum)
        } else {
            ctx.accounts.reflection_vault.amount
        };
        
        require!(
            vault_balance >= reflections,
            ErrorCode::InsufficientReflectionVault
        );
        
        let stake_mut = &mut ctx.accounts.stake;
        stake_mut.reflections_pending = 0;
        stake_mut.total_reflections_claimed = stake_mut.total_reflections_claimed
            .checked_add(reflections)
            .ok_or(ErrorCode::MathOverflow)?;
        
        let seeds = &[
            b"staking_vault",
            project_key.as_ref(),
            &[ctx.bumps.staking_vault],
        ];
        let signer = &[&seeds[..]];
        
        // ✅ Transfer reflections (supports SPL, Token-2022, Native SOL)
        transfer_tokens(
            ctx.accounts.reflection_vault.to_account_info(),
            ctx.accounts.user_reflection_account.to_account_info(),
            ctx.accounts.staking_vault.to_account_info(),
            &ctx.accounts.reflection_token_mint,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            reflections,
            Some(signer),
        )?;
        
        emit!(ReflectionsClaimed {
            user: ctx.accounts.user.key(),
            project: project_key,
            amount: reflections,
        });
        
        Ok(())
    }

    // ✅ NEW: Allow users to refresh reflection calculations without claiming
    pub fn refresh_reflections(
        ctx: Context<RefreshReflections>,
        token_mint: Pubkey,
        pool_id: u64
    ) -> Result<()> {
        require!(ctx.accounts.stake.amount > 0, ErrorCode::NoStake);
        require!(ctx.accounts.project.is_initialized, ErrorCode::NotInitialized);
        require!(ctx.accounts.project.reflection_vault.is_some(), ErrorCode::ReflectionsNotEnabled);
        require!(
            Some(ctx.accounts.reflection_vault.key()) == ctx.accounts.project.reflection_vault,
            ErrorCode::InvalidReflectionVault
        );
        
        // Update reflection calculations
        update_reflection_internal(&mut ctx.accounts.project, &mut ctx.accounts.stake, Some(&ctx.accounts.reflection_vault), false)?;

        msg!("Reflections refreshed. Pending: {}", ctx.accounts.stake.reflections_pending);
        
        Ok(())
    }

    pub fn deposit_rewards(
        ctx: Context<DepositRewards>,
        token_mint: Pubkey,
        pool_id: u64,
        amount: u64
    ) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(ctx.accounts.project.is_initialized, ErrorCode::NotInitialized);
    require!(!ctx.accounts.project.is_paused, ErrorCode::ProjectPaused);
    
    let project_key = ctx.accounts.project.key();
    
    // ✅ Transfer rewards to vault (supports SPL, Token-2022, Native SOL)
    transfer_tokens(
        ctx.accounts.admin_token_account.to_account_info(),
        ctx.accounts.reward_vault.to_account_info(),
        ctx.accounts.admin.to_account_info(),
        &ctx.accounts.token_mint_account,
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        amount,
        None,
    )?;
    
    let project_mut = &mut ctx.accounts.project;
    project_mut.total_rewards_deposited = project_mut.total_rewards_deposited
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;
    
    // For fixed APY pools (rate_mode = 0), rate was already set in initialize_pool
    match project_mut.rate_mode {
        0 => {
            // Fixed APY - rate already calculated in initialize_pool, don't recalculate
            msg!("Fixed APY pool - rate: {}", project_mut.reward_rate_per_second);
        }
        
        1 => {
            // Dynamic pool - recalculate based on total available rewards
            let total_available = project_mut.total_rewards_deposited
                .checked_sub(project_mut.total_rewards_claimed)
                .ok_or(ErrorCode::MathOverflow)?;
            
            let current_time = Clock::get()?.unix_timestamp;
            let time_remaining = project_mut.pool_end_time
                .checked_sub(current_time)
                .unwrap_or(0);
            
            if time_remaining > 0 {
                project_mut.reward_rate_per_second = total_available
                    .checked_div(time_remaining as u64)
                    .unwrap_or(0);
            }
            
            msg!("Dynamic pool - new rate: {}", project_mut.reward_rate_per_second);
        }
        
        _ => return Err(ErrorCode::InvalidRateMode.into()),
    }
    
    emit!(RewardsDeposited {
        project: project_key,
        amount,
        total_rewards: project_mut.total_rewards_deposited,
        reward_rate: project_mut.reward_rate_per_second,
    });
    
    Ok(())
}
    
    pub fn transfer_admin(
        ctx: Context<TransferAdmin>,
        token_mint: Pubkey,
        pool_id: u64,
        new_admin: Pubkey
    ) -> Result<()> {
        let project = &mut ctx.accounts.project;
        let old_admin = project.admin;
        project.admin = new_admin;
        
        emit!(AdminTransferred {
            project: project.key(),
            old_admin,
            new_admin,
        });
        
        Ok(())
    }

    pub fn update_pool_duration(
        ctx: Context<UpdatePoolDuration>,
        token_mint: Pubkey,
        pool_id: u64,
        duration_seconds: u64,
    ) -> Result<()> {
        require!(duration_seconds > 0, ErrorCode::InvalidPoolDuration);
        
        let project = &mut ctx.accounts.project;
        let current_time = Clock::get()?.unix_timestamp;
        
        project.pool_duration_seconds = duration_seconds;
        project.pool_end_time = current_time
            .checked_add(duration_seconds as i64)
            .ok_or(ErrorCode::MathOverflow)?;
        
        emit!(PoolDurationUpdated {
            project: project.key(),
            duration_seconds,
        });
        
        Ok(())
    }

    pub fn update_referrer(
        ctx: Context<UpdateReferrer>,
        token_mint: Pubkey,
        pool_id: u64,
        referrer: Option<Pubkey>,
        split_bps: u64,
    ) -> Result<()> {
        require!(split_bps <= 10000, ErrorCode::InvalidSplitPercentage);
        
        let project = &mut ctx.accounts.project;
        project.referrer = referrer;
        project.referrer_split_bps = split_bps;
        
        emit!(ReferrerUpdated {
            project: project.key(),
            referrer,
            split_bps,
        });
        
        Ok(())
    }

    pub fn toggle_reflections(
        ctx: Context<ToggleReflections>,
        token_mint: Pubkey,
        pool_id: u64,
        enable: bool,
        reflection_token: Option<Pubkey>,
    ) -> Result<()> {
        let project = &mut ctx.accounts.project;
        
        if enable {
            require!(reflection_token.is_some(), ErrorCode::ReflectionTokenRequired);
            require!(ctx.accounts.reflection_vault.is_some(), ErrorCode::ReflectionVaultRequired);
            
            project.reflection_token = reflection_token;
            project.reflection_vault = ctx.accounts.reflection_vault
                .as_ref()
                .map(|v| v.key());
            
            emit!(ReflectionsEnabled {
                project: project.key(),
                reflection_token: reflection_token.unwrap(),
                reflection_vault: project.reflection_vault.unwrap(),
            });
        } else {
            project.reflection_token = None;
            emit!(ReflectionsDisabled {
                project: project.key(),
            });
        }
        
        Ok(())
    }

    pub fn set_fees(
        ctx: Context<SetFees>,
        platform_token_fee_bps: u64,
        platform_sol_fee: u64,
    ) -> Result<()> {
        let platform = &mut ctx.accounts.platform;
        platform.platform_token_fee_bps = platform_token_fee_bps;
        platform.platform_sol_fee = platform_sol_fee;
        
        emit!(FeesUpdated {
            platform_token_fee_bps,
            platform_sol_fee,
        });
        
        Ok(())
    }

    pub fn pause_project(
        ctx: Context<PauseControl>,
        token_mint: Pubkey,
        pool_id: u64
    ) -> Result<()> {
        ctx.accounts.project.is_paused = true;
        emit!(ProjectPaused { project: ctx.accounts.project.key() });
        Ok(())
    }

    pub fn unpause_project(
        ctx: Context<PauseControl>,
        token_mint: Pubkey,
        pool_id: u64
    ) -> Result<()> {
        ctx.accounts.project.is_paused = false;
        emit!(ProjectUnpaused { project: ctx.accounts.project.key() });
        Ok(())
    }

    pub fn emergency_unlock(
        ctx: Context<EmergencyUnlockAccounts>,
        token_mint: Pubkey,
        pool_id: u64
    ) -> Result<()> {
        ctx.accounts.project.lockup_seconds = 0;
        emit!(EmergencyUnlockEvent { 
            project: ctx.accounts.project.key(),
            admin: ctx.accounts.admin.key(),
        });
        Ok(())
    }

    pub fn claim_unclaimed_tokens(
        ctx: Context<ClaimUnclaimedTokens>,
        token_mint: Pubkey,
        pool_id: u64,
        amount: u64
    ) -> Result<()> {
        let project = &ctx.accounts.project;
        require!(
            ctx.accounts.vault.amount >= amount,
            ErrorCode::InsufficientVaultBalance
        );
        
        let seeds = &[
            b"project",
            project.token_mint.as_ref(),
            &project.pool_id.to_le_bytes(),
            &[project.bump],
        ];
        let signer = &[&seeds[..]];
        
        // ✅ Transfer tokens to admin (supports SPL, Token-2022, Native SOL)
        transfer_tokens(
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.admin_token_account.to_account_info(),
            ctx.accounts.project.to_account_info(),
            &ctx.accounts.token_mint_account,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            amount,
            Some(signer),
        )?;
        
        Ok(())
    }

    pub fn update_fee_collector(
        ctx: Context<UpdateFeeCollector>,
        new_fee_collector: Pubkey,
    ) -> Result<()> {
        let platform = &mut ctx.accounts.platform;
        let old_fee_collector = platform.fee_collector;
        platform.fee_collector = new_fee_collector;
        
        emit!(FeeCollectorUpdated {
            old_fee_collector,
            new_fee_collector,
        });
        
        Ok(())
    }
}

fn update_reward(project: &mut Account<Project>, stake: &mut Account<Stake>) -> Result<()> {
    let current_time = Clock::get()?.unix_timestamp;
    
    // Update project's reward tracking (kept for compatibility)
    if project.total_staked > 0 && current_time > project.last_update_time {
        let time_delta_i64 = current_time
            .checked_sub(project.last_update_time)
            .ok_or(ErrorCode::MathOverflow)?;
        
        require!(time_delta_i64 >= 0, ErrorCode::InvalidTimestamp);
        let time_delta = time_delta_i64 as u64;
        
        let effective_time = if current_time > project.pool_end_time {
            let time_until_end = project.pool_end_time
                .checked_sub(project.last_update_time)
                .unwrap_or(0)
                .max(0);
            
            require!(time_until_end >= 0, ErrorCode::InvalidTimestamp);
            time_until_end as u64
        } else {
            time_delta
        };
        
        if effective_time > 0 {
            let intermediate = (project.reward_rate_per_second as u128)
                .checked_mul(effective_time as u128)
                .ok_or(ErrorCode::MathOverflow)?;
            
            let result_u128 = intermediate
                .checked_div(project.total_staked as u128)
                .ok_or(ErrorCode::DivisionByZero)?;
            
            require!(result_u128 <= u64::MAX as u128, ErrorCode::MathOverflow);
            let rewards_per_token = result_u128 as u64;
            
            project.reward_per_token_stored = project.reward_per_token_stored
                .checked_add(rewards_per_token)
                .ok_or(ErrorCode::MathOverflow)?;
        }
    }
    
    project.last_update_time = current_time;
    
    // Calculate rewards for this specific stake
    if stake.amount > 0 && project.total_staked > 0 {
        let stake_last_update = stake.last_stake_timestamp;
        let time_since_stake_update = current_time
            .checked_sub(stake_last_update)
            .unwrap_or(0)
            .max(0);
        
        require!(time_since_stake_update >= 0, ErrorCode::InvalidTimestamp);
        
        // Adjust for pool end time
        let effective_time = if current_time > project.pool_end_time {
            if stake_last_update >= project.pool_end_time {
                0
            } else {
                (project.pool_end_time - stake_last_update).max(0) as u64
            }
        } else {
            time_since_stake_update as u64
        };
        
        if effective_time > 0 {
            let intermediate = (project.reward_rate_per_second as u128)
                .checked_mul(effective_time as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_mul(stake.amount as u128)
                .ok_or(ErrorCode::MathOverflow)?;
            
            // ✅ Check rate_mode to use correct formula
            let new_rewards_u128 = if project.rate_mode == 0 {
                // Fixed APY: reward_rate_per_second has 1e9 scaling
                // Formula: (amount × rate × time) / 1e9
                intermediate
                    .checked_div(1_000_000_000u128)
                    .ok_or(ErrorCode::DivisionByZero)?
            } else {
                // Dynamic pool: reward_rate_per_second is lamports/sec for entire pool
                // Formula: (amount × rate × time) / totalStaked
                intermediate
                    .checked_div(project.total_staked as u128)
                    .ok_or(ErrorCode::DivisionByZero)?
            };
            
            require!(new_rewards_u128 <= u64::MAX as u128, ErrorCode::MathOverflow);
            let new_rewards = new_rewards_u128 as u64;
            
            stake.rewards_pending = stake.rewards_pending
                .checked_add(new_rewards)
                .ok_or(ErrorCode::MathOverflow)?;
        }
    }
    
    Ok(())
}

// Helper struct to reduce stack usage in reflection calculations
struct ReflectionCalc {
    current_balance: u64,
    last_balance: u64,
    new_tokens: u64,
    total_staked: u64,
}

fn update_reflection_internal(
    project: &mut Account<Project>,
    stake: &mut Account<Stake>,
    reflection_vault: Option<&InterfaceAccount<TokenAccount>>,
    update_user_paid_marker: bool,
) -> Result<()> {
    if project.reflection_vault.is_none() {
        return Ok(());
    }
    
    let vault = reflection_vault.ok_or(ErrorCode::ReflectionVaultRequired)?;
    let current_time = Clock::get()?.unix_timestamp;
    
    let is_native_sol = project.reflection_token
        .map(|mint| is_native_sol(&mint))
        .unwrap_or(false);
    
    let current_balance = if is_native_sol {
        // ✅ FIX: Exclude rent-exempt minimum from reflection calculations
        let total_lamports = vault.to_account_info().lamports();
        let rent = Rent::get()?;
        let rent_exempt_minimum = rent.minimum_balance(vault.to_account_info().data_len());
        total_lamports.saturating_sub(rent_exempt_minimum)
    } else {
        vault.amount
    };
    
    msg!("🔍 Reflection Type: {}", if is_native_sol { "Native SOL" } else { "SPL/Token-2022" });
    
    let calc = Box::new(ReflectionCalc {
        current_balance,
        last_balance: project.last_reflection_balance,
        new_tokens: current_balance.saturating_sub(project.last_reflection_balance),
        total_staked: project.total_staked,
    });

    if calc.current_balance < calc.last_balance {
        msg!("📉 Vault decreased - claim detected");
        project.last_reflection_balance = calc.current_balance;
        project.last_reflection_update_time = current_time;
        return Ok(());
    }

    msg!("🔍 New tokens: {}", calc.new_tokens);
        
    if calc.new_tokens > 0 && calc.total_staked > 0 {
        let per_token_rate = Box::new({
            let per_token_u128 = (calc.new_tokens as u128)
                .checked_mul(1_000_000_000u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(calc.total_staked as u128)
                .ok_or(ErrorCode::DivisionByZero)?;
            
            require!(per_token_u128 <= u64::MAX as u128, ErrorCode::MathOverflow);
            per_token_u128 as u64
        });
        
        project.reflection_per_token_stored = project.reflection_per_token_stored
            .checked_add(*per_token_rate)
            .ok_or(ErrorCode::MathOverflow)?;
        
        project.last_reflection_balance = calc.current_balance;
        project.last_reflection_update_time = current_time;
    }
    
    if stake.amount > 0 {
        let rate_diff = project.reflection_per_token_stored
            .saturating_sub(stake.reflection_per_token_paid);
        
        if rate_diff > 0 {
            let earned = Box::new({
                let earned_u128 = (rate_diff as u128)
                    .checked_mul(stake.amount as u128)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_div(1_000_000_000u128)
                    .ok_or(ErrorCode::DivisionByZero)?;
                
                require!(earned_u128 <= u64::MAX as u128, ErrorCode::MathOverflow);
                earned_u128 as u64
            });
            
            let net_earned = (*earned).saturating_sub(stake.reflection_debt);
            
            stake.reflections_pending = stake.reflections_pending
                .checked_add(net_earned)
                .ok_or(ErrorCode::MathOverflow)?;
            
            stake.reflection_debt = 0;
        }
        
        if update_user_paid_marker {
            stake.reflection_per_token_paid = project.reflection_per_token_stored;
        }
    }
    
    Ok(())
}

fn update_reflection(
    project: &mut Account<Project>,
    stake: &mut Account<Stake>,
    reflection_vault: Option<&InterfaceAccount<TokenAccount>>,
) -> Result<()> {
    update_reflection_internal(project, stake, reflection_vault, true)
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Platform::INIT_SPACE,
        seeds = [b"platform_v2"],
        bump
    )]
    pub platform: Account<'info, Platform>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    /// CHECK: Fee collector wallet
    pub fee_collector: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct CreateProject<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Project::INIT_SPACE,
        seeds = [b"project", token_mint.key().as_ref(), &pool_id.to_le_bytes()],
        bump
    )]
    pub project: Box<Account<'info, Project>>,
    
    #[account(
        init,
        payer = admin,
        seeds = [b"staking_vault", project.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = project,
        token::token_program = token_program,
    )]
    pub staking_vault: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        init,
        payer = admin,
        seeds = [b"reward_vault", project.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = project,
        token::token_program = token_program,
    )]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,
    
    pub token_mint: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64, params: InitializePoolParams)]
pub struct InitializePool<'info> {
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump,
        constraint = project.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub project: Box<Account<'info, Project>>,
    
    #[account(
        seeds = [b"staking_vault", project.key().as_ref()],
        bump,
    )]
    pub staking_vault: InterfaceAccount<'info, TokenAccount>,
    
    /// CHECK: Optional reflection token mint - validated in instruction logic
    pub reflection_token_mint: Option<AccountInfo<'info>>,
    
    /// CHECK: Reflection ATA - manually validated/created
    #[account(mut)]
    pub reflection_token_account: Option<AccountInfo<'info>>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    /// CHECK: Only used if reflections enabled
    pub associated_token_program: Option<AccountInfo<'info>>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub reflection_token_program: Option<AccountInfo<'info>>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct Deposit<'info> {
    #[account(
        seeds = [b"platform_v2"],
        bump = platform.bump,
    )]
    pub platform: Account<'info, Platform>,
    
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump
    )]
    pub project: Box<Account<'info, Project>>,
    
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Stake::INIT_SPACE,
        seeds = [b"stake", project.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub stake: Account<'info, Stake>,
    
    #[account(
        mut,
        seeds = [b"staking_vault", project.key().as_ref()],
        bump,
        constraint = staking_vault.mint == token_mint @ ErrorCode::WrongTokenType,
        constraint = staking_vault.key() == project.staking_vault @ ErrorCode::UnauthorizedVault
    )]
    pub staking_vault: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = fee_collector_token_account.owner == platform.fee_collector @ ErrorCode::InvalidFeeCollector
    )]
    pub fee_collector_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// CHECK: Fee collector wallet
    #[account(mut)]
    pub fee_collector: AccountInfo<'info>,
    
    /// CHECK: Referrer account (optional)
    pub referrer: Option<AccountInfo<'info>>,
    
    /// CHECK: Optional reflection vault
    pub reflection_vault: Option<InterfaceAccount<'info, TokenAccount>>,
    
    pub token_mint_account: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct Withdraw<'info> {
    #[account(
        seeds = [b"platform_v2"],
        bump = platform.bump,
    )]
    pub platform: Account<'info, Platform>,
    
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump
    )]
    pub project: Box<Account<'info, Project>>,
    
    #[account(
        mut,
        seeds = [b"stake", project.key().as_ref(), user.key().as_ref()],
        bump = stake.bump,
        constraint = stake.user == user.key() @ ErrorCode::Unauthorized,
        constraint = stake.project == project.key() @ ErrorCode::InvalidProject
    )]
    pub stake: Account<'info, Stake>,
    
    #[account(
        mut,
        seeds = [b"staking_vault", project.key().as_ref()],
        bump,
        constraint = staking_vault.mint == token_mint @ ErrorCode::WrongTokenType,
        constraint = staking_vault.key() == project.staking_vault @ ErrorCode::UnauthorizedVault
    )]
    pub staking_vault: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = withdrawal_token_account.owner == stake.withdrawal_wallet @ ErrorCode::InvalidWithdrawalWallet
    )]
    pub withdrawal_token_account: InterfaceAccount<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = fee_collector_token_account.owner == platform.fee_collector @ ErrorCode::InvalidFeeCollector
    )]
    pub fee_collector_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// CHECK: Fee collector wallet
    #[account(mut)]
    pub fee_collector: AccountInfo<'info>,
    
    /// CHECK: Referrer account (optional)
    pub referrer: Option<AccountInfo<'info>>,
    
    /// CHECK: Optional reflection vault
    pub reflection_vault: Option<InterfaceAccount<'info, TokenAccount>>,
    
    pub token_mint_account: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct Claim<'info> {
    #[account(
        seeds = [b"platform_v2"],
        bump = platform.bump,
    )]
    pub platform: Account<'info, Platform>,
    
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump
    )]
    pub project: Box<Account<'info, Project>>,
    
    #[account(
        mut,
        seeds = [b"stake", project.key().as_ref(), user.key().as_ref()],
        bump = stake.bump,
        constraint = stake.user == user.key() @ ErrorCode::Unauthorized,
        constraint = stake.project == project.key() @ ErrorCode::InvalidProject
    )]
    pub stake: Account<'info, Stake>,
    
    #[account(
        mut,
        seeds = [b"reward_vault", project.key().as_ref()],
        bump,
        constraint = reward_vault.mint == token_mint @ ErrorCode::WrongTokenType,
        constraint = reward_vault.key() == project.reward_vault @ ErrorCode::UnauthorizedVault
    )]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    
    /// CHECK: Fee collector wallet
    #[account(mut)]
    pub fee_collector: AccountInfo<'info>,
    
    /// CHECK: Referrer account (optional)
    pub referrer: Option<AccountInfo<'info>>,

    /// CHECK: Optional reflection vault
    pub reflection_vault: Option<InterfaceAccount<'info, TokenAccount>>,
    
    pub token_mint_account: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct ClaimReflections<'info> {
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump
    )]
    pub project: Box<Account<'info, Project>>,
    
    #[account(
        mut,
        seeds = [b"stake", project.key().as_ref(), user.key().as_ref()],
        bump = stake.bump,
        constraint = stake.user == user.key() @ ErrorCode::Unauthorized,
        constraint = stake.project == project.key() @ ErrorCode::InvalidProject
    )]
    pub stake: Account<'info, Stake>,
    
    #[account(
        seeds = [b"staking_vault", project.key().as_ref()],
        bump,
    )]
    pub staking_vault: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub reflection_vault: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_reflection_account: InterfaceAccount<'info, TokenAccount>,
    
    pub reflection_token_mint: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub user: Signer<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct RefreshReflections<'info> {
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump
    )]
    pub project: Box<Account<'info, Project>>,
    
    #[account(
        mut,
        seeds = [b"stake", project.key().as_ref(), user.key().as_ref()],
        bump = stake.bump,
        constraint = stake.user == user.key() @ ErrorCode::Unauthorized,
        constraint = stake.project == project.key() @ ErrorCode::InvalidProject
    )]
    pub stake: Account<'info, Stake>,
    
    #[account(mut)]
    pub reflection_vault: InterfaceAccount<'info, TokenAccount>,
    
    pub user: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct DepositRewards<'info> {
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump,
        constraint = project.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub project: Box<Account<'info, Project>>,
    
    #[account(
        mut,
        seeds = [b"reward_vault", project.key().as_ref()],
        bump,
        constraint = reward_vault.mint == token_mint @ ErrorCode::WrongTokenType,
        constraint = reward_vault.key() == project.reward_vault @ ErrorCode::UnauthorizedVault
    )]
    pub reward_vault: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub admin_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_mint_account: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct TransferAdmin<'info> {
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump,
        constraint = project.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub project: Account<'info, Project>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct UpdatePoolParams<'info> {
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump,
        constraint = project.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub project: Account<'info, Project>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct UpdatePoolDuration<'info> {
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump,
        constraint = project.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub project: Account<'info, Project>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct UpdateReferrer<'info> {
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump,
        constraint = project.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub project: Account<'info, Project>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct ToggleReflections<'info> {
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump,
        constraint = project.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub project: Account<'info, Project>,
    
    /// CHECK: Optional reflection vault
    pub reflection_vault: Option<InterfaceAccount<'info, TokenAccount>>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetFees<'info> {
    #[account(
        mut,
        seeds = [b"platform_v2"],
        bump = platform.bump,
        constraint = platform.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub platform: Account<'info, Platform>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct PauseControl<'info> {
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump,
        constraint = project.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub project: Account<'info, Project>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct EmergencyUnlockAccounts<'info> {
    #[account(
        mut,
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump,
        constraint = project.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub project: Account<'info, Project>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(token_mint: Pubkey, pool_id: u64)]
pub struct ClaimUnclaimedTokens<'info> {
    #[account(
        seeds = [b"project", token_mint.as_ref(), &pool_id.to_le_bytes()],
        bump = project.bump,
        constraint = project.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub project: Account<'info, Project>,
    
    #[account(
        mut,
        constraint = vault.mint == token_mint @ ErrorCode::WrongTokenType
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    
    #[account(mut)]
    pub admin_token_account: InterfaceAccount<'info, TokenAccount>,
    
    pub token_mint_account: InterfaceAccount<'info, Mint>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,

}

#[derive(Accounts)]
pub struct UpdateFeeCollector<'info> {
    #[account(
        mut,
        seeds = [b"platform_v2"],
        bump = platform.bump,
        constraint = platform.admin == admin.key() @ ErrorCode::Unauthorized
    )]
    pub platform: Account<'info, Platform>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Platform {
    pub admin: Pubkey,
    pub fee_collector: Pubkey,
    pub platform_token_fee_bps: u64,
    pub platform_sol_fee: u64,
    pub is_initialized: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Project {
    pub admin: Pubkey,
    pub token_mint: Pubkey,
    pub pool_id: u64,
    pub staking_vault: Pubkey,
    pub reward_vault: Pubkey,
    pub reflection_vault: Option<Pubkey>,
    pub reflection_token: Option<Pubkey>,
    
    pub total_staked: u64,
    pub total_rewards_deposited: u64,
    pub total_rewards_claimed: u64,
    
    pub rate_bps_per_year: u64,
    pub rate_mode: u8,
    pub reward_rate_per_second: u64,
    pub lockup_seconds: u64,
    pub pool_duration_seconds: u64,
    pub pool_start_time: i64,
    pub pool_end_time: i64,
    
    pub last_update_time: i64,
    pub reward_per_token_stored: u64,
    pub reflection_per_token_stored: u64,
    pub last_reflection_update_time: i64,
    pub last_reflection_balance: u64,
    
    pub referrer: Option<Pubkey>,
    pub referrer_split_bps: u64,
    
    pub is_paused: bool,
    pub deposit_paused: bool,
    pub withdraw_paused: bool,
    pub claim_paused: bool,
    pub is_initialized: bool,
    
    pub bump: u8,
    pub total_reflection_debt: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Stake {
    pub user: Pubkey,
    pub project: Pubkey,
    pub amount: u64,
    pub last_stake_timestamp: i64,
    pub withdrawal_wallet: Pubkey,
    pub reward_per_token_paid: u64,
    pub rewards_pending: u64,
    pub total_rewards_claimed: u64,
    pub reflection_per_token_paid: u64,
    pub reflections_pending: u64,
    pub total_reflections_claimed: u64,
    pub reflection_debt: u64,
    pub reward_rate_snapshot: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializePoolParams {
    pub rate_bps_per_year: u64,
    pub rate_mode: u8,
    pub lockup_seconds: u64,
    pub pool_duration_seconds: u64,
    pub referrer: Option<Pubkey>,
    pub referrer_split_bps: Option<u64>,
    pub enable_reflections: bool,
    pub reflection_token: Option<Pubkey>,  // ← ADD THIS LINE
}

#[event]
pub struct PlatformInitialized {
    pub admin: Pubkey,
    pub fee_collector: Pubkey,
    pub platform_token_fee_bps: u64,
    pub platform_sol_fee: u64,
}

#[event]
pub struct ProjectCreated {
    pub project: Pubkey,
    pub token_mint: Pubkey,
    pub staking_vault: Pubkey,
    pub reward_vault: Pubkey,
    pub admin: Pubkey,
}

#[event]
pub struct PoolInitialized {
    pub project: Pubkey,
    pub staking_vault: Pubkey,
    pub reward_vault: Pubkey,
    pub reflection_vault: Option<Pubkey>,
    pub rate_bps_per_year: u64,
    pub rate_mode: u8,
    pub lockup_seconds: u64,
    pub pool_duration_seconds: u64,
    pub reflections_enabled: bool,
}

#[event]
pub struct TokensDeposited {
    pub user: Pubkey,
    pub project: Pubkey,
    pub amount: u64,
    pub token_fee: u64,
    pub sol_fee: u64,
    pub new_total: u64,
}

#[event]
pub struct TokensWithdrawn {
    pub user: Pubkey,
    pub project: Pubkey,
    pub amount: u64,
    pub remaining: u64,
}

#[event]
pub struct RewardsClaimed {
    pub user: Pubkey,
    pub project: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ReflectionsClaimed {
    pub user: Pubkey,
    pub project: Pubkey,
    pub amount: u64,
}

#[event]
pub struct RewardsDeposited {
    pub project: Pubkey,
    pub amount: u64,
    pub total_rewards: u64,
    pub reward_rate: u64,
}

#[event]
pub struct AdminTransferred {
    pub project: Pubkey,
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct ProjectParamsUpdated {
    pub project: Pubkey,
    pub rate_bps_per_year: u64,
    pub lockup_seconds: u64,
}

#[event]
pub struct PoolDurationUpdated {
    pub project: Pubkey,
    pub duration_seconds: u64,
}

#[event]
pub struct ReferrerUpdated {
    pub project: Pubkey,
    pub referrer: Option<Pubkey>,
    pub split_bps: u64,
}

#[event]
pub struct ReflectionsEnabled {
    pub project: Pubkey,
    pub reflection_token: Pubkey,
    pub reflection_vault: Pubkey,
}

#[event]
pub struct ReflectionsDisabled {
    pub project: Pubkey,
}

#[event]
pub struct FeesUpdated {
    pub platform_token_fee_bps: u64,
    pub platform_sol_fee: u64,
}

#[event]
pub struct ProjectPaused {
    pub project: Pubkey,
}

#[event]
pub struct ProjectUnpaused {
    pub project: Pubkey,
}

#[event]
pub struct EmergencyUnlockEvent {
    pub project: Pubkey,
    pub admin: Pubkey,
}

#[event]
pub struct FeeCollectorUpdated {
    pub old_fee_collector: Pubkey,
    pub new_fee_collector: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Project is paused")]
    ProjectPaused,
    #[msg("Deposits are paused")]
    DepositsPaused,
    #[msg("Withdrawals are paused")]
    WithdrawalsPaused,
    #[msg("Claims are paused")]
    ClaimsPaused,
    #[msg("Lockup period not expired")]
    LockupNotExpired,
    #[msg("No stake found")]
    NoStake,
    #[msg("No rewards available")]
    NoRewards,
    #[msg("No reflections available")]
    NoReflections,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Already initialized")]
    AlreadyInitialized,
    #[msg("Not initialized")]
    NotInitialized,
    #[msg("Invalid split percentage")]
    InvalidSplitPercentage,
    #[msg("Reflection vault required")]
    ReflectionVaultRequired,
    #[msg("Reflection token required")]
    ReflectionTokenRequired,
    #[msg("Reflections not enabled")]
    ReflectionsNotEnabled,
    #[msg("Insufficient SOL for fee - would leave account below rent-exempt minimum")]
    InsufficientSolForFee,
    #[msg("Referrer address does not match project referrer")]
    InvalidReferrer,
    #[msg("Insufficient balance in vault")]
    InsufficientVaultBalance,
    #[msg("Insufficient rewards in reward vault")]
    InsufficientRewardVault,
    #[msg("Insufficient reflections in reflection vault")]
    InsufficientReflectionVault,
    #[msg("No stakers in pool")]
    NoStakers,
    #[msg("Invalid pool duration - must be greater than 0")]
    InvalidPoolDuration,
    #[msg("Division by zero")]
    DivisionByZero,
    #[msg("Invalid fee collector")]
    InvalidFeeCollector,
    #[msg("Calculated APR exceeds maximum u64 value")]
    AprTooHigh,
    #[msg("Wrong token type - must match project token mint")]
    WrongTokenType,
    #[msg("Unauthorized vault - must belong to this project")]
    UnauthorizedVault,
    #[msg("Invalid withdrawal wallet - does not match stake withdrawal_wallet")]
    InvalidWithdrawalWallet,
    #[msg("Invalid reflection vault - does not match project reflection vault")]
    InvalidReflectionVault,
    #[msg("Invalid project - stake does not belong to this project")]
    InvalidProject,
    #[msg("Inconsistent total staked - total_staked is less than withdrawal amount")]
    InconsistentTotalStaked,
    #[msg("Invalid timestamp - clock moved backwards")]
    InvalidTimestamp,
    #[msg("Pool has ended - cannot deposit after pool end time")]
    PoolEnded,
    #[msg("Invalid rate mode - must be 0 (fixed APY) or 1 (variable APR)")]
    InvalidRateMode,
    #[msg("Missing Associated Token Program - required when reflections are enabled")]
    MissingAssociatedTokenProgram,
    #[msg("Please refresh reflections before claiming - new tokens have arrived in the vault")]
    RefreshRequired,
}