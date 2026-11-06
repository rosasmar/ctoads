use super::*;
use near_contract_standards::non_fungible_token::metadata::NFT_METADATA_SPEC;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
use near_sdk::{testing_env, NearToken, PromiseError};

const NEAR: u128 = 10u128.pow(24);

fn nft_id() -> AccountId {
    "ctoads.cto.testnet".parse().unwrap()
}
fn cto_id() -> AccountId {
    "cto.testnet".parse().unwrap()
}
fn acct(name: &str) -> AccountId {
    format!("{name}.testnet").parse().unwrap()
}

fn set(predecessor: &AccountId, deposit: u128) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(nft_id())
        .predecessor_account_id(predecessor.clone())
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100))
        .build());
}

fn setup(max_supply: u32) -> Contract {
    set(&acct("deployer"), 0);
    Contract::new(
        acct("deployer"),
        cto_id(),
        max_supply,
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "CTOads".to_string(),
            symbol: "CTOAD".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        },
        None,
    )
}

fn mint(c: &mut Contract, to: &AccountId) -> TokenId {
    set(&cto_id(), 0);
    c.mint_ctoad(to.clone(), U128(NEAR + NEAR / 4))
}

#[test]
fn token_contract_mints_sequential_ctoads() {
    let mut c = setup(500);
    let alice = acct("alice");
    assert_eq!(mint(&mut c, &alice), "1");
    assert_eq!(mint(&mut c, &acct("bob")), "2");

    let t = c.nft_token("1".into()).unwrap();
    assert_eq!(t.owner_id, alice);
    let md = t.metadata.unwrap();
    assert_eq!(md.title.as_deref(), Some("CTOad #1"));
    assert_eq!(md.media.as_deref(), Some("1.png"));
    let description = md.description.unwrap();
    assert!(description.contains("losing 1.25 NEAR"));
    assert!(description.contains("ctoad-1.cto.testnet"));
    let extra: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(&md.extra.unwrap()).unwrap();
    assert_eq!(extra["account"], "ctoad-1.cto.testnet");
    assert_eq!(extra["first_owner"], "alice.testnet");
    assert_eq!(c.ctoad_account_id("42".into()).as_str(), "ctoad-42.cto.testnet");
    assert_eq!(c.nft_total_supply().0, 2);
    assert_eq!(c.ctoad_status().minted, 2);
}

#[test]
#[should_panic(expected = "Only the $CTO contract can mint CTOads")]
fn nobody_else_can_mint() {
    let mut c = setup(500);
    set(&acct("alice"), 0);
    c.mint_ctoad(acct("alice"), U128(10 * NEAR));
}

#[test]
#[should_panic(expected = "All CTOads have been minted")]
fn cap_is_enforced() {
    let mut c = setup(2);
    mint(&mut c, &acct("a"));
    mint(&mut c, &acct("b"));
    assert!(c.ctoad_status().sold_out);
    mint(&mut c, &acct("c"));
}

#[test]
fn ctoads_are_transferable() {
    let mut c = setup(500);
    let (alice, bob) = (acct("alice"), acct("bob"));
    mint(&mut c, &alice);
    set(&alice, 1);
    c.nft_transfer(bob.clone(), "1".into(), None, None);
    assert_eq!(c.nft_token("1".into()).unwrap().owner_id, bob);
    assert_eq!(c.nft_supply_for_owner(bob).0, 1);
}

#[test]
fn claim_checks_ownership_then_calls_payout() {
    let mut c = setup(500);
    let alice = acct("alice");
    mint(&mut c, &alice);
    mint(&mut c, &alice);
    set(&alice, 0);
    let _ = c.claim(vec!["1".into(), "2".into()]);

    let payout = get_created_receipts()
        .into_iter()
        .find(|r| r.receiver_id == cto_id())
        .expect("no call to the token contract");
    match &payout.actions[0] {
        MockAction::FunctionCallWeight { method_name, args, .. } => {
            assert_eq!(method_name, b"ctoad_payout");
            let args: near_sdk::serde_json::Value = near_sdk::serde_json::from_slice(args).unwrap();
            assert_eq!(args["receiver_id"], "alice.testnet");
            assert_eq!(args["token_ids"], json!(["1", "2"]));
        }
        other => panic!("unexpected action {other:?}"),
    }
}

#[test]
#[should_panic(expected = "You don't own CTOad #1")]
fn cannot_claim_someone_elses_ctoad() {
    let mut c = setup(500);
    mint(&mut c, &acct("alice"));
    set(&acct("mallory"), 0);
    let _ = c.claim(vec!["1".into()]);
}

#[test]
fn mint_storage_cost_per_ctoad() {
    let mut c = setup(500);
    let before = env::storage_usage();
    mint(&mut c, &acct("someone-with-a-longish-name"));
    let bytes = env::storage_usage() - before;
    let cost = bytes as u128 * env::storage_byte_cost().as_yoctonear();
    println!("one CTOad: {bytes} bytes = {} NEAR", format_near(cost));
    // Keep the storage estimate honest: under 0.01 NEAR per CTOad.
    assert!(cost < NEAR / 100, "{bytes} bytes");
}

