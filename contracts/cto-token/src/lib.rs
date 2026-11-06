//! $CTO: a NEP-141 memecoin that trades on its own bonding curve, tracks every wallet's cost
//! basis, and mints a CTOad NFT to any wallet that sells at a loss of at least `loss_threshold`.
//! Once the last CTOad is minted, trading fees go to CTOad holders and the treasury.
//!
//! Lifecycle:
//!   buy()  -> NEAR in, $CTO out. Adds the NEAR spent (fee included) to the buyer's cost basis.
//!   sell() -> $CTO in, NEAR out. loss = cost basis of the tokens sold - NEAR received.
//!             A large enough loss calls the CTOad contract's `mint_ctoad`.
//!   on_ctoad_minted() -> counts confirmed mints. The last one flips `takeover`. Also creates the
//!             CTOad's own account, `ctoad-<id>.<this contract>`, which runs the global
//!             `ctoad-account` wallet contract.
//!   sweep() -> moves fees a CTOad has earned into its account. Anyone can call it.
//!   ctoad_payout() -> only the CTOad contract can call it, after checking ownership in `claim`.
//!             Sends the CTOad its earned fees, then has its account pay the holder.
//!   treasury_payout() -> only the CTOad contract can call it, for a proposal that passed.
//!             Sends NEAR from the treasury.
//!
//! The contract has no admin functions. Every setting is fixed at `new`.

use near_contract_standards::fungible_token::{
    core::FungibleTokenCore,
    events::{FtBurn, FtMint},
    metadata::{FungibleTokenMetadata, FungibleTokenMetadataProvider},
    resolver::FungibleTokenResolver,
    FungibleToken,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::{
    assert_one_yocto,
    collections::LazyOption,
    env, ext_contract,
    json_types::{Base58CryptoHash, U128, U64},
    log, near, require,
    serde_json::{self, json},
    store::LookupMap,
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    PromiseOrValue,
};

mod curve;
mod events;
mod fees;
#[cfg(test)]
mod tests;

const GAS_FOR_MINT: Gas = Gas::from_tgas(30);
/// Covers counting the mint and starting creation of the CTOad's account.
const GAS_FOR_ON_MINTED: Gas = Gas::from_tgas(20);
const GAS_FOR_ON_TRANSFER: Gas = Gas::from_tgas(5);
const GAS_FOR_ACCOUNT_WITHDRAW: Gas = Gas::from_tgas(5);
/// A sell that earns a CTOad must carry enough gas to finish the mint. Otherwise the whole
/// sell fails, so the seller can retry with more gas instead of losing the CTOad.
const MIN_GAS_FOR_MINTING_SELL: Gas = Gas::from_tgas(100);
const MAX_FEE_BPS: u16 = 1_000;
const MAX_SWEEP_BATCH: usize = 50;
/// "ctoad-500." is 10 characters, and account IDs can be at most 64.
const MAX_PARENT_ID_LEN: usize = 54;

#[ext_contract(ext_ctoad)]
#[allow(dead_code)]
trait CtoadNft {
    fn mint_ctoad(&mut self, receiver_id: AccountId, loss: U128) -> String;
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Token,
    Metadata,
    Holders,
    Claimed,
    MintRetries,
    CtoadAccounts,
}

/// Lifecycle of a CTOad's own account. No entry means it hasn't been created.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum CtoadAccountState {
    Creating,
    Ready,
}

/// Fixed at deploy. There are no setters.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Config {
    /// Deployer. Gets 100% of fees until the takeover, then nothing.
    pub owner_id: AccountId,
    /// The CTOad NFT contract. The only account that can request fee payouts.
    pub ctoad_contract_id: AccountId,
    /// Fee on every curve buy and sell, in basis points (100 = 1%).
    pub fee_bps: u16,
    /// Smallest realized loss, in yoctoNEAR, that earns a CTOad. 1 NEAR = 10^24.
    pub loss_threshold: U128,
    /// Total number of CTOads. Minting the last one triggers the takeover. Must match the NFT contract.
    pub max_ctoads: u32,
    /// If true, each account can earn at most one CTOad.
    pub one_per_wallet: bool,
    /// A loss only counts if the seller's most recent buy is at least this old.
    pub min_hold_secs: u64,
    /// Code hash of the `ctoad-account` wallet contract, already deployed as a global contract.
    pub ctoad_account_code_hash: Base58CryptoHash,
    /// yoctoNEAR given to each new CTOad account for its storage. It comes out of the
    /// deployer's pre-takeover fees, or out of the deposit attached to `create_ctoad_account`.
    pub ctoad_account_deposit: U128,
}

