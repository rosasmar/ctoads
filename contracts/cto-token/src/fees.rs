//! Fee router.
//!
//! Before the takeover, every fee builds up for the deployer.
//! After the takeover, every fee is split equally across all CTOads. The router doesn't pay out
//! on each trade. It keeps a running total of fees earned per CTOad (`per_ctoad`), and each
//! CTOad records the total it had already been paid at its last claim (`claimed`):
//!
//! ```text
//! unclaimed(id) = per_ctoad - claimed[id]
//! ```
//!
//! Every CTOad already exists when the takeover starts, so each one starts at 0 and nobody
//! is short-changed.

use near_sdk::{near, store::LookupMap, IntoStorageKey};

#[near(serializers = [borsh])]
pub struct FeeRouter {
    /// Pre-takeover fees the deployer hasn't withdrawn yet.
    pub deployer_unwithdrawn: u128,
    /// All fees ever routed to the deployer.
    pub deployer_total: u128,
    /// All fees ever routed to CTOad holders.
    pub holders_total: u128,
    /// Running total of fees each CTOad has earned since the takeover.
    pub per_ctoad: u128,
    /// Remainder from dividing by the number of CTOads. Added to the next fee so nothing is lost.
    pub dust: u128,
    /// CTOad number -> value of `per_ctoad` it has already been paid out to.
    pub claimed: LookupMap<u32, u128>,
}

impl FeeRouter {
    pub fn new<S: IntoStorageKey>(claimed_prefix: S) -> Self {
        Self {
            deployer_unwithdrawn: 0,
            deployer_total: 0,
            holders_total: 0,
            per_ctoad: 0,
            dust: 0,
            claimed: LookupMap::new(claimed_prefix),
        }
    }

    pub fn route(&mut self, fee: u128, takeover: bool, ctoads: u32) {
        if fee == 0 {
            return;
        }
        if takeover {
            self.holders_total += fee;
            let pool = fee + self.dust;
            self.per_ctoad += pool / ctoads as u128;
            self.dust = pool % ctoads as u128;
        } else {
            self.deployer_total += fee;
            self.deployer_unwithdrawn += fee;
        }
    }

    pub fn unclaimed(&self, ctoad: u32) -> u128 {
        self.per_ctoad - self.claimed.get(&ctoad).copied().unwrap_or(0)
    }

    /// Marks everything owed to `ctoad` as paid and returns the amount.
    pub fn take(&mut self, ctoad: u32) -> u128 {
        let owed = self.unclaimed(ctoad);
        if owed > 0 {
            self.claimed.insert(ctoad, self.per_ctoad);
        }
        owed
    }

    /// Undoes a `take` whose transfer failed. This subtracts the failed amount instead of
    /// restoring the old value, so a claim that ran in between is never paid twice.
    pub fn untake(&mut self, ctoad: u32, amount: u128) {
        let claimed = self.claimed.get(&ctoad).copied().unwrap_or(0);
        self.claimed.insert(ctoad, claimed - amount);
    }
}
