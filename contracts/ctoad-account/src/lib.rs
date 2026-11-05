//! The wallet contract behind each CTOad's own account, `ctoad-<id>.<$CTO token contract>`.
//!
//! - It's deployed once as a NEAR **global contract**, and all 500 CTOad accounts use it by code
//!   hash. Nobody can change it afterwards, not even the deployer.
//! - CTOad accounts are created with **no access keys**. The only way money leaves one is
//!   `withdraw`, and only the parent account (the $CTO token contract) can call it.
//! - The token contract calls `withdraw` only from a claim, after the CTOad contract has checked
//!   that the caller owns that CTOad. So whoever holds the NFT controls the account.
//!
//! It keeps no state and takes raw bytes instead of JSON. That keeps it small, and global
//! contracts are priced by size.

use near_sdk::{env, AccountId, NearToken, Promise};

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

/// View: yoctoNEAR this account could pay out right now, as a decimal string.
#[no_mangle]
pub extern "C" fn available() {
    env::value_return(available_balance().to_string().as_bytes());
}

pub fn withdraw_to(receiver: AccountId) -> u128 {
    let parent = parent_account();
    if env::predecessor_account_id() != parent {
        env::panic_str("Only the $CTO token contract can withdraw from a CTOad account");
    }
    let amount = available_balance();
    if amount > 0 {
        Promise::new(receiver).transfer(NearToken::from_yoctonear(amount)).detach();
    }
    amount
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

    #[test]
    #[should_panic(expected = "Input must be a valid account ID")]
    fn rejects_bad_receiver() {
        set("cto.testnet", NEAR, 150);
        parse_account(b"Not An Account!");
    }
}