#[test]
fn near_formatting() {
    assert_eq!(format_near(NEAR), "1.00");
    assert_eq!(format_near(NEAR * 123 / 100), "1.23");
    assert_eq!(format_near(42 * NEAR + 5 * NEAR / 1000), "42.00");
}

/// Same JSON shape that scripts/deploy.sh passes to `new`.
#[test]
fn deploy_script_init_args_parse() {
    #[derive(near_sdk::serde::Deserialize)]
    #[serde(crate = "near_sdk::serde")]
    #[allow(dead_code)]
    struct NewArgs {
        owner_id: AccountId,
        cto_token_id: AccountId,
        max_supply: u32,
        voting_period_secs: Option<u64>,
        metadata: NFTContractMetadata,
    }
    let json = r#"{
      "owner_id": "me.testnet",
      "cto_token_id": "cto.me.testnet",
      "max_supply": 500,
      "voting_period_secs": 2592000,
      "metadata": {
        "spec": "nft-1.0.0", "name": "CTOads", "symbol": "CTOAD",
        "icon": null, "base_uri": null, "reference": null, "reference_hash": null
      }
    }"#;
    let args: NewArgs = near_sdk::serde_json::from_str(json).unwrap();
    args.metadata.assert_valid();
    assert_eq!(args.voting_period_secs, Some(30 * 24 * 60 * 60));
}

// ---------------------------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------------------------

use crate::voting::ProposalStatus;

const DAY_NS: u64 = 24 * 60 * 60 * 1_000_000_000;

fn set_at(predecessor: &AccountId, deposit: u128, timestamp_ns: u64) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(nft_id())
        .predecessor_account_id(predecessor.clone())
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .account_balance(NearToken::from_near(100))
        .block_timestamp(timestamp_ns)
        .build());
}

/// Mints every CTOad: `owners[i]` gets CTOad #i+1.
fn sold_out(owners: &[&str]) -> Contract {
    let mut c = setup(owners.len() as u32);
    for owner in owners {
        mint(&mut c, &acct(owner));
    }
    c
}

fn propose(c: &mut Contract, by: &str) -> u32 {
    set_at(&acct(by), NEAR / 10, 0);
    c.propose("Pay the artist".into(), acct("artist"), U128(NEAR))
}

fn vote(c: &mut Contract, by: &str, ids: &[&str], approve: bool, timestamp_ns: u64) {
    set_at(&acct(by), 0, timestamp_ns);
    c.vote(1, ids.iter().map(|id| id.to_string()).collect(), approve);
}

fn status_at(c: &Contract, timestamp_ns: u64) -> ProposalStatus {
    set_at(&acct("anyone"), 0, timestamp_ns);
    c.get_proposal(1).status
}

#[test]
fn proposal_passes_early_at_51_percent_of_all_ctoads() {
    let mut c = sold_out(&["alice", "alice", "bob"]);
    assert_eq!(propose(&mut c, "alice"), 1);
    assert_eq!(status_at(&c, 0), ProposalStatus::Open);
    vote(&mut c, "alice", &["1", "2"], true, DAY_NS);
    // 2 of 3 is 51% of all CTOads, so it passes without waiting 30 days.
    assert_eq!(status_at(&c, DAY_NS), ProposalStatus::Passed);
    let p = c.get_proposal(1);
    assert_eq!((p.yes, p.no, p.amount.0), (2, 0, NEAR));
    assert_eq!(p.receiver_id, acct("artist"));
}

#[test]
fn proposal_fails_early_at_51_percent_no() {
    let mut c = sold_out(&["alice", "alice", "bob"]);
    propose(&mut c, "bob");
    vote(&mut c, "alice", &["1", "2"], false, DAY_NS);
    assert_eq!(status_at(&c, DAY_NS), ProposalStatus::Failed);
}

#[test]
fn proposal_passes_after_the_period_with_most_votes_cast() {
    let mut c = sold_out(&["alice", "alice", "bob", "carol", "carol", "carol", "carol", "carol"]);
    propose(&mut c, "alice");
    vote(&mut c, "alice", &["1", "2"], true, DAY_NS);
    vote(&mut c, "bob", &["3"], false, DAY_NS);
    // 2 yes of 3 votes cast, with turnout above 10%: open until the 30 days are up.
    assert_eq!(status_at(&c, 29 * DAY_NS), ProposalStatus::Open);
    assert_eq!(status_at(&c, 30 * DAY_NS), ProposalStatus::Passed);
}

#[test]
fn proposal_fails_after_the_period_without_enough_turnout() {
    let mut owners = vec!["alice"];
    owners.extend(["bob"; 19]);
    let mut c = sold_out(&owners);
    propose(&mut c, "alice");
    // 1 vote of 20 CTOads is under the 10% minimum, even though it's 100% yes.
    vote(&mut c, "alice", &["1"], true, DAY_NS);
    assert_eq!(status_at(&c, 30 * DAY_NS), ProposalStatus::Failed);
}

