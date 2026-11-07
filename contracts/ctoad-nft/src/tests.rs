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
    assert!(md.media.unwrap().starts_with("data:image/svg+xml;base64,"));
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

// ---------------------------------------------------------------------------------------------
// Art
// ---------------------------------------------------------------------------------------------

use crate::art::Category;

const CIRCLE: &str = r##"<circle cx="500" cy="500" r="300" fill="#4ade80"/>"##;

fn add_layer(c: &mut Contract, category: Category, name: &str, svg: &str) -> u32 {
    set(&acct("deployer"), NEAR / 10);
    c.add_layer(category, name.into(), svg.into(), None)
}

#[test]
fn owner_adds_layers_by_category() {
    let mut c = setup(3);
    assert_eq!(add_layer(&mut c, Category::Eyes, "smug", CIRCLE), 0);
    assert_eq!(add_layer(&mut c, Category::Eyes, "crying", CIRCLE), 1);
    assert_eq!(add_layer(&mut c, Category::Background, "green", CIRCLE), 0);

    let art = c.get_art();
    assert!(!art.frozen);
    assert_eq!(art.categories.len(), 7);
    assert_eq!(art.categories[0].category, Category::Background);
    assert_eq!(art.categories[0].layers[0].name, "green");
    let eyes = art.categories.iter().find(|v| v.category == Category::Eyes).unwrap();
    let names: Vec<_> = eyes.layers.iter().map(|l| (l.name.as_str(), l.weight)).collect();
    assert_eq!(names, vec![("smug", 1), ("crying", 1)]);
    assert_eq!(c.get_layer(Category::Eyes, 1).svg, CIRCLE);
}

#[test]
#[should_panic(expected = "Only the owner")]
fn only_the_owner_adds_layers() {
    let mut c = setup(3);
    set(&acct("mallory"), NEAR / 10);
    c.add_layer(Category::Eyes, "smug".into(), CIRCLE.into(), None);
}

#[test]
fn adding_a_layer_pays_its_storage_and_refunds_the_rest() {
    let mut c = setup(3);
    let svg = "x".repeat(3 * 1024);
    add_layer(&mut c, Category::Body, "green", &svg);
    let refund = get_created_receipts()
        .into_iter()
        .find(|r| r.receiver_id == acct("deployer"))
        .and_then(|r| match &r.actions[0] {
            MockAction::Transfer { deposit, .. } => Some(deposit.as_yoctonear()),
            _ => None,
        })
        .expect("no refund");
    let cost = NEAR / 10 - refund;
    println!("one 3 KB layer: {} NEAR", format_near(cost));
    assert!(cost > 3 * NEAR / 100 && cost < 4 * NEAR / 100);
}

#[test]
#[should_panic(expected = "A layer must be 1 to 8192 bytes")]
fn layers_have_a_size_limit() {
    let mut c = setup(3);
    add_layer(&mut c, Category::Body, "huge", &"x".repeat(8 * 1024 + 1));
}

#[test]
fn owner_replaces_a_layer_in_place() {
    let mut c = setup(3);
    add_layer(&mut c, Category::Headwear, "placeholder", CIRCLE);
    set(&acct("deployer"), NEAR / 10);
    c.replace_layer(Category::Headwear, 0, "crown".into(), "<path d=\"M0 0\"/>".into(), None);
    let layer = c.get_layer(Category::Headwear, 0);
    assert_eq!(layer.name, "crown");
    assert_eq!(layer.svg, "<path d=\"M0 0\"/>");
    assert_eq!(c.get_art().categories[5].layers[0].name, "crown");
}

#[test]
#[should_panic(expected = "No layer at that index")]
fn cannot_replace_a_missing_layer() {
    let mut c = setup(3);
    set(&acct("deployer"), NEAR / 10);
    c.replace_layer(Category::Headwear, 0, "crown".into(), CIRCLE.into(), None);
}

#[test]
#[should_panic(expected = "The art is frozen")]
fn frozen_art_cannot_change() {
    let mut c = setup(3);
    add_layer(&mut c, Category::Eyes, "smug", CIRCLE);
    set(&acct("deployer"), 1);
    c.freeze_art();
    assert!(c.get_art().frozen);
    add_layer(&mut c, Category::Eyes, "crying", CIRCLE);
}

/// Two layers in every category: "<category> a" and "<category> b".
fn full_art() -> Contract {
    let mut c = setup(500);
    for category in crate::art::CATEGORIES {
        for suffix in ["a", "b"] {
            add_layer(&mut c, category, &format!("{category:?} {suffix}"), CIRCLE);
        }
    }
    c
}

#[test]
fn mint_picks_one_layer_per_category() {
    let mut c = full_art();
    mint(&mut c, &acct("alice"));
    let traits = c.ctoad_traits("1".into());
    assert_eq!(traits.len(), 7);
    for (t, category) in traits.iter().zip(crate::art::CATEGORIES) {
        assert_eq!(t.category, category);
        assert!(t.name.starts_with(&format!("{category:?} ")), "{}", t.name);
    }
}

#[test]
fn ctoads_minted_in_the_same_block_get_different_traits() {
    let mut c = full_art();
    for _ in 0..20 {
        mint(&mut c, &acct("alice"));
    }
    let names = |id: &str| -> Vec<String> {
        c.ctoad_traits(id.into()).into_iter().map(|t| t.name).collect()
    };
    let first = names("1");
    assert!((2..=20).any(|id| names(&id.to_string()) != first));
}

