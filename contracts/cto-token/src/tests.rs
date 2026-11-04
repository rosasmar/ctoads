use super::*;
use near_contract_standards::fungible_token::metadata::FT_METADATA_SPEC;
use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
use near_sdk::mock::MockAction;
use near_sdk::{testing_env, PromiseResult, RuntimeFeesConfig};

const NEAR: u128 = 10u128.pow(24);
const SUPPLY: u128 = 1_000_000_000 * 10u128.pow(18);

fn curve_id() -> AccountId {
    "cto.testnet".parse().unwrap()
}
fn ctoads_id() -> AccountId {
    "ctoads.cto.testnet".parse().unwrap()
}
fn owner() -> AccountId {
    "deployer.testnet".parse().unwrap()
}
fn acct(name: &str) -> AccountId {
    format!("{name}.testnet").parse().unwrap()
}

struct T {
    now_secs: u64,
}

impl T {
    fn ctx(&self, predecessor: &AccountId, deposit: u128) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id(curve_id())
            .predecessor_account_id(predecessor.clone())
            .signer_account_id(predecessor.clone())
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .account_balance(NearToken::from_near(10_000))
            .prepaid_gas(Gas::from_tgas(300))
            .block_timestamp(self.now_secs * 1_000_000_000);
        b
    }

    fn set(&self, predecessor: &AccountId, deposit: u128) {
        testing_env!(self.ctx(predecessor, deposit).build());
    }

    fn set_with_result(&self, predecessor: &AccountId, result: PromiseResult) {
        testing_env!(
            self.ctx(predecessor, 0).build(),
            near_sdk::test_vm_config(),
            RuntimeFeesConfig::test(),
            Default::default(),
            vec![result],
        );
    }
}

fn config(max_ctoads: u32, one_per_wallet: bool, min_hold_secs: u64) -> Config {
    Config {
        owner_id: owner(),
        ctoad_contract_id: ctoads_id(),
        fee_bps: 100,
        loss_threshold: U128(NEAR),
        max_ctoads,
        one_per_wallet,
        min_hold_secs,
    }
}

fn setup(cfg: Config) -> (T, Contract) {
    let t = T { now_secs: 1_000 };
    t.set(&owner(), 0);
    let metadata = FungibleTokenMetadata {
        spec: FT_METADATA_SPEC.to_string(),
        name: "CTO".to_string(),
        symbol: "CTO".to_string(),
        icon: None,
        reference: None,
        reference_hash: None,
        decimals: 18,
    };
    let c = Contract::new(cfg, metadata, U128(SUPPLY), U128(30 * NEAR));
    (t, c)
}

fn buy(t: &T, c: &mut Contract, who: &AccountId, near: u128) -> u128 {
    t.set(who, near);
    c.buy(None).0
}

fn sell(t: &T, c: &mut Contract, who: &AccountId, amount: u128) -> u128 {
    t.set(who, 1);
    c.sell(U128(amount), None).0
}

fn mint_calls() -> Vec<String> {
    get_created_receipts()
        .into_iter()
        .filter(|r| r.receiver_id == ctoads_id())
        .flat_map(|r| r.actions)
        .filter_map(|a| match a {
            MockAction::FunctionCallWeight { method_name, .. } => {
                Some(String::from_utf8(method_name).unwrap())
            }
            _ => None,
        })
        .collect()
}

/// Simulates the CTOad contract's reply to `mint_ctoad`.
fn confirm_mint(t: &T, c: &mut Contract, who: &AccountId, token_id: u32) {
    t.set_with_result(
        &curve_id(),
        PromiseResult::Successful(format!("\"{token_id}\"").into_bytes()),
    );
    c.on_ctoad_minted(who.clone(), U128(NEAR));
}

#[test]
fn buy_records_cost_basis_and_routes_fee_to_deployer() {
    let (t, mut c) = setup(config(500, true, 0));
    let alice = acct("alice");
    let tokens = buy(&t, &mut c, &alice, 10 * NEAR);
    assert!(tokens > 0);

    let h = c.get_holder(alice.clone());
    assert_eq!(h.balance.0, tokens);
    let storage = 10 * NEAR - h.cost_basis.0;
    assert!(storage > 0 && storage < NEAR / 100, "storage charge {storage}");

    let m = c.get_market();
    let fee = h.cost_basis.0 / 100;
    assert_eq!(m.deployer_fees_unwithdrawn.0, fee);
    assert_eq!(m.real_near_reserve.0, h.cost_basis.0 - fee);
    assert!(!m.takeover);
}

#[test]
fn second_buy_charges_no_storage() {
    let (t, mut c) = setup(config(500, true, 0));
    let alice = acct("alice");
    buy(&t, &mut c, &alice, NEAR);
    let before = c.get_holder(alice.clone()).cost_basis.0;
    buy(&t, &mut c, &alice, NEAR);
    assert_eq!(c.get_holder(alice).cost_basis.0, before + NEAR);
}

