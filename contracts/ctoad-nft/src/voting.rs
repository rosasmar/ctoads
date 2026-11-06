//! Treasury proposals and voting.
//!
//! Once every CTOad is minted, any holder can propose sending NEAR from the treasury to an
//! account. Each CTOad has one vote per proposal, recorded by token ID, so a CTOad sold after
//! voting can't vote again under its new owner.
//!
//! A proposal passes as soon as yes votes reach 51% of all CTOads, and fails as soon as no votes
//! do. Otherwise it's decided when the voting period ends: it passes if at least 51% of the
//! votes cast are yes and at least 10% of all CTOads voted.

use near_contract_standards::non_fungible_token::{
    enumeration::NonFungibleTokenEnumeration, TokenId,
};
use near_sdk::{env, json_types::U128, log, near, require, AccountId, NearToken, Promise};

use crate::{Contract, ContractExt};

/// Longest proposal description, in bytes.
const MAX_DESCRIPTION_LEN: usize = 280;
/// Most CTOads that can vote in one call.
const MAX_VOTE_BATCH: usize = 100;
/// Share of all CTOads whose yes (or no) votes decide a proposal early.
const MAJORITY_PCT: u32 = 51;
/// Share of all CTOads that must vote for a proposal to pass when the period ends.
const MIN_TURNOUT_PCT: u32 = 10;

#[near(serializers = [borsh])]
pub struct Proposal {
    pub proposer: AccountId,
    pub description: String,
    pub receiver_id: AccountId,
    pub amount: u128,
    pub voting_ends_ns: u64,
    pub yes: u32,
    pub no: u32,
    /// One bit per CTOad, set once that CTOad has voted.
    pub voted: Vec<u8>,
}

#[near(serializers = [json])]
#[derive(PartialEq, Debug)]
pub enum ProposalStatus {
    Open,
    Passed,
    Failed,
}

#[near(serializers = [json])]
pub struct ProposalView {
    pub id: u32,
    pub proposer: AccountId,
    pub description: String,
    pub receiver_id: AccountId,
    pub amount: U128,
    pub voting_ends_ms: u64,
    pub yes: u32,
    pub no: u32,
    pub status: ProposalStatus,
}

#[near]
impl Contract {
    /// Proposes sending `amount` yoctoNEAR from the treasury to `receiver_id`. Only a CTOad
    /// holder can propose, once every CTOad is minted. Attach enough NEAR to cover the
    /// proposal's storage (about 0.01 NEAR). The rest is refunded. Returns the proposal ID.
    #[payable]
    pub fn propose(&mut self, description: String, receiver_id: AccountId, amount: U128) -> u32 {
        require!(self.minted == self.max_supply, "Proposals open once every CTOad is minted");
        let proposer = env::predecessor_account_id();
        require!(
            self.nft_supply_for_owner(proposer.clone()).0 > 0,
            "Only CTOad holders can propose"
        );
        require!(
            !description.is_empty() && description.len() <= MAX_DESCRIPTION_LEN,
            format!("The description must be 1 to {MAX_DESCRIPTION_LEN} bytes")
        );
        require!(amount.0 > 0, "The amount must be positive");

        let storage_before = env::storage_usage();
        self.proposals.push(Proposal {
            proposer: proposer.clone(),
            description,
            receiver_id,
            amount: amount.0,
            voting_ends_ns: env::block_timestamp() + self.voting_period_ns,
            yes: 0,
            no: 0,
            voted: vec![0; (self.max_supply as usize).div_ceil(8)],
        });
        self.proposals.flush();
        let cost = (env::storage_usage() - storage_before) as u128
            * env::storage_byte_cost().as_yoctonear();
        let attached = env::attached_deposit().as_yoctonear();
        require!(
            attached >= cost,
            format!("Attach at least {cost} yoctoNEAR for the proposal's storage")
        );
        if attached > cost {
            Promise::new(proposer.clone())
                .transfer(NearToken::from_yoctonear(attached - cost))
                .detach();
        }

        let id = self.proposals.len();
        log!("Proposal #{} by {}", id, proposer);
        id
    }