#[near(serializers = [borsh])]
#[derive(Default)]
pub struct Holder {
    /// yoctoNEAR spent on the tokens this account currently holds, fees included.
    pub cost_basis: u128,
    pub last_buy_ns: u64,
    pub earned_ctoad: bool,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    config: Config,
    virtual_near: u128,
    real_near: u128,
    holders: LookupMap<AccountId, Holder>,
    holder_storage_usage: u64,
    fees: fees::FeeRouter,
    /// CTOad slots claimed by qualifying sells. Covers mints in flight and failed mints waiting to be retried.
    ctoads_reserved: u32,
    /// CTOads the NFT contract has confirmed as minted.
    ctoads_minted: u32,
    takeover: bool,
    /// Account -> losses whose mint failed. Anyone can retry them with `retry_mint`.
    mint_retries: LookupMap<AccountId, Vec<u128>>,
    /// CTOad number -> state of its account (`ctoad-<n>.<this contract>`).
    ctoad_accounts: LookupMap<u32, CtoadAccountState>,
}

#[near]
impl Contract {
    /// `total_supply` is minted to the curve (this contract's own account).
    /// `virtual_near_reserve` sets the starting price: price = virtual_near_reserve / total_supply.
    #[init]
    pub fn new(
        config: Config,
        metadata: FungibleTokenMetadata,
        total_supply: U128,
        virtual_near_reserve: U128,
    ) -> Self {
        require!(config.fee_bps <= MAX_FEE_BPS, "fee_bps can be at most 1000 (10%)");
        require!(config.max_ctoads > 0, "max_ctoads must be positive");
        require!(config.loss_threshold.0 > 0, "loss_threshold must be positive");
        require!(total_supply.0 > 0 && virtual_near_reserve.0 > 0, "empty curve");
        require!(
            env::current_account_id().len() <= MAX_PARENT_ID_LEN,
            "Account ID too long for ctoad-<id> sub-accounts (max 54 characters)"
        );
        metadata.assert_valid();

        let mut this = Self {
            token: FungibleToken::new(StorageKey::Token),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            config,
            virtual_near: virtual_near_reserve.0,
            real_near: 0,
            holders: LookupMap::new(StorageKey::Holders),
            holder_storage_usage: 0,
            fees: fees::FeeRouter::new(StorageKey::Claimed),
            ctoads_reserved: 0,
            ctoads_minted: 0,
            takeover: false,
            mint_retries: LookupMap::new(StorageKey::MintRetries),
            ctoad_accounts: LookupMap::new(StorageKey::CtoadAccounts),
        };
        this.measure_holder_storage_usage();

        let curve = env::current_account_id();
        this.token.internal_register_account(&curve);
        this.token.internal_deposit(&curve, total_supply.0);
        FtMint { owner_id: &curve, amount: total_supply, memo: Some("bonding curve reserve") }
            .emit();
        this
    }

    // ---------------------------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------------------------

    /// Buy $CTO with the attached NEAR. A first-time buyer also pays for their own storage,
    /// which comes out of the attached deposit. Returns the amount of $CTO bought.
    #[payable]
    pub fn buy(&mut self, min_tokens_out: Option<U128>) -> U128 {
        let buyer = env::predecessor_account_id();
        let curve_id = env::current_account_id();
        require!(buyer != curve_id, "The curve can't buy from itself");
        let attached = env::attached_deposit().as_yoctonear();

        // Register new buyers and charge them exactly the storage they add.
        let storage_before = env::storage_usage();
        if !self.token.accounts.contains_key(&buyer) {
            self.token.internal_register_account(&buyer);
        }
        if !self.holders.contains_key(&buyer) {
            self.holders.insert(buyer.clone(), Holder::default());
            self.holders.flush();
        }
        let storage_cost = storage_cost(env::storage_usage() - storage_before);
        require!(
            attached > storage_cost,
            format!("Attach more than {storage_cost} yoctoNEAR (storage for a new holder)")
        );

        let spent = attached - storage_cost;
        let fee = curve::fee(spent, self.config.fee_bps);
        let near_in = spent - fee;
        let tokens_out = curve::tokens_out(self.near_reserve(), self.token_reserve(), near_in);
        require!(tokens_out > 0, "Buy is too small");
        if let Some(min) = min_tokens_out {
            require!(tokens_out >= min.0, "Slippage: fewer tokens than min_tokens_out");
        }

        self.real_near += near_in;
        self.token.internal_transfer(&curve_id, &buyer, tokens_out, Some("buy".into()));
        let holder = self.holders.get_mut(&buyer).unwrap();
        holder.cost_basis += spent;
        holder.last_buy_ns = env::block_timestamp();
        self.fees.route(fee, self.takeover, self.config.max_ctoads);

        events::emit(
            "buy",
            json!({
                "account_id": buyer,
                "near_spent": U128(spent),
                "fee": U128(fee),
                "tokens_out": U128(tokens_out),
            }),
        );
        U128(tokens_out)
    }

