use super::*;
use near_contract_standards::non_fungible_token::metadata::NFT_METADATA_SPEC;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
use near_sdk::{testing_env, NearToken};

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
        metadata: NFTContractMetadata,
    }
    let json = r#"{
      "owner_id": "me.testnet",
      "cto_token_id": "cto.me.testnet",
      "max_supply": 500,
      "metadata": {
        "spec": "nft-1.0.0", "name": "CTOads", "symbol": "CTOAD",
        "icon": null, "base_uri": null, "reference": null, "reference_hash": null
      }
    }"#;
    let args: NewArgs = near_sdk::serde_json::from_str(json).unwrap();
    args.metadata.assert_valid();
}