    /// Votes yes (`approve: true`) or no with CTOads you own, up to 100 per call. Each CTOad
    /// votes once per proposal, and votes are final.
    pub fn vote(&mut self, proposal_id: u32, token_ids: Vec<TokenId>, approve: bool) {
        require!(
            !token_ids.is_empty() && token_ids.len() <= MAX_VOTE_BATCH,
            format!("Vote with 1 to {MAX_VOTE_BATCH} CTOads at a time")
        );
        require!(
            self.proposal_status(self.proposal(proposal_id)) == ProposalStatus::Open,
            "Voting on this proposal has closed"
        );
        let caller = env::predecessor_account_id();
        let mut numbers = Vec::with_capacity(token_ids.len());
        for token_id in &token_ids {
            let owner = self
                .tokens
                .owner_by_id
                .get(token_id)
                .unwrap_or_else(|| env::panic_str(&format!("CTOad #{token_id} doesn't exist")));
            require!(owner == caller, format!("You don't own CTOad #{token_id}"));
            numbers.push(token_id.parse::<usize>().unwrap() - 1);
        }

        let proposal = self.proposals.get_mut(proposal_id - 1).unwrap();
        for (n, token_id) in numbers.into_iter().zip(&token_ids) {
            let (byte, bit) = (n / 8, 1u8 << (n % 8));
            require!(
                proposal.voted[byte] & bit == 0,
                format!("CTOad #{token_id} already voted on this proposal")
            );
            proposal.voted[byte] |= bit;
        }
        let votes = token_ids.len() as u32;
        if approve {
            proposal.yes += votes;
        } else {
            proposal.no += votes;
        }
        log!(
            "{} voted {} on proposal #{} with {} CTOad(s)",
            caller,
            if approve { "yes" } else { "no" },
            proposal_id,
            votes
        );
    }

    pub fn get_proposal(&self, proposal_id: u32) -> ProposalView {
        self.proposal_view(proposal_id)
    }

    /// Proposals in the order they were made, starting from ID `from_id` (default 1).
    pub fn get_proposals(&self, from_id: Option<u32>, limit: Option<u32>) -> Vec<ProposalView> {
        let from = from_id.unwrap_or(1).max(1);
        let to = self.proposals.len().min(from.saturating_add(limit.unwrap_or(50)) - 1);
        (from..=to).map(|id| self.proposal_view(id)).collect()
    }

    pub fn has_voted(&self, proposal_id: u32, token_id: TokenId) -> bool {
        let n = token_id.parse::<usize>().unwrap_or_else(|_| env::panic_str("Not a CTOad id"));
        require!(n >= 1 && n <= self.max_supply as usize, "Not a CTOad id");
        let voted = &self.proposal(proposal_id).voted;
        voted[(n - 1) / 8] & (1u8 << ((n - 1) % 8)) != 0
    }
}

impl Contract {
    fn proposal(&self, proposal_id: u32) -> &Proposal {
        proposal_id
            .checked_sub(1)
            .and_then(|i| self.proposals.get(i))
            .unwrap_or_else(|| env::panic_str(&format!("Proposal #{proposal_id} doesn't exist")))
    }

    fn proposal_status(&self, p: &Proposal) -> ProposalStatus {
        let majority = share_of(self.max_supply, MAJORITY_PCT);
        if p.yes >= majority {
            ProposalStatus::Passed
        } else if p.no >= majority {
            ProposalStatus::Failed
        } else if env::block_timestamp() < p.voting_ends_ns {
            ProposalStatus::Open
        } else {
            let cast = p.yes + p.no;
            let turnout = cast >= share_of(self.max_supply, MIN_TURNOUT_PCT);
            if turnout && p.yes * 100 >= cast * MAJORITY_PCT {
                ProposalStatus::Passed
            } else {
                ProposalStatus::Failed
            }
        }
    }

    fn proposal_view(&self, proposal_id: u32) -> ProposalView {
        let p = self.proposal(proposal_id);
        ProposalView {
            id: proposal_id,
            proposer: p.proposer.clone(),
            description: p.description.clone(),
            receiver_id: p.receiver_id.clone(),
            amount: U128(p.amount),
            voting_ends_ms: p.voting_ends_ns / 1_000_000,
            yes: p.yes,
            no: p.no,
            status: self.proposal_status(p),
        }
    }
}

/// `pct` percent of `total`, rounded up: 51% of 500 is 255, 51% of 3 is 2.
fn share_of(total: u32, pct: u32) -> u32 {
    (total * pct).div_ceil(100)
}