#[test]
#[should_panic(expected = "CTOad #1 already voted on this proposal")]
fn a_sold_ctoad_cannot_vote_again() {
    let mut c = sold_out(&["alice", "bob", "carol", "dave"]);
    propose(&mut c, "alice");
    vote(&mut c, "alice", &["1"], true, DAY_NS);
    set(&acct("alice"), 1);
    c.nft_transfer(acct("mallory"), "1".into(), None, None);
    vote(&mut c, "mallory", &["1"], true, DAY_NS);
}

#[test]
#[should_panic(expected = "You don't own CTOad #2")]
fn cannot_vote_with_someone_elses_ctoad() {
    let mut c = sold_out(&["alice", "bob", "carol"]);
    propose(&mut c, "alice");
    vote(&mut c, "alice", &["2"], true, DAY_NS);
}

#[test]
#[should_panic(expected = "Voting on this proposal has closed")]
fn cannot_vote_after_the_period() {
    let mut c = sold_out(&["alice", "bob", "carol"]);
    propose(&mut c, "alice");
    vote(&mut c, "bob", &["2"], true, 30 * DAY_NS);
}

#[test]
#[should_panic(expected = "Proposals open once every CTOad is minted")]
fn cannot_propose_before_every_ctoad_is_minted() {
    let mut c = setup(3);
    mint(&mut c, &acct("alice"));
    propose(&mut c, "alice");
}

#[test]
#[should_panic(expected = "Only CTOad holders can propose")]
fn only_holders_can_propose() {
    let mut c = sold_out(&["alice", "bob", "carol"]);
    propose(&mut c, "mallory");
}

#[test]
fn proposer_pays_the_storage_and_gets_the_rest_back() {
    let mut c = sold_out(&["alice", "bob", "carol"]);
    propose(&mut c, "alice");
    let refund = get_created_receipts()
        .into_iter()
        .find(|r| r.receiver_id == acct("alice"))
        .and_then(|r| match &r.actions[0] {
            MockAction::Transfer { deposit, .. } => Some(deposit.as_yoctonear()),
            _ => None,
        })
        .expect("no refund");
    let cost = NEAR / 10 - refund;
    println!("one proposal: {} NEAR", format_near(cost));
    assert!(cost > 0 && cost < NEAR / 100);
}

fn passed_proposal() -> Contract {
    let mut c = sold_out(&["alice", "alice", "bob"]);
    propose(&mut c, "alice");
    vote(&mut c, "alice", &["1", "2"], true, DAY_NS);
    c
}

/// The token contract's answer to `treasury_payout` arriving back here.
fn on_execute_with(c: &mut Contract, paid: Result<bool, PromiseError>) -> bool {
    set_at(&nft_id(), 0, DAY_NS);
    c.on_execute(1, paid)
}

#[test]
fn execute_asks_the_token_contract_to_pay_from_the_treasury() {
    let mut c = passed_proposal();
    set_at(&acct("anyone"), 0, DAY_NS);
    let _ = c.execute(1);

    let payout = get_created_receipts()
        .into_iter()
        .find(|r| r.receiver_id == cto_id())
        .expect("no call to the token contract");
    match &payout.actions[0] {
        MockAction::FunctionCallWeight { method_name, args, .. } => {
            assert_eq!(method_name, b"treasury_payout");
            let args: near_sdk::serde_json::Value = near_sdk::serde_json::from_slice(args).unwrap();
            assert_eq!(args["receiver_id"], "artist.testnet");
            assert_eq!(args["amount"], NEAR.to_string());
        }
        other => panic!("unexpected action {other:?}"),
    }
    assert!(on_execute_with(&mut c, Ok(true)));
    assert_eq!(status_at(&c, DAY_NS), ProposalStatus::Executed);
}

#[test]
#[should_panic(expected = "Only a passed proposal can be executed")]
fn cannot_execute_an_open_proposal() {
    let mut c = sold_out(&["alice", "bob", "carol"]);
    propose(&mut c, "alice");
    set_at(&acct("anyone"), 0, DAY_NS);
    let _ = c.execute(1);
}

#[test]
#[should_panic(expected = "Only a passed proposal can be executed")]
fn a_proposal_is_paid_only_once() {
    let mut c = passed_proposal();
    set_at(&acct("anyone"), 0, DAY_NS);
    let _ = c.execute(1);
    set_at(&acct("anyone"), 0, DAY_NS);
    let _ = c.execute(1);
}

#[test]
fn a_failed_payout_can_be_executed_again() {
    let mut c = passed_proposal();
    set_at(&acct("anyone"), 0, DAY_NS);
    let _ = c.execute(1);
    assert!(!on_execute_with(&mut c, Err(PromiseError::Failed)));
    assert_eq!(status_at(&c, DAY_NS), ProposalStatus::Passed);

    set_at(&acct("anyone"), 0, DAY_NS);
    let _ = c.execute(1);
    assert_eq!(status_at(&c, DAY_NS), ProposalStatus::Executed);
}
