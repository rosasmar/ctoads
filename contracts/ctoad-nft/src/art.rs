//! On-chain art: the SVG layers every CTOad is drawn from.
//!
//! The owner uploads layers into seven categories, from background to held item. Each layer is
//! an SVG fragment drawn on a 1000×1000 canvas. Layers can be added or replaced until the owner
//! calls `freeze_art`. After that the art can never change.
//!
//! At mint, each CTOad gets one layer per category. Every layer has a weight (1 by default), so
//! a layer with weight 1 next to one with weight 9 is picked 1 time in 10. The picks use NEAR's
//! random seed, mixed with the token ID. That's fine for cartoon traits, but a validator could
//! in theory influence it, so it isn't strong enough for traits worth real money.

use near_contract_standards::non_fungible_token::TokenId;
use near_sdk::{env, near, require, NearToken, Promise};

use crate::{Contract, ContractExt};

/// Largest layer, in bytes. The art brief aims for 2–3 KB.
const MAX_LAYER_BYTES: usize = 8 * 1024;
/// Longest layer name, in bytes.
const MAX_NAME_LEN: usize = 32;

/// Layer categories, in the order they're stacked: background first, held item on top.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Category {
    Background,
    Body,
    Outfit,
    Eyes,
    Mouth,
    Headwear,
    Item,
}

pub const CATEGORIES: [Category; 7] = [
    Category::Background,
    Category::Body,
    Category::Outfit,
    Category::Eyes,
    Category::Mouth,
    Category::Headwear,
    Category::Item,
];

/// Each CTOad's pick per category, in `CATEGORIES` order. `None` if the category had no layers
/// when it was minted.
pub type Traits = [Option<u32>; CATEGORIES.len()];

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Layer {
    pub name: String,
    /// An SVG fragment, such as `<g>…</g>`, without the outer `<svg>` tag.
    pub svg: String,
}

#[near(serializers = [json])]
pub struct LayerSummary {
    pub name: String,
    pub weight: u32,
}

#[near(serializers = [json])]
pub struct CategoryView {
    pub category: Category,
    /// In index order.
    pub layers: Vec<LayerSummary>,
}

#[near(serializers = [json])]
pub struct ArtView {
    pub frozen: bool,
    pub categories: Vec<CategoryView>,
}

#[near(serializers = [json])]
pub struct Trait {
    pub category: Category,
    pub name: String,
}

#[near]
impl Contract {
    /// Adds a layer to `category` and returns its index. `weight` sets how often it's picked
    /// (default 1). Owner only, until the art is frozen. Attach enough NEAR for its storage
    /// (about 0.01 NEAR per KB). The rest is refunded.
    #[payable]
    pub fn add_layer(
        &mut self,
        category: Category,
        name: String,
        svg: String,
        weight: Option<u32>,
    ) -> u32 {
        self.assert_can_edit_art(&name, &svg, weight);
        let storage_before = env::storage_usage();
        let weights = &mut self.layer_weights[category as usize];
        let index = weights.len() as u32;
        weights.push(weight.unwrap_or(1));
        self.layers.insert((category as u8, index), Layer { name, svg });
        self.layers.flush();
        self.charge_storage(storage_before);
        index
    }

    /// Replaces the layer at `index` in `category`, keeping its weight unless `weight` is given.
    /// Owner only, until the art is frozen. Attach NEAR if the new layer is bigger. The rest is
    /// refunded.
    #[payable]
    pub fn replace_layer(
        &mut self,
        category: Category,
        index: u32,
        name: String,
        svg: String,
        weight: Option<u32>,
    ) {
        self.assert_can_edit_art(&name, &svg, weight);
        require!(index < self.layer_count(category), "No layer at that index");
        let storage_before = env::storage_usage();
        if let Some(weight) = weight {
            self.layer_weights[category as usize][index as usize] = weight;
        }
        self.layers.insert((category as u8, index), Layer { name, svg });
        self.layers.flush();
        self.charge_storage(storage_before);
    }

