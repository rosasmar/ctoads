//! The wallet contract behind each CTOad's own account, `ctoad-<id>.<$CTO token contract>`.
//!
//! - It's deployed once as a NEAR **global contract**, and all 500 CTOad accounts use it by code
//!   hash. Nobody can change it afterwards, not even the deployer.
//! - CTOad accounts are created with **no access keys**. The only ways in are `withdraw` and
//!   `execute`, and only the parent account (the $CTO token contract) can call them.
//! - The token contract calls them only for whoever holds the CTOad right now, after the CTOad
//!   contract has checked. So whoever holds the NFT controls the account.
//! - `execute` makes the account call another contract, e.g. to buy $CTO with its own fees. It
//!   can only make function calls: it can never add keys or deploy code, so the account always
//!   stays with its CTOad.
//!
//! It keeps no state and takes raw bytes instead of JSON. That keeps it small, and global
//! contracts are priced by size.

use near_sdk::{
    borsh::{self, BorshSerialize},
    env, require, AccountId, Gas, GasWeight, NearToken, Promise,
};

/// One function call for a CTOad account to make, sent to `execute` as Borsh bytes.
/// Callers encode it with Borsh; `decode_call` reads it back by hand, which keeps this contract
/// about 18 KB smaller than Borsh's own decoder would.
#[derive(BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Call {
    pub receiver_id: AccountId,
    pub method_name: String,
    /// The method's arguments, usually JSON.
    pub args: Vec<u8>,
    /// yoctoNEAR to attach, paid from the account's balance.
    pub deposit: u128,
    /// Gas reserved for the call. Any gas left over is added to it.
    pub gas: u64,
}

/// Sends everything this account holds above its storage reserve to the receiver.
/// Input: the receiver's account ID as raw UTF-8 (not JSON). Returns the yoctoNEAR sent, as a
/// decimal string. Only the parent account can call it.
#[no_mangle]
pub extern "C" fn withdraw() {
    let input = env::input().unwrap_or_default();
    let receiver = parse_account(&input);
    let sent = withdraw_to(receiver);
    env::value_return(sent.to_string().as_bytes());
}

/// Makes this account call another contract, and returns that call's result.
/// Input: a [`Call`] as Borsh bytes. Only the parent account can call it.
#[no_mangle]
pub extern "C" fn execute() {
    let input = env::input().unwrap_or_default();
    let call = decode_call(&input)
        .unwrap_or_else(|| env::panic_str("Input must be a Borsh-encoded Call"));
    execute_call(call).as_return();
}

/// View: yoctoNEAR this account could pay out right now, as a decimal string.
#[no_mangle]
pub extern "C" fn available() {
    env::value_return(available_balance().to_string().as_bytes());
}

pub fn withdraw_to(receiver: AccountId) -> u128 {
    require!(
        env::predecessor_account_id() == parent_account(),
        "Only the $CTO token contract can withdraw from a CTOad account"
    );
    let amount = available_balance();
    if amount > 0 {
        Promise::new(receiver).transfer(NearToken::from_yoctonear(amount)).detach();
    }
    amount
}

pub fn execute_call(call: Call) -> Promise {
    require!(
        env::predecessor_account_id() == parent_account(),
        "Only the $CTO token contract can make a CTOad account call other contracts"
    );
    require!(call.receiver_id != env::current_account_id(), "A CTOad account can't call itself");
    // If the deposit would dip into the storage reserve, NEAR rejects the whole call.
    Promise::new(call.receiver_id).function_call_weight(
        call.method_name,
        call.args,
        NearToken::from_yoctonear(call.deposit),
        Gas::from_gas(call.gas),
        GasWeight(1),
    )
}

/// Balance above what this account must keep locked for its own storage.
pub fn available_balance() -> u128 {
    let reserve = env::storage_byte_cost().as_yoctonear() * env::storage_usage() as u128;
    env::account_balance().as_yoctonear().saturating_sub(reserve)
}

fn parent_account() -> AccountId {
    env::current_account_id()
        .get_parent_account_id()
        .unwrap_or_else(|| env::panic_str("A CTOad account must be a sub-account"))
        .to_owned()
}

/// Reads a Borsh-encoded `Call`: three length-prefixed byte strings, then a u128 and a u64,
/// all little-endian. `None` if anything is missing, invalid or left over.
fn decode_call(mut b: &[u8]) -> Option<Call> {
    fn take<'a>(b: &mut &'a [u8], n: usize) -> Option<&'a [u8]> {
        if b.len() < n {
            return None;
        }
        let (head, rest) = b.split_at(n);
        *b = rest;
        Some(head)
    }
    fn bytes(b: &mut &[u8]) -> Option<Vec<u8>> {
        let n = u32::from_le_bytes(take(b, 4)?.try_into().ok()?) as usize;
        Some(take(b, n)?.to_vec())
    }
    let receiver_id = String::from_utf8(bytes(&mut b)?).ok()?.parse().ok()?;
    let method_name = String::from_utf8(bytes(&mut b)?).ok()?;
    let args = bytes(&mut b)?;
    let deposit = u128::from_le_bytes(take(&mut b, 16)?.try_into().ok()?);
    let gas = u64::from_le_bytes(take(&mut b, 8)?.try_into().ok()?);
    b.is_empty().then_some(Call { receiver_id, method_name, args, deposit, gas })
}

