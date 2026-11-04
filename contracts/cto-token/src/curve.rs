//! Bonding-curve math. Pure functions, no NEAR state.
//!
//! The curve is constant product (x * y = k):
//!   x = NEAR reserve, which is a virtual reserve (sets the starting price) plus real NEAR deposited by buyers
//!   y = $CTO still held by the curve
//!
//! Every output rounds down, so k never shrinks and the curve can always pay out every
//! token in circulation. Selling every circulating token returns exactly the real NEAR reserve.

#[allow(clippy::manual_div_ceil)] // the warning comes from inside the `uint` macro
mod u256 {
    uint::construct_uint! {
        pub struct U256(4);
    }
}
use u256::U256;

/// a * b / c in 256-bit arithmetic, rounded down. Panics if the result doesn't fit in u128.
pub fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    assert!(c > 0, "division by zero");
    (U256::from(a) * U256::from(b) / U256::from(c)).as_u128()
}

/// $CTO received for putting `near_in` (net of fees) into the curve.
pub fn tokens_out(near_reserve: u128, token_reserve: u128, near_in: u128) -> u128 {
    mul_div(token_reserve, near_in, near_reserve.checked_add(near_in).expect("overflow"))
}

/// NEAR (before fees) received for returning `tokens_in` to the curve.
pub fn near_out(near_reserve: u128, token_reserve: u128, tokens_in: u128) -> u128 {
    mul_div(near_reserve, tokens_in, token_reserve.checked_add(tokens_in).expect("overflow"))
}

/// Fee on `amount` at `bps` basis points, rounded down.
pub fn fee(amount: u128, bps: u16) -> u128 {
    mul_div(amount, bps as u128, 10_000)
}

/// `total * part / whole`, or 0 when `whole` is 0. Used to split cost basis when part of a balance moves.
pub fn pro_rata(total: u128, part: u128, whole: u128) -> u128 {
    if whole == 0 {
        0
    } else {
        mul_div(total, part, whole)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NEAR: u128 = 10u128.pow(24);
    const SUPPLY: u128 = 1_000_000_000 * 10u128.pow(18);

    #[test]
    fn buy_then_sell_returns_at_most_the_input() {
        let (v, y) = (30 * NEAR, SUPPLY);
        for near_in in [1, NEAR / 1000, NEAR, 50 * NEAR, 10_000 * NEAR] {
            let out = tokens_out(v, y, near_in);
            let back = near_out(v + near_in, y - out, out);
            assert!(back <= near_in, "round trip made money: in {near_in}, back {back}");
        }
    }

    #[test]
    fn selling_all_circulating_returns_the_real_reserve() {
        // Many buyers push the price up, then everyone sells. The curve must stay solvent.
        let virtual_near = 30 * NEAR;
        let (mut real, mut y) = (0u128, SUPPLY);
        let mut holdings = vec![];
        for i in 1..=50u128 {
            let near_in = i * NEAR / 3 + 12345;
            let out = tokens_out(virtual_near + real, y, near_in);
            real += near_in;
            y -= out;
            holdings.push(out);
        }
        for out in holdings.into_iter().rev() {
            let back = near_out(virtual_near + real, y, out);
            assert!(back <= real, "curve would pay out more than it holds");
            real -= back;
            y += out;
        }
        assert_eq!(y, SUPPLY);
        // Only rounding dust is left behind, and it stays in the curve.
        assert!(real < 1_000, "dust {real}");
    }

    #[test]
    fn fee_math() {
        assert_eq!(fee(100 * NEAR, 100), NEAR);
        assert_eq!(fee(99, 100), 0);
        assert_eq!(pro_rata(10, 1, 0), 0);
        assert_eq!(pro_rata(10 * NEAR, 1, 2), 5 * NEAR);
    }
}