#[test]
fn small_loss_earns_nothing() {
    let (t, mut c) = setup(config(500, true, 0));
    let alice = acct("alice");
    let tokens = buy(&t, &mut c, &alice, 10 * NEAR);
    let q = c.quote_sell(alice.clone(), U128(tokens));
    sell(&t, &mut c, &alice, tokens);
    assert!(q.loss.0 > 0 && q.loss.0 < NEAR);
    assert!(!q.earns_ctoad);
    assert_eq!(c.get_market().ctoads_reserved, 0);
    assert!(mint_calls().is_empty());
}

#[test]
fn losing_one_near_requests_a_ctoad() {
    let (t, mut c) = setup(config(500, true, 0));
    let alice = acct("alice");
    // Buying 60 NEAR and selling straight away loses about 1.2 NEAR to fees (1% each way).
    let tokens = buy(&t, &mut c, &alice, 60 * NEAR);
    let q = c.quote_sell(alice.clone(), U128(tokens));
    assert!(q.earns_ctoad);

    let out = sell(&t, &mut c, &alice, tokens);
    assert_eq!(out, q.near_out.0);
    assert!(q.loss.0 >= NEAR);
    assert_eq!(mint_calls(), vec!["mint_ctoad".to_string()]);
    assert_eq!(c.get_market().ctoads_reserved, 1);
    assert_eq!(c.get_market().ctoads_minted, 0);
    assert!(c.get_holder(alice).earned_ctoad);
}

#[test]
fn price_drop_loss_counts() {
    let (t, mut c) = setup(config(500, true, 0));
    let (alice, bob) = (acct("alice"), acct("bob"));
    let bob_tokens = buy(&t, &mut c, &bob, 20 * NEAR);
    let alice_tokens = buy(&t, &mut c, &alice, 5 * NEAR);
    // Bob dumps first, so Alice is left holding the bag.
    sell(&t, &mut c, &bob, bob_tokens);
    let q = c.quote_sell(alice.clone(), U128(alice_tokens));
    assert!(q.loss.0 >= NEAR, "loss {}", q.loss.0);
    sell(&t, &mut c, &alice, alice_tokens);
    assert_eq!(c.get_market().ctoads_reserved, 1);
}

#[test]
fn one_ctoad_per_wallet() {
    let (t, mut c) = setup(config(500, true, 0));
    let alice = acct("alice");
    let tokens = buy(&t, &mut c, &alice, 60 * NEAR);
    sell(&t, &mut c, &alice, tokens);
    let tokens = buy(&t, &mut c, &alice, 60 * NEAR);
    assert!(!c.quote_sell(alice.clone(), U128(tokens)).earns_ctoad);
    sell(&t, &mut c, &alice, tokens);
    assert_eq!(c.get_market().ctoads_reserved, 1);
}

#[test]
fn multiple_per_wallet_when_allowed() {
    let (t, mut c) = setup(config(500, false, 0));
    let alice = acct("alice");
    for _ in 0..2 {
        let tokens = buy(&t, &mut c, &alice, 60 * NEAR);
        sell(&t, &mut c, &alice, tokens);
    }
    assert_eq!(c.get_market().ctoads_reserved, 2);
}

#[test]
fn min_hold_time_is_enforced() {
    let (mut t, mut c) = setup(config(500, true, 600));
    let alice = acct("alice");
    let tokens = buy(&t, &mut c, &alice, 60 * NEAR);
    t.now_secs += 599;
    let q = c.quote_sell(alice.clone(), U128(tokens));
    assert!(q.loss.0 >= NEAR && !q.earns_ctoad, "hold time, not loss size, should block this");
    sell(&t, &mut c, &alice, tokens);
    assert_eq!(c.get_market().ctoads_reserved, 0);

    let tokens = buy(&t, &mut c, &alice, 60 * NEAR);
    t.now_secs += 600;
    sell(&t, &mut c, &alice, tokens);
    assert_eq!(c.get_market().ctoads_reserved, 1);
}

#[test]
fn transferred_tokens_carry_no_cost_basis() {
    let (t, mut c) = setup(config(500, true, 0));
    let (alice, bob) = (acct("alice"), acct("bob"));
    let tokens = buy(&t, &mut c, &alice, 60 * NEAR);
    let basis = c.get_holder(alice.clone()).cost_basis.0;

    t.set(&bob, NEAR / 10);
    c.storage_deposit(None, None);
    t.set(&alice, 1);
    c.ft_transfer(bob.clone(), U128(tokens / 2), None);

    // Alice's average cost is unchanged; half her basis left with the tokens.
    let moved = curve::pro_rata(basis, tokens / 2, tokens);
    assert_eq!(c.get_holder(alice.clone()).cost_basis.0, basis - moved);
    // Bob got the tokens for free, so selling them can't be a loss.
    let q = c.quote_sell(bob.clone(), U128(tokens / 2));
    assert_eq!(q.loss.0, 0);
    sell(&t, &mut c, &bob, tokens / 2);
    assert_eq!(c.get_market().ctoads_reserved, 0);
}