fn parse_account(bytes: &[u8]) -> AccountId {
    std::str::from_utf8(bytes)
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| env::panic_str("Input must be a valid account ID"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::mock::MockAction;
    use near_sdk::test_utils::{get_created_receipts, VMContextBuilder};
    use near_sdk::testing_env;

    const NEAR: u128 = 10u128.pow(24);

    fn set(predecessor: &str, balance: u128, storage: u64) {
        testing_env!(VMContextBuilder::new()
            .current_account_id("ctoad-42.cto.testnet".parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .account_balance(NearToken::from_yoctonear(balance))
            .storage_usage(storage)
            .build());
    }

    #[test]
    fn parent_withdraws_everything_above_the_storage_reserve() {
        set("cto.testnet", 2 * NEAR, 150);
        let reserve = 150 * env::storage_byte_cost().as_yoctonear();
        assert_eq!(withdraw_to("alice.testnet".parse().unwrap()), 2 * NEAR - reserve);

        let receipts = get_created_receipts();
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0].receiver_id.as_str(), "alice.testnet");
        assert!(matches!(
            receipts[0].actions[0],
            MockAction::Transfer { deposit, .. } if deposit.as_yoctonear() == 2 * NEAR - reserve
        ));
    }

    #[test]
    fn nothing_to_send_means_no_transfer() {
        set("cto.testnet", 150 * 10u128.pow(19), 150);
        assert_eq!(withdraw_to("alice.testnet".parse().unwrap()), 0);
        assert!(get_created_receipts().is_empty());
    }

    #[test]
    #[should_panic(expected = "Only the $CTO token contract can withdraw")]
    fn nobody_else_can_withdraw() {
        set("alice.testnet", 2 * NEAR, 150);
        withdraw_to("alice.testnet".parse().unwrap());
    }

    fn call(receiver: &str) -> Call {
        Call {
            receiver_id: receiver.parse().unwrap(),
            method_name: "buy".to_string(),
            args: br#"{"min_tokens_out":"1"}"#.to_vec(),
            deposit: NEAR / 2,
            gas: 30_000_000_000_000,
        }
    }

    #[test]
    fn parent_makes_the_account_call_another_contract() {
        set("cto.testnet", 2 * NEAR, 150);
        execute_call(call("cto.testnet"));

        let receipts = get_created_receipts();
        assert_eq!(receipts.len(), 1);
        assert_eq!(receipts[0].receiver_id.as_str(), "cto.testnet");
        assert!(matches!(
            &receipts[0].actions[0],
            MockAction::FunctionCallWeight { method_name, args, attached_deposit, prepaid_gas, .. }
                if method_name == b"buy"
                    && args == br#"{"min_tokens_out":"1"}"#
                    && attached_deposit.as_yoctonear() == NEAR / 2
                    && prepaid_gas.as_gas() == 30_000_000_000_000
        ));
    }

    #[test]
    #[should_panic(expected = "Only the $CTO token contract can make a CTOad account call")]
    fn nobody_else_can_execute() {
        set("alice.testnet", 2 * NEAR, 150);
        execute_call(call("cto.testnet"));
    }

    #[test]
    #[should_panic(expected = "Only the $CTO token contract can make a CTOad account call")]
    fn the_account_cant_order_itself() {
        set("ctoad-42.cto.testnet", 2 * NEAR, 150);
        execute_call(call("cto.testnet"));
    }

    #[test]
    #[should_panic(expected = "A CTOad account can't call itself")]
    fn the_account_cant_call_itself() {
        set("cto.testnet", 2 * NEAR, 150);
        execute_call(call("ctoad-42.cto.testnet"));
    }

    #[test]
    fn decodes_what_borsh_encodes() {
        let bytes = borsh::to_vec(&call("cto.testnet")).unwrap();
        let back = decode_call(&bytes).unwrap();
        assert_eq!(back.receiver_id.as_str(), "cto.testnet");
        assert_eq!(back.method_name, "buy");
        assert_eq!(back.args, br#"{"min_tokens_out":"1"}"#);
        assert_eq!(back.deposit, NEAR / 2);
        assert_eq!(back.gas, 30_000_000_000_000);
    }

    #[test]
    fn rejects_short_long_or_invalid_input() {
        let bytes = borsh::to_vec(&call("cto.testnet")).unwrap();
        assert!(decode_call(&bytes[..bytes.len() - 1]).is_none());
        assert!(decode_call(&[bytes.as_slice(), &[0]].concat()).is_none());
        assert!(decode_call(b"").is_none());
        let mut bad = call("cto.testnet");
        bad.method_name = "x".into();
        let mut bytes = borsh::to_vec(&bad).unwrap();
        bytes[4] = b'!'; // first byte of the receiver: "!to.testnet" isn't an account ID
        assert!(decode_call(&bytes).is_none());
    }

    #[test]
    #[should_panic(expected = "Input must be a valid account ID")]
    fn rejects_bad_receiver() {
        set("cto.testnet", NEAR, 150);
        parse_account(b"Not An Account!");
    }
}