    /// Locks the art for good. Owner only. Attach 1 yoctoNEAR.
    #[payable]
    pub fn freeze_art(&mut self) {
        near_sdk::assert_one_yocto();
        require!(env::predecessor_account_id() == self.owner_id, "Only the owner");
        self.art_frozen = true;
    }

    /// Whether the art is frozen, and every layer's name and weight by category.
    pub fn get_art(&self) -> ArtView {
        ArtView {
            frozen: self.art_frozen,
            categories: CATEGORIES
                .iter()
                .map(|&category| CategoryView {
                    category,
                    layers: self.layer_weights[category as usize]
                        .iter()
                        .enumerate()
                        .map(|(i, &weight)| LayerSummary {
                            name: self.layer(category, i as u32).name.clone(),
                            weight,
                        })
                        .collect(),
                })
                .collect(),
        }
    }

    pub fn get_layer(&self, category: Category, index: u32) -> Layer {
        require!(index < self.layer_count(category), "No layer at that index");
        self.layer(category, index).clone()
    }

    /// The layers CTOad `token_id` got at mint, background first.
    pub fn ctoad_traits(&self, token_id: TokenId) -> Vec<Trait> {
        let traits = self
            .traits
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str(&format!("CTOad #{token_id} doesn't exist")));
        CATEGORIES
            .iter()
            .zip(traits)
            .filter_map(|(&category, pick)| {
                pick.map(|index| Trait { category, name: self.layer(category, index).name.clone() })
            })
            .collect()
    }
}

impl Contract {
    fn layer(&self, category: Category, index: u32) -> &Layer {
        self.layers.get(&(category as u8, index)).unwrap()
    }

    fn layer_count(&self, category: Category) -> u32 {
        self.layer_weights[category as usize].len() as u32
    }

    /// Picks one layer per category for `token_id`, weighted. Skips empty categories, so a
    /// mint never fails because of the art.
    pub(crate) fn pick_traits(&self, token_id: &str) -> Traits {
        // The seed is the same for every mint in a block, so mix in the token ID.
        let seed = env::sha256([env::random_seed(), token_id.as_bytes().to_vec()].concat());
        let mut traits = [None; CATEGORIES.len()];
        for (i, weights) in self.layer_weights.iter().enumerate() {
            let total: u64 = weights.iter().map(|&w| w as u64).sum();
            if total == 0 {
                continue;
            }
            let bytes: [u8; 4] = seed[i * 4..i * 4 + 4].try_into().unwrap();
            let mut roll = u32::from_le_bytes(bytes) as u64 % total;
            for (index, &weight) in weights.iter().enumerate() {
                if roll < weight as u64 {
                    traits[i] = Some(index as u32);
                    break;
                }
                roll -= weight as u64;
            }
        }
        traits
    }

    fn assert_can_edit_art(&self, name: &str, svg: &str, weight: Option<u32>) {
        require!(env::predecessor_account_id() == self.owner_id, "Only the owner");
        require!(!self.art_frozen, "The art is frozen");
        require!(
            !name.is_empty() && name.len() <= MAX_NAME_LEN,
            format!("The name must be 1 to {MAX_NAME_LEN} bytes")
        );
        require!(
            !svg.is_empty() && svg.len() <= MAX_LAYER_BYTES,
            format!("A layer must be 1 to {MAX_LAYER_BYTES} bytes")
        );
        require!(weight != Some(0), "The weight must be positive");
    }

    /// Requires the attached deposit to cover the storage used since `storage_before`, and
    /// refunds the rest to the caller.
    fn charge_storage(&self, storage_before: u64) {
        let used = env::storage_usage().saturating_sub(storage_before);
        let cost = used as u128 * env::storage_byte_cost().as_yoctonear();
        let attached = env::attached_deposit().as_yoctonear();
        require!(
            attached >= cost,
            format!("Attach at least {cost} yoctoNEAR for the layer's storage")
        );
        if attached > cost {
            Promise::new(env::predecessor_account_id())
                .transfer(NearToken::from_yoctonear(attached - cost))
                .detach();
        }
    }
}