#[test]
fn an_empty_category_is_skipped_and_the_mint_still_works() {
    let mut c = setup(3);
    add_layer(&mut c, Category::Eyes, "smug", CIRCLE);
    mint(&mut c, &acct("alice"));
    let traits = c.ctoad_traits("1".into());
    assert_eq!(traits.len(), 1);
    assert_eq!(traits[0].category, Category::Eyes);
    assert_eq!(traits[0].name, "smug");
}

#[test]
fn minting_works_without_any_art() {
    let mut c = setup(3);
    mint(&mut c, &acct("alice"));
    assert!(c.ctoad_traits("1".into()).is_empty());
}

#[test]
fn weights_make_a_layer_rarer() {
    let mut c = setup(500);
    set(&acct("deployer"), NEAR / 10);
    c.add_layer(Category::Headwear, "cap".into(), CIRCLE.into(), Some(9));
    set(&acct("deployer"), NEAR / 10);
    c.add_layer(Category::Headwear, "crown".into(), CIRCLE.into(), None);
    for _ in 0..400 {
        mint(&mut c, &acct("alice"));
    }
    let crowns = (1..=400)
        .filter(|id| c.ctoad_traits(id.to_string())[0].name == "crown")
        .count();
    println!("crowns: {crowns} of 400");
    // Expect about 40 (1 in 10).
    assert!((20..=60).contains(&crowns), "{crowns}");
}

#[test]
fn replacing_a_layer_can_change_its_weight() {
    let mut c = setup(3);
    add_layer(&mut c, Category::Headwear, "crown", CIRCLE);
    set(&acct("deployer"), NEAR / 10);
    c.replace_layer(Category::Headwear, 0, "crown".into(), CIRCLE.into(), Some(5));
    assert_eq!(c.get_art().categories[5].layers[0].weight, 5);
}

#[test]
#[should_panic(expected = "The weight must be positive")]
fn weights_must_be_positive() {
    let mut c = setup(3);
    set(&acct("deployer"), NEAR / 10);
    c.add_layer(Category::Headwear, "crown".into(), CIRCLE.into(), Some(0));
}

#[test]
#[should_panic(expected = "CTOad #9 doesn't exist")]
fn no_traits_for_a_missing_ctoad() {
    let c = setup(3);
    c.ctoad_traits("9".into());
}

fn decode_media(token: &Token) -> String {
    use near_sdk::base64::{engine::general_purpose::STANDARD, Engine};
    let media = token.metadata.as_ref().unwrap().media.as_deref().unwrap();
    let b64 = media.strip_prefix("data:image/svg+xml;base64,").expect("not an SVG data URI");
    String::from_utf8(STANDARD.decode(b64).unwrap()).unwrap()
}

#[test]
fn the_image_stacks_the_layers_background_first() {
    let mut c = setup(3);
    add_layer(&mut c, Category::Item, "bag", "<g id=\"item\"/>");
    add_layer(&mut c, Category::Background, "green", "<g id=\"bg\"/>");
    add_layer(&mut c, Category::Eyes, "smug", "<g id=\"eyes\"/>");
    mint(&mut c, &acct("alice"));
    assert_eq!(
        c.ctoad_svg("1".into()),
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><g id="bg"/><g id="eyes"/><g id="item"/></svg>"#
    );
}

#[test]
fn without_art_the_image_shows_the_ctoad_number() {
    let mut c = setup(3);
    mint(&mut c, &acct("alice"));
    mint(&mut c, &acct("bob"));
    let svg = c.ctoad_svg("2".into());
    assert!(svg.contains(">CTOad #2</text>"), "{svg}");
}

#[test]
fn media_is_the_image_and_extra_has_the_traits() {
    let mut c = setup(3);
    add_layer(&mut c, Category::Eyes, "smug", CIRCLE);
    let alice = acct("alice");
    mint(&mut c, &alice);

    let token = c.nft_token("1".into()).unwrap();
    assert_eq!(decode_media(&token), c.ctoad_svg("1".into()));
    let extra: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(token.metadata.unwrap().extra.as_deref().unwrap()).unwrap();
    assert_eq!(extra["traits"][0]["category"], "Eyes");
    assert_eq!(extra["traits"][0]["name"], "smug");
    assert_eq!(extra["first_owner"], "alice.testnet");

    // The lists wallets and marketplaces read have the image too.
    let mine = c.nft_tokens_for_owner(alice, None, None);
    assert_eq!(decode_media(&mine[0]), c.ctoad_svg("1".into()));
    assert_eq!(decode_media(&c.nft_tokens(None, None)[0]), c.ctoad_svg("1".into()));
}

#[test]
fn replacing_a_layer_changes_ctoads_already_minted() {
    let mut c = setup(3);
    add_layer(&mut c, Category::Headwear, "placeholder", "<g id=\"old\"/>");
    mint(&mut c, &acct("alice"));
    set(&acct("deployer"), NEAR / 10);
    c.replace_layer(Category::Headwear, 0, "crown".into(), "<g id=\"crown\"/>".into(), None);
    let token = c.nft_token("1".into()).unwrap();
    assert!(decode_media(&token).contains("<g id=\"crown\"/>"));
}