#[test]
#[should_panic(expected = "Use sell() to sell $CTO to the curve")]
fn cannot_transfer_into_the_curve() {
    let (t, mut c) = setup(config(500, true, 0));
    let alice = acct("alice");
    let tokens = buy(&t, &mut c, &alice, NEAR);
    t.set(&alice, 1);
    c.ft_transfer(curve_id(), U128(tokens), None);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn sell_requires_one_yocto() {
    let (t, mut c) = setup(config(500, true, 0));
    let alice = acct("alice");
    let tokens = buy(&t, &mut c, &alice, NEAR);
    t.set(&alice, 0);
    c.sell(U128(tokens), None);
}

#[test]
#[should_panic(expected = "Slippage")]
fn buy_slippage_guard() {
    let (t, mut c) = setup(config(500, true, 0));
    let alice = acct("alice");
    t.set(&alice, NEAR);
    c.buy(Some(U128(u128::MAX)));
}

#[test]
fn failed_mint_keeps_the_slot_and_can_be_retried() {
    let (t, mut c) = setup(config(500, true, 0));
    let alice = acct("alice");
    let tokens = buy(&t, &mut c, &alice, 60 * NEAR);
    sell(&t, &mut c, &alice, tokens);

    t.set_with_result(&curve_id(), PromiseResult::Failed);
    assert_eq!(c.on_ctoad_minted(alice.clone(), U128(NEAR)), None);
    assert_eq!(c.get_market().ctoads_reserved, 1);
    assert_eq!(c.get_holder(alice.clone()).failed_mints, 1);

    t.set(&acct("anyone"), 0);
    c.retry_mint(alice.clone());
    assert_eq!(mint_calls(), vec!["mint_ctoad".to_string()]);
    assert_eq!(c.get_holder(alice).failed_mints, 0);
}

#[test]
fn takeover_after_last_mint_then_holders_get_all_fees() {
    let (t, mut c) = setup(config(3, true, 0));
    let wallets = [acct("a"), acct("b"), acct("c")];
    for (i, w) in wallets.iter().enumerate() {
        let tokens = buy(&t, &mut c, w, 60 * NEAR);
        sell(&t, &mut c, w, tokens);
        confirm_mint(&t, &mut c, w, i as u32 + 1);
    }
    let m = c.get_market();
    assert_eq!(m.ctoads_minted, 3);
    assert!(m.takeover);
    let deployer_before = m.deployer_fees_total.0;

    // The cap is reached, so further losses mint nothing.
    let dave = acct("dave");
    let tokens = buy(&t, &mut c, &dave, 60 * NEAR);
    assert!(!c.quote_sell(dave.clone(), U128(tokens)).earns_ctoad);
    sell(&t, &mut c, &dave, tokens);

    let m = c.get_market();
    assert_eq!(m.deployer_fees_total.0, deployer_before, "deployer earned after takeover");
    let holder_fees = m.holder_fees_total.0;
    assert!(holder_fees > NEAR);
    assert_eq!(m.fees_per_ctoad.0, holder_fees / 3);

    let owed = c.ctoad_unclaimed(vec!["1".into(), "2".into(), "3".into()]);
    assert!(owed.iter().all(|o| o.0 == holder_fees / 3));

    // Claim CTOad #1 (twice in one call: the second copy must pay nothing).
    t.set(&ctoads_id(), 0);
    let paid = c.ctoad_payout(vec!["1".into(), "1".into()], wallets[0].clone());
    assert_eq!(paid.0, holder_fees / 3);
    assert_eq!(c.ctoad_unclaimed(vec!["1".into()])[0].0, 0);
    let paid_again = c.ctoad_payout(vec!["1".into()], wallets[0].clone());
    assert_eq!(paid_again.0, 0);
}

#[test]
#[should_panic(expected = "Only the CTOad contract can request payouts")]
fn only_ctoad_contract_can_pay_out() {
    let (t, mut c) = setup(config(3, true, 0));
    t.set(&acct("mallory"), 0);
    c.ctoad_payout(vec!["1".into()], acct("mallory"));
}

#[test]
fn failed_payout_is_restored_without_double_paying() {
    let (t, mut c) = setup(config(1, true, 0));
    let alice = acct("alice");
    let tokens = buy(&t, &mut c, &alice, 60 * NEAR);
    sell(&t, &mut c, &alice, tokens);
    confirm_mint(&t, &mut c, &alice, 1);
    buy(&t, &mut c, &acct("bob"), 100 * NEAR);

    t.set(&ctoads_id(), 0);
    let first = c.ctoad_payout(vec!["1".into()], alice.clone()).0;
    // More fees come in and a second claim goes through before the first transfer's callback.
    buy(&t, &mut c, &acct("carol"), 100 * NEAR);
    t.set(&ctoads_id(), 0);
    let second = c.ctoad_payout(vec!["1".into()], alice.clone()).0;

    // The first transfer fails.
    t.set_with_result(&curve_id(), PromiseResult::Failed);
    c.on_payout(alice.clone(), vec![(1, U128(first))]);
    // Only the failed amount is claimable again.
    assert_eq!(c.ctoad_unclaimed(vec!["1".into()])[0].0, first);
    assert_eq!(c.get_market().holder_fees_total.0 - (first + second), c.fees.dust);
}

#[test]
fn deployer_withdraw_is_permissionless_but_pays_owner() {
    let (t, mut c) = setup(config(500, true, 0));
    buy(&t, &mut c, &acct("alice"), 10 * NEAR);
    let owed = c.get_market().deployer_fees_unwithdrawn.0;
    t.set(&acct("random"), 0);
    assert_eq!(c.withdraw_deployer_fees().0, owed);
    let receipts = get_created_receipts();
    assert!(receipts.iter().any(|r| r.receiver_id == owner()));
    assert_eq!(c.get_market().deployer_fees_unwithdrawn.0, 0);
}

#[test]
fn quote_buy_matches_buy() {
    let (t, mut c) = setup(config(500, true, 0));
    let alice = acct("alice");
    t.set(&alice, 0);
    let q = c.quote_buy(alice.clone(), U128(5 * NEAR));
    let got = buy(&t, &mut c, &alice, 5 * NEAR);
    assert_eq!(got, q.tokens_out.0);
    assert_eq!(c.get_holder(alice).cost_basis.0, 5 * NEAR - q.storage_cost.0);
}

#[test]
fn curve_stays_solvent_when_everyone_exits() {
    let (t, mut c) = setup(config(500, false, 0));
    let wallets: Vec<_> = (0..20).map(|i| acct(&format!("w{i}"))).collect();
    for (i, w) in wallets.iter().enumerate() {
        buy(&t, &mut c, w, (i as u128 + 1) * NEAR / 2);
    }
    for w in wallets.iter().rev() {
        let bal = c.get_holder(w.clone()).balance.0;
        sell(&t, &mut c, w, bal);
    }
    let m = c.get_market();
    assert_eq!(m.circulating_supply.0, 0);
    assert_eq!(m.token_reserve.0, SUPPLY);
    assert!(m.real_near_reserve.0 < 1_000, "dust {}", m.real_near_reserve.0);
}

#[test]
fn no_fees_are_split_until_the_last_ctoad_is_confirmed() {
    let (t, mut c) = setup(config(3, true, 0));
    let wallets = [acct("a"), acct("b"), acct("c")];
    // Every slot is earned, but only two mints are confirmed. The third one fails.
    for (i, w) in wallets.iter().enumerate() {
        let tokens = buy(&t, &mut c, w, 60 * NEAR);
        sell(&t, &mut c, w, tokens);
        if i < 2 {
            confirm_mint(&t, &mut c, w, i as u32 + 1);
        }
    }
    t.set_with_result(&curve_id(), PromiseResult::Failed);
    c.on_ctoad_minted(wallets[2].clone(), U128(NEAR));
    let m = c.get_market();
    assert_eq!((m.ctoads_minted, m.ctoads_reserved), (2, 3));
    assert!(!m.takeover, "the CTO happened before all CTOads were minted");

    // Trading continues, and every fee still goes to the deployer.
    let before = m.deployer_fees_total.0;
    buy(&t, &mut c, &acct("dave"), 100 * NEAR);
    let m = c.get_market();
    assert!(m.deployer_fees_total.0 > before);
    assert_eq!(m.holder_fees_total.0, 0);
    assert_eq!(m.fees_per_ctoad.0, 0);
    assert!(c.ctoad_unclaimed(vec!["1".into(), "2".into()]).iter().all(|u| u.0 == 0));

    // The retry for #3 lands. Only now does the takeover happen.
    t.set(&acct("anyone"), 0);
    c.retry_mint(wallets[2].clone());
    confirm_mint(&t, &mut c, &wallets[2], 3);
    assert!(c.get_market().takeover);
    let deployer_total = c.get_market().deployer_fees_total.0;
    buy(&t, &mut c, &acct("erin"), 100 * NEAR);
    let m = c.get_market();
    assert_eq!(m.deployer_fees_total.0, deployer_total);
    assert!(m.holder_fees_total.0 > 0);
}