    /// Sell `amount` $CTO back to the curve for NEAR. Requires exactly 1 yoctoNEAR, so the
    /// wallet has to confirm it (a dapp's function-call key can't sell on your behalf).
    /// Returns the NEAR paid out, after fees. A loss of at least `loss_threshold` mints a CTOad.
    #[payable]
    pub fn sell(&mut self, amount: U128, min_near_out: Option<U128>) -> U128 {
        assert_one_yocto();
        let seller = env::predecessor_account_id();
        let curve_id = env::current_account_id();
        let amount = amount.0;
        require!(amount > 0, "Amount must be positive");
        let balance = self.token.internal_unwrap_balance_of(&seller);
        require!(balance >= amount, "Not enough $CTO");

        let gross = curve::near_out(self.near_reserve(), self.token_reserve(), amount);
        require!(gross <= self.real_near, "Curve is short on NEAR"); // ruled out by the curve math
        let fee = curve::fee(gross, self.config.fee_bps);
        let near_out = gross - fee;
        require!(near_out > 0, "Sell is too small");
        if let Some(min) = min_near_out {
            require!(near_out >= min.0, "Slippage: less NEAR than min_near_out");
        }

        // Realize this sale's share of the seller's cost basis.
        let mut loss = 0;
        let mut earns_ctoad = false;
        if let Some(holder) = self.holders.get_mut(&seller) {
            let basis = curve::pro_rata(holder.cost_basis, amount, balance);
            holder.cost_basis -= basis;
            loss = basis.saturating_sub(near_out);

            let held_ns = env::block_timestamp().saturating_sub(holder.last_buy_ns);
            earns_ctoad = loss >= self.config.loss_threshold.0
                && self.ctoads_reserved < self.config.max_ctoads
                && !(self.config.one_per_wallet && holder.earned_ctoad)
                && held_ns >= self.config.min_hold_secs.saturating_mul(1_000_000_000);
            if earns_ctoad {
                holder.earned_ctoad = true;
            }
        }

        self.token.internal_transfer(&seller, &curve_id, amount, Some("sell".into()));
        self.real_near -= gross;
        self.fees.route(fee, self.takeover, self.config.max_ctoads);
        Promise::new(seller.clone()).transfer(NearToken::from_yoctonear(near_out)).detach();

        if earns_ctoad {
            require!(
                env::prepaid_gas() >= MIN_GAS_FOR_MINTING_SELL,
                "This sell earns a CTOad. Attach at least 100 Tgas so it can be minted."
            );
            self.ctoads_reserved += 1;
            self.request_mint(seller.clone(), loss);
        }

        events::emit(
            "sell",
            json!({
                "account_id": seller,
                "tokens_in": U128(amount),
                "near_out": U128(near_out),
                "fee": U128(fee),
                "loss": U128(loss),
                "earned_ctoad": earns_ctoad,
            }),
        );
        U128(near_out)
    }

    // ---------------------------------------------------------------------------------------
    // CTOad minting
    // ---------------------------------------------------------------------------------------

