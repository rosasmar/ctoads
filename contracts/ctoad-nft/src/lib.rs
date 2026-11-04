//! CTOads: 500 NFTs that only the $CTO token contract can mint, each one going to a wallet that
//! lost at least the token's loss threshold trading $CTO. Implements NEP-171 (core),
//! NEP-177 (metadata), NEP-178 (approvals, so marketplaces can list them) and NEP-181
//! (enumeration, so apps can list every CTOad).
//!
//! Holders call `claim` here. This contract checks ownership on the spot, then tells the
//! $CTO contract to pay out the fees those CTOads have earned. Fees belong to the token ID,
//! so they move with the NFT when it's sold.

use std::collections::HashMap;

use near_contract_standards::non_fungible_token::{
    approval::NonFungibleTokenApproval,
    core::{NonFungibleTokenCore, NonFungibleTokenResolver},
    enumeration::NonFungibleTokenEnumeration,
    events::NftMint,
    metadata::{NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata},
    NonFungibleToken, Token, TokenId,
};
use near_sdk::{
    assert_one_yocto,
    collections::LazyOption,
    env, ext_contract,
    json_types::U128,
    log, near, require,
    serde_json::json,
    AccountId, BorshStorageKey, Gas, PanicOnDefault, Promise, PromiseOrValue,
};

#[cfg(test)]
mod tests;

const GAS_FOR_PAYOUT: Gas = Gas::from_tgas(20);
const MAX_CLAIM_BATCH: usize = 50;
const YOCTO_PER_CENTI_NEAR: u128 = 10u128.pow(22);

#[ext_contract(ext_cto)]
#[allow(dead_code)]
trait CtoToken {
    fn ctoad_payout(&mut self, token_ids: Vec<TokenId>, receiver_id: AccountId) -> U128;
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    OwnerById,
    Metadata,
    TokenMetadata,
    Enumeration,
    Approval,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    owner_id: AccountId,
    /// The $CTO token contract: the only minter, and the payer of fees.
    cto_token_id: AccountId,
    max_supply: u32,
    minted: u32,
}

#[near(serializers = [json])]
pub struct CtoadStatus {
    pub minted: u32,
    pub max_supply: u32,
    pub sold_out: bool,
    pub cto_token_id: AccountId,
}

#[near]
impl Contract {
    /// `max_supply` must equal `max_ctoads` on the token contract.
    /// Fund this account at deploy: it pays for each CTOad's storage from its own balance.
    #[init]
    pub fn new(
        owner_id: AccountId,
        cto_token_id: AccountId,
        max_supply: u32,
        metadata: NFTContractMetadata,
    ) -> Self {
        require!(max_supply > 0, "max_supply must be positive");
        metadata.assert_valid();
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::OwnerById,
                owner_id.clone(),
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            owner_id,
            cto_token_id,
            max_supply,
            minted: 0,
        }
    }

    /// Mints the next CTOad to `receiver_id`. Only the $CTO token contract can call this, and
    /// only after a sale at a loss of at least its threshold. Returns the new token ID ("1"..="500").
    pub fn mint_ctoad(&mut self, receiver_id: AccountId, loss: U128) -> TokenId {
        require!(
            env::predecessor_account_id() == self.cto_token_id,
            "Only the $CTO contract can mint CTOads"
        );
        require!(self.minted < self.max_supply, "All CTOads have been minted");
        self.minted += 1;
        let token_id = self.minted.to_string();

        let metadata = TokenMetadata {
            title: Some(format!("CTOad #{token_id}")),
            description: Some(format!(
                "Earned by losing {} NEAR on $CTO. Holders of all {} CTOads split $CTO trading fees.",
                format_near(loss.0),
                self.max_supply
            )),
            media: Some(format!("{token_id}.png")),
            copies: Some(1),
            issued_at: Some(env::block_timestamp_ms().to_string()),
            extra: Some(json!({ "loss": loss, "first_owner": receiver_id }).to_string()),
            ..Default::default()
        };
        // No refund account: this contract pays for storage from its own balance.
        self.tokens.internal_mint_with_refund(
            token_id.clone(),
            receiver_id.clone(),
            Some(metadata),
            None,
        );
        NftMint { owner_id: &receiver_id, token_ids: &[&token_id], memo: Some("rekt") }.emit();
        if self.minted == self.max_supply {
            log!("CTOad #{} minted. The bagholders have taken over.", token_id);
        }
        token_id
    }

    /// Claims the $CTO trading fees earned by the CTOads you own. You pay your own gas
    /// (attach about 100 Tgas). Returns the yoctoNEAR paid out.
    pub fn claim(&self, token_ids: Vec<TokenId>) -> Promise {
        require!(
            !token_ids.is_empty() && token_ids.len() <= MAX_CLAIM_BATCH,
            format!("Claim between 1 and {MAX_CLAIM_BATCH} CTOads at a time")
        );
        let caller = env::predecessor_account_id();
        for token_id in &token_ids {
            let owner = self
                .tokens
                .owner_by_id
                .get(token_id)
                .unwrap_or_else(|| env::panic_str(&format!("CTOad #{token_id} doesn't exist")));
            require!(owner == caller, format!("You don't own CTOad #{token_id}"));
        }
        ext_cto::ext(self.cto_token_id.clone())
            .with_static_gas(GAS_FOR_PAYOUT)
            .with_unused_gas_weight(1)
            .ctoad_payout(token_ids, caller)
    }

    /// Points `media` at the art once it's hosted. Only cosmetic: this contract has no
    /// say over minting rules or fees.
    #[payable]
    pub fn set_base_uri(&mut self, base_uri: String) {
        assert_one_yocto();
        require!(env::predecessor_account_id() == self.owner_id, "Only the owner");
        let mut metadata = self.metadata.get().unwrap();
        metadata.base_uri = Some(base_uri);
        self.metadata.set(&metadata);
    }

    pub fn ctoad_status(&self) -> CtoadStatus {
        CtoadStatus {
            minted: self.minted,
            max_supply: self.max_supply,
            sold_out: self.minted == self.max_supply,
            cto_token_id: self.cto_token_id.clone(),
        }
    }
}

/// yoctoNEAR -> "1.23"
fn format_near(yocto: u128) -> String {
    let centi = yocto / YOCTO_PER_CENTI_NEAR;
    format!("{}.{:02}", centi / 100, centi % 100)
}

// -------------------------------------------------------------------------------------------
// NEP-171 / 177 / 178 / 181: delegated to near-contract-standards
// -------------------------------------------------------------------------------------------

#[near]
impl NonFungibleTokenCore for Contract {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.tokens.nft_transfer(receiver_id, token_id, approval_id, memo);
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.tokens.nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Contract {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        self.tokens.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id,
            approved_account_ids,
        )
    }
}

#[near]
impl NonFungibleTokenApproval for Contract {
    #[payable]
    fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        self.tokens.nft_approve(token_id, account_id, msg)
    }

    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(token_id, account_id);
    }

    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.tokens.nft_revoke_all(token_id);
    }

    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        self.tokens.nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Contract {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens.nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Contract {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().unwrap()
    }
}
