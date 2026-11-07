//! On-chain art: the SVG layers every CTOad is drawn from.
//!
//! The owner uploads layers into seven categories, from background to held item. Each layer is
//! an SVG fragment drawn on a 1000×1000 canvas. Layers can be added or replaced until the owner
//! calls `freeze_art`. After that the art can never change.

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

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Layer {
    pub name: String,
    /// An SVG fragment, such as `<g>…</g>`, without the outer `<svg>` tag.
    pub svg: String,
}

#[near(serializers = [json])]
pub struct CategoryView {
    pub category: Category,
    /// Layer names, in index order.
    pub layers: Vec<String>,
}

#[near(serializers = [json])]
pub struct ArtView {
    pub frozen: bool,
    pub categories: Vec<CategoryView>,
}

#[near]
impl Contract {
    /// Adds a layer to `category` and returns its index. Owner only, until the art is frozen.
    /// Attach enough NEAR for its storage (about 0.01 NEAR per KB). The rest is refunded.
    #[payable]
    pub fn add_layer(&mut self, category: Category, name: String, svg: String) -> u32 {
        self.assert_can_edit_art(&name, &svg);
        let storage_before = env::storage_usage();
        let index = self.layer_counts[category as usize];
        self.layers.insert((category as u8, index), Layer { name, svg });
        self.layer_counts[category as usize] += 1;
        self.layers.flush();
        self.charge_storage(storage_before);
        index
    }

    /// Replaces the layer at `index` in `category`. Owner only, until the art is frozen. Attach
    /// NEAR if the new layer is bigger. The rest is refunded.
    #[payable]
    pub fn replace_layer(&mut self, category: Category, index: u32, name: String, svg: String) {
        self.assert_can_edit_art(&name, &svg);
        require!(index < self.layer_counts[category as usize], "No layer at that index");
        let storage_before = env::storage_usage();
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

    /// Whether the art is frozen, and every layer's name by category.
    pub fn get_art(&self) -> ArtView {
        ArtView {
            frozen: self.art_frozen,
            categories: CATEGORIES
                .iter()
                .map(|&category| CategoryView {
                    category,
                    layers: (0..self.layer_counts[category as usize])
                        .map(|i| self.layer(category, i).name.clone())
                        .collect(),
                })
                .collect(),
        }
    }

    pub fn get_layer(&self, category: Category, index: u32) -> Layer {
        require!(index < self.layer_counts[category as usize], "No layer at that index");
        self.layer(category, index).clone()
    }
}

impl Contract {
    fn layer(&self, category: Category, index: u32) -> &Layer {
        self.layers.get(&(category as u8, index)).unwrap()
    }

    fn assert_can_edit_art(&self, name: &str, svg: &str) {
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