    #[private]
    pub fn on_ctoad_minted(&mut self, account_id: AccountId, loss: U128) -> Option<String> {
        let token_id = env::promise_result_checked(0, 64)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<String>(&bytes).ok());
        match token_id {
            Some(token_id) => {
                self.ctoads_minted += 1;
                events::emit(
                    "ctoad_minted",
                    json!({ "account_id": account_id, "token_id": token_id, "loss": loss }),
                );
                if self.ctoads_minted == self.config.max_ctoads {
                    self.takeover = true;
                    events::emit("takeover", json!({ "ctoads": self.config.max_ctoads }));
                }
                // Give the new CTOad its own account, paid for from the deployer's fees.
                // If those don't cover it, anyone can create it later with `create_ctoad_account`.
                if let Ok(n) = token_id.parse::<u32>() {
                    if !self.start_ctoad_account(n, None) {
                        log!("Not enough deployer fees to open CTOad #{}'s account yet", n);
                    }
                }
                Some(token_id)
            }
            None => {
                // The slot stays reserved for this account until a retry succeeds.
                let mut losses = self.mint_retries.get(&account_id).cloned().unwrap_or_default();
                losses.push(loss.0);
                self.mint_retries.insert(account_id.clone(), losses);
                log!("CTOad mint for {} failed. Call retry_mint to try again.", account_id);
                None
            }
        }
    }

    /// Re-sends a failed mint. Anyone can call it, and the CTOad always goes to the original seller.
    pub fn retry_mint(&mut self, account_id: AccountId) {
        let mut losses = self.mint_retries.remove(&account_id).expect("No failed mint for this account");
        require!(env::prepaid_gas() >= MIN_GAS_FOR_MINTING_SELL, "Attach at least 100 Tgas");
        let loss = losses.pop().unwrap();
        if !losses.is_empty() {
            self.mint_retries.insert(account_id.clone(), losses);
        }
        self.request_mint(account_id, loss);
    }

    // ---------------------------------------------------------------------------------------
    // CTOad accounts
    // ---------------------------------------------------------------------------------------

    /// Creates a minted CTOad's account if it doesn't exist yet. You only need this if the
    /// deployer's fees couldn't cover it at mint time. Attach `ctoad_account_deposit` to pay for
    /// it yourself (the excess is refunded), or attach nothing to use the deployer's fees.
    #[payable]
    pub fn create_ctoad_account(&mut self, token_id: String) {
        let n = self.parse_ctoad(&token_id);
        require!(n <= self.ctoads_minted, "That CTOad hasn't been minted yet");
        require!(
            !self.ctoad_accounts.contains_key(&n),
            "That CTOad's account already exists or is being created"
        );
        let deposit = self.config.ctoad_account_deposit.0;
        let attached = env::attached_deposit().as_yoctonear();
        let payer = if attached == 0 {
            None
        } else {
            require!(attached >= deposit, format!("Attach at least {deposit} yoctoNEAR"));
            if attached > deposit {
                Promise::new(env::predecessor_account_id())
                    .transfer(NearToken::from_yoctonear(attached - deposit))
                    .detach();
            }
            Some(env::predecessor_account_id())
        };
        require!(
            self.start_ctoad_account(n, payer),
            format!("Deployer fees can't cover it. Attach {deposit} yoctoNEAR to pay for it.")
        );
    }

    #[private]
    pub fn on_ctoad_account_created(&mut self, n: u32, payer: Option<AccountId>) {
        if transfer_failed() {
            self.ctoad_accounts.remove(&n);
            let deposit = self.config.ctoad_account_deposit.0;
            match payer {
                None => self.fees.deployer_unwithdrawn += deposit,
                Some(payer) => Promise::new(payer)
                    .transfer(NearToken::from_yoctonear(deposit))
                    .detach(),
            }
            log!("Creating CTOad #{}'s account failed. Its deposit was returned.", n);
        } else {
            self.ctoad_accounts.insert(n, CtoadAccountState::Ready);
            events::emit(
                "ctoad_account_created",
                json!({ "token_id": n.to_string(), "account_id": self.ctoad_account(n) }),
            );
        }
    }

    /// Moves the fees each CTOad has earned into its own account, so the balance shows up there
    /// on-chain. Anyone can call it, and it never pays out to a holder. CTOads whose account
    /// isn't ready are skipped.
    pub fn sweep(&mut self, token_ids: Vec<String>) -> U128 {
        require!(token_ids.len() <= MAX_SWEEP_BATCH, "Sweep at most 50 CTOads at a time");
        let mut total = 0;
        for token_id in &token_ids {
            let n = self.parse_ctoad(token_id);
            if !self.ctoad_account_ready(n) {
                continue;
            }
            let owed = self.fees.take(n);
            if owed > 0 {
                total += owed;
                let account = self.ctoad_account(n);
                Promise::new(account.clone())
                    .transfer(NearToken::from_yoctonear(owed))
                    .then(self.on_payout_callback(account, vec![(n, U128(owed))]))
                    .detach();
            }
        }
        U128(total)
    }

    // ---------------------------------------------------------------------------------------
    // Fees
    // ---------------------------------------------------------------------------------------

    /// Pays out everything `token_ids` have earned to `receiver_id`. Only the CTOad contract can
    /// call this, after its `claim` has checked that `receiver_id` owns every one of those tokens.
    ///
    /// For a CTOad whose account is ready, this sends the account its unswept fees and then
    /// calls its `withdraw`. The holder receives the account's whole balance: swept fees, new
    /// fees, and anything else sent to it. A CTOad without an account yet is paid directly, so
    /// fees are never stuck. Returns the fees taken from the running total.
    pub fn ctoad_payout(&mut self, token_ids: Vec<String>, receiver_id: AccountId) -> U128 {
        require!(
            env::predecessor_account_id() == self.config.ctoad_contract_id,
            "Only the CTOad contract can request payouts"
        );
        let mut seen = Vec::new();
        let mut total = 0u128;
        let mut direct = Vec::new();
        for token_id in &token_ids {
            let n = self.parse_ctoad(token_id);
            if seen.contains(&n) {
                continue;
            }
            seen.push(n);
            let owed = self.fees.take(n);
            total += owed;
            if self.ctoad_account_ready(n) {
                self.pay_through_account(n, owed, &receiver_id);
            } else if owed > 0 {
                direct.push((n, U128(owed)));
            }
        }
        let direct_total: u128 = direct.iter().map(|(_, a)| a.0).sum();
        if direct_total > 0 {
            Promise::new(receiver_id.clone())
                .transfer(NearToken::from_yoctonear(direct_total))
                .then(self.on_payout_callback(receiver_id.clone(), direct))
                .detach();
        }
        events::emit(
            "claim",
            json!({ "account_id": receiver_id, "token_ids": token_ids, "amount": U128(total) }),
        );
        U128(total)
    }

    #[private]
    pub fn on_payout(&mut self, receiver_id: AccountId, paid: Vec<(u32, U128)>) {
        if transfer_failed() {
            for (n, amount) in paid {
                self.fees.untake(n, amount.0);
            }
            log!("Payout to {} failed. The fees stay with the CTOads.", receiver_id);
        }
    }

    /// Sends the deployer's pre-takeover fees to `owner_id`. Anyone can call it, but the money
    /// only ever goes to the owner.
    pub fn withdraw_deployer_fees(&mut self) -> U128 {
        let amount = std::mem::take(&mut self.fees.deployer_unwithdrawn);
        if amount > 0 {
            Promise::new(self.config.owner_id.clone())
                .transfer(NearToken::from_yoctonear(amount))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_FOR_ON_TRANSFER)
                        .on_deployer_withdraw(U128(amount)),
                )
                .detach();
        }
        U128(amount)
    }

    #[private]
    pub fn on_deployer_withdraw(&mut self, amount: U128) {
        if transfer_failed() {
            self.fees.deployer_unwithdrawn += amount.0;
        }
    }

    /// Sends `amount` from the treasury to `receiver_id`. Only the CTOad contract can call this,
    /// for a proposal that passed. Resolves to true once the NEAR is sent, or false if the
    /// transfer failed and the amount went back into the treasury.
    pub fn treasury_payout(&mut self, receiver_id: AccountId, amount: U128) -> Promise {
        require!(
            env::predecessor_account_id() == self.config.ctoad_contract_id,
            "Only the CTOad contract can pay from the treasury"
        );
        require!(
            amount.0 > 0 && amount.0 <= self.fees.treasury_balance,
            "The treasury doesn't hold that much"
        );
        self.fees.treasury_balance -= amount.0;
        Promise::new(receiver_id.clone())
            .transfer(NearToken::from_yoctonear(amount.0))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_ON_TRANSFER)
                    .on_treasury_payout(receiver_id, amount),
            )
    }

    #[private]
    pub fn on_treasury_payout(&mut self, receiver_id: AccountId, amount: U128) -> bool {
        if transfer_failed() {
            self.fees.treasury_balance += amount.0;
            log!("Treasury payout to {} failed. The NEAR stays in the treasury.", receiver_id);
            return false;
        }
        events::emit("treasury_payout", json!({ "receiver_id": receiver_id, "amount": amount }));
        true
    }

    // ---------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_market(&self) -> MarketView {
        let decimals = self.metadata.get().unwrap().decimals as u32;
        MarketView {
            real_near_reserve: U128(self.real_near),
            virtual_near_reserve: U128(self.virtual_near),
            token_reserve: U128(self.token_reserve()),
            circulating_supply: U128(self.token.total_supply - self.token_reserve()),
            price_per_token: U128(curve::mul_div(
                self.near_reserve(),
                10u128.pow(decimals),
                self.token_reserve(),
            )),
            ctoads_minted: self.ctoads_minted,
            ctoads_reserved: self.ctoads_reserved,
            max_ctoads: self.config.max_ctoads,
            takeover: self.takeover,
            deployer_fees_unwithdrawn: U128(self.fees.deployer_unwithdrawn),
            deployer_fees_total: U128(self.fees.deployer_total),
            holder_fees_total: U128(self.fees.holders_total),
            fees_per_ctoad: U128(self.fees.per_ctoad),
            treasury_balance: U128(self.fees.treasury_balance),
            treasury_total: U128(self.fees.treasury_total),
        }
    }

    pub fn get_holder(&self, account_id: AccountId) -> HolderView {
        let holder = self.holders.get(&account_id);
        HolderView {
            balance: U128(self.token.accounts.get(&account_id).unwrap_or(0)),
            cost_basis: U128(holder.map_or(0, |h| h.cost_basis)),
            last_buy_ns: U64(holder.map_or(0, |h| h.last_buy_ns)),
            earned_ctoad: holder.is_some_and(|h| h.earned_ctoad),
            failed_mints: self.mint_retries.get(&account_id).map_or(0, |v| v.len() as u32),
        }
    }

    /// Previews a buy. `storage_cost` is only charged on an account's first buy.
    pub fn quote_buy(&self, account_id: AccountId, near_amount: U128) -> BuyQuote {
        // Both usages were measured with a 64-character account ID, and keys are stored
        // byte-for-byte, so subtract the bytes this account ID doesn't use.
        let unused_key_bytes = 64 - account_id.len() as u64;
        let mut storage_bytes = 0;
        if !self.token.accounts.contains_key(&account_id) {
            storage_bytes += self.token.account_storage_usage - unused_key_bytes;
        }
        if !self.holders.contains_key(&account_id) {
            storage_bytes += self.holder_storage_usage - unused_key_bytes;
        }
        let storage = storage_cost(storage_bytes);
        let spent = near_amount.0.saturating_sub(storage);
        let fee = curve::fee(spent, self.config.fee_bps);
        BuyQuote {
            tokens_out: U128(curve::tokens_out(self.near_reserve(), self.token_reserve(), spent - fee)),
            fee: U128(fee),
            storage_cost: U128(storage),
        }
    }

    /// Previews a sell, including whether it would earn a CTOad. Use this for the
    /// "sell now and you mint CTOad #N" moment in the UI.
    pub fn quote_sell(&self, account_id: AccountId, amount: U128) -> SellQuote {
        let balance = self.token.accounts.get(&account_id).unwrap_or(0);
        let gross = curve::near_out(self.near_reserve(), self.token_reserve(), amount.0);
        let fee = curve::fee(gross, self.config.fee_bps);
        let near_out = gross - fee;
        let (loss, eligible) = match self.holders.get(&account_id) {
            Some(h) if amount.0 <= balance => {
                let basis = curve::pro_rata(h.cost_basis, amount.0, balance);
                let held_ns = env::block_timestamp().saturating_sub(h.last_buy_ns);
                (
                    basis.saturating_sub(near_out),
                    !(self.config.one_per_wallet && h.earned_ctoad)
                        && held_ns >= self.config.min_hold_secs.saturating_mul(1_000_000_000),
                )
            }
            _ => (0, false),
        };
        SellQuote {
            near_out: U128(near_out),
            fee: U128(fee),
            loss: U128(loss),
            earns_ctoad: eligible
                && loss >= self.config.loss_threshold.0
                && self.ctoads_reserved < self.config.max_ctoads,
        }
    }

    /// Fees each CTOad in `token_ids` has earned that haven't been sent to its account yet, in
    /// yoctoNEAR. What a holder can claim is this plus the account's own balance (see
    /// `get_ctoad_account`, and `available` on the account itself).
    pub fn ctoad_unclaimed(&self, token_ids: Vec<String>) -> Vec<U128> {
        token_ids.iter().map(|id| U128(self.fees.unclaimed(self.parse_ctoad(id)))).collect()
    }

    /// The account belonging to CTOad `token_id`, e.g. `ctoad-42.cto.near`.
    pub fn ctoad_account_id(&self, token_id: String) -> AccountId {
        self.ctoad_account(self.parse_ctoad(&token_id))
    }

    pub fn get_ctoad_account(&self, token_id: String) -> CtoadAccountView {
        let n = self.parse_ctoad(&token_id);
        CtoadAccountView {
            account_id: self.ctoad_account(n),
            state: self.ctoad_accounts.get(&n).copied(),
            unswept_fees: U128(self.fees.unclaimed(n)),
        }
    }
}

// -------------------------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------------------------

impl Contract {
    fn near_reserve(&self) -> u128 {
        self.virtual_near + self.real_near
    }

    fn token_reserve(&self) -> u128 {
        self.token.accounts.get(&env::current_account_id()).unwrap_or(0)
    }

    fn request_mint(&self, account_id: AccountId, loss: u128) {
        ext_ctoad::ext(self.config.ctoad_contract_id.clone())
            .with_static_gas(GAS_FOR_MINT)
            .mint_ctoad(account_id.clone(), U128(loss))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_ON_MINTED)
                    .on_ctoad_minted(account_id, U128(loss)),
            )
            .detach();
    }

    fn ctoad_account(&self, n: u32) -> AccountId {
        format!("ctoad-{n}.{}", env::current_account_id()).parse().unwrap()
    }

    fn ctoad_account_ready(&self, n: u32) -> bool {
        self.ctoad_accounts.get(&n) == Some(&CtoadAccountState::Ready)
    }

    /// Starts creating `ctoad-<n>` with the global wallet contract. With `payer` set to None,
    /// the deposit comes out of the deployer's fees, and this returns false if they're too low.
    fn start_ctoad_account(&mut self, n: u32, payer: Option<AccountId>) -> bool {
        if self.ctoad_accounts.contains_key(&n) {
            return true;
        }
        let deposit = self.config.ctoad_account_deposit.0;
        if payer.is_none() {
            if self.fees.deployer_unwithdrawn < deposit {
                return false;
            }
            self.fees.deployer_unwithdrawn -= deposit;
        }
        self.ctoad_accounts.insert(n, CtoadAccountState::Creating);
        Promise::new(self.ctoad_account(n))
            .create_account()
            .transfer(NearToken::from_yoctonear(deposit))
            .use_global_contract(self.config.ctoad_account_code_hash)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_ON_TRANSFER)
                    .on_ctoad_account_created(n, payer),
            )
            .detach();
        true
    }

    /// One receipt to the CTOad's account: first the unswept fees arrive, then `withdraw` sends
    /// the account's whole balance to the holder. If the receipt fails, both steps are undone
    /// and the fees go back on the CTOad's balance.
    fn pay_through_account(&self, n: u32, owed: u128, receiver_id: &AccountId) {
        let account = self.ctoad_account(n);
        let mut promise = Promise::new(account.clone());
        if owed > 0 {
            promise = promise.transfer(NearToken::from_yoctonear(owed));
        }
        let promise = promise.function_call(
            "withdraw".to_string(),
            receiver_id.as_bytes().to_vec(),
            NearToken::from_yoctonear(0),
            GAS_FOR_ACCOUNT_WITHDRAW,
        );
        if owed > 0 {
            promise.then(self.on_payout_callback(account, vec![(n, U128(owed))])).detach();
        } else {
            promise.detach();
        }
    }

    fn on_payout_callback(&self, receiver_id: AccountId, paid: Vec<(u32, U128)>) -> Promise {
        Self::ext(env::current_account_id())
            .with_static_gas(GAS_FOR_ON_TRANSFER)
            .on_payout(receiver_id, paid)
    }

    fn parse_ctoad(&self, token_id: &str) -> u32 {
        match token_id.parse::<u32>() {
            Ok(n) if n >= 1 && n <= self.config.max_ctoads => n,
            _ => env::panic_str(&format!("{token_id} is not a CTOad id")),
        }
    }

    /// Moving tokens out by plain transfer takes a proportional share of the sender's cost
    /// basis, so their average cost doesn't change. The receiver gets zero basis, which means
    /// gifted tokens and tokens bought on outside DEXes can never manufacture a loss.
    fn before_transfer(&mut self, sender_id: &AccountId, receiver_id: &AccountId, amount: u128) {
        require!(
            receiver_id != &env::current_account_id(),
            "Use sell() to sell $CTO to the curve"
        );
        let balance = self.token.accounts.get(sender_id).unwrap_or(0);
        if amount == 0 || amount > balance {
            return; // the standard implementation rejects the transfer
        }
        if let Some(holder) = self.holders.get_mut(sender_id) {
            holder.cost_basis -= curve::pro_rata(holder.cost_basis, amount, balance);
        }
    }

    fn measure_holder_storage_usage(&mut self) {
        let before = env::storage_usage();
        let tmp: AccountId = "a".repeat(64).parse().unwrap();
        self.holders.insert(tmp.clone(), Holder::default());
        self.holders.flush();
        self.holder_storage_usage = env::storage_usage() - before;
        self.holders.remove(&tmp);
        self.holders.flush();
    }
}

fn storage_cost(bytes: u64) -> u128 {
    env::storage_byte_cost().as_yoctonear() * bytes as u128
}

fn transfer_failed() -> bool {
    matches!(env::promise_result_checked(0, 0), Err(PromiseError::Failed))
}

// -------------------------------------------------------------------------------------------
// NEP-141 / NEP-145 / NEP-148
// -------------------------------------------------------------------------------------------

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.before_transfer(&env::predecessor_account_id(), &receiver_id, amount.0);
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        // Tokens refunded by the receiver come back with zero cost basis.
        self.before_transfer(&env::predecessor_account_id(), &receiver_id, amount.0);
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, burned) =
            self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        if burned > 0 {
            log!("Burned {} $CTO from a deleted sender", burned);
        }
        used.into()
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        match self.token.internal_storage_unregister(force) {
            Some((account_id, balance)) => {
                // Keep the holder record so `earned_ctoad` can't be reset by re-registering.
                if let Some(holder) = self.holders.get_mut(&account_id) {
                    holder.cost_basis = 0;
                }
                if balance > 0 {
                    FtBurn { owner_id: &account_id, amount: U128(balance), memo: Some("unregister") }
                        .emit();
                }
                true
            }
            None => false,
        }
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().unwrap()
    }
}

// -------------------------------------------------------------------------------------------
// View types
// -------------------------------------------------------------------------------------------

#[near(serializers = [json])]
pub struct MarketView {
    pub real_near_reserve: U128,
    pub virtual_near_reserve: U128,
    pub token_reserve: U128,
    pub circulating_supply: U128,
    /// yoctoNEAR per whole $CTO (10^decimals base units) at the current spot price.
    pub price_per_token: U128,
    pub ctoads_minted: u32,
    pub ctoads_reserved: u32,
    pub max_ctoads: u32,
    pub takeover: bool,
    pub deployer_fees_unwithdrawn: U128,
    pub deployer_fees_total: U128,
    pub holder_fees_total: U128,
    pub fees_per_ctoad: U128,
    pub treasury_balance: U128,
    pub treasury_total: U128,
}

#[near(serializers = [json])]
pub struct CtoadAccountView {
    pub account_id: AccountId,
    /// null = not created yet, "Creating", or "Ready".
    pub state: Option<CtoadAccountState>,
    /// Earned fees still held by the token contract and not yet swept into the account.
    pub unswept_fees: U128,
}

#[near(serializers = [json])]
pub struct HolderView {
    pub balance: U128,
    pub cost_basis: U128,
    pub last_buy_ns: U64,
    pub earned_ctoad: bool,
    pub failed_mints: u32,
}

#[near(serializers = [json])]
pub struct BuyQuote {
    pub tokens_out: U128,
    pub fee: U128,
    pub storage_cost: U128,
}

#[near(serializers = [json])]
pub struct SellQuote {
    pub near_out: U128,
    pub fee: U128,
    pub loss: U128,
    pub earns_ctoad: bool,
}
