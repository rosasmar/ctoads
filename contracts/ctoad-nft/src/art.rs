//! On-chain art: the SVG layers every CTOad is drawn from.
//!
//! The owner uploads layers into seven categories, from background to held item. Each layer is
//! an SVG fragment drawn on a 1000×1000 canvas. Layers can be added or replaced until the owner
//! calls `freeze_art`. After that the art can never change.
//!
//! Each CTOad's image is built when it's read: its layers stacked into one SVG, returned as a
//! `data:` URI in `media`. Nothing is hosted anywhere else.
//!
//! At mint, each CTOad gets one layer per category. Every layer has a weight (1 by default), so
//! a layer with weight 1 next to one with weight 9 is picked 1 time in 10. The picks use NEAR's
//! random seed, mixed with the token ID. That's fine for cartoon traits, but a validator could
//! in theory influence it, so it isn't strong enough for traits worth real money.

use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::{
    base64::{engine::general_purpose::STANDARD as BASE64, Engine},
    env, near, require,
    serde_json::{self, json},
    NearToken, Promise,
};

use crate::{Contract, ContractExt};

const SVG_OPEN: &str = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">"#;

/// Largest layer, in bytes. The art brief aims for 2–3 KB.
const MAX_LAYER_BYTES: usize = 8 * 1024;
/// Longest layer name, in bytes.
const MAX_NAME_LEN: usize = 32;

/// Layer categories. This order sets how layers and traits are stored and listed. The order
/// they're drawn in is `DRAW_ORDER`.
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

/// The order layers are stacked in a CTOad's image: background first, held item on top. The
/// mouth and eyes sit under the outfit, so a collar or hood can cover the face.
pub const DRAW_ORDER: [Category; 7] = [
    Category::Background,
    Category::Body,
    Category::Mouth,
    Category::Eyes,
    Category::Outfit,
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
        CATEGORIES
            .iter()
            .zip(self.traits_of(&token_id))
            .filter_map(|(&category, pick)| {
                pick.map(|index| Trait { category, name: self.layer(category, index).name.clone() })
            })
            .collect()
    }

    /// CTOad `token_id`'s image: its layers stacked into one 1000×1000 SVG, in `DRAW_ORDER`.
    /// Without any layers, a plain card with its number.
    pub fn ctoad_svg(&self, token_id: TokenId) -> String {
        let traits = self.traits_of(&token_id);
        let mut svg = String::from(SVG_OPEN);
        let mut drawn = false;
        for category in DRAW_ORDER {
            let pick = CATEGORIES.iter().position(|&c| c == category).and_then(|i| traits[i]);
            if let Some(index) = pick {
                svg.push_str(&self.layer(category, index).svg);
                drawn = true;
            }
        }
        if !drawn {
            svg.push_str(&format!(
                r##"<rect width="1000" height="1000" fill="#121a14"/><text x="500" y="530" font-family="sans-serif" font-size="96" fill="#4ade80" text-anchor="middle">CTOad #{token_id}</text>"##
            ));
        }
        svg.push_str("</svg>");
        svg
    }

    /// Changes CTOad `token_id`'s body to layer `body` (its index in `get_art`'s Body list).
    /// Only its holder can, and only to one of the most common bodies, so rare ones stay rare: a
    /// toad that minted a rare body can recolor away from it, but nobody can recolor into one.
    /// Works before and after `freeze_art`. Attach 1 yoctoNEAR. Every view of the toad shows the
    /// new body right away.
    #[payable]
    pub fn recolor(&mut self, token_id: TokenId, body: u32) {
        near_sdk::assert_one_yocto();
        let owner = self
            .tokens
            .owner_by_id
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str(&format!("CTOad #{token_id} doesn't exist")));
        require!(owner == env::predecessor_account_id(), format!("You don't own CTOad #{token_id}"));
        let weights = &self.layer_weights[Category::Body as usize];
        require!((body as usize) < weights.len(), "No body at that index");
        let common = weights.iter().copied().max().unwrap_or(0);
        require!(weights[body as usize] == common, "That body is rare: it can only be minted");
        let slot = CATEGORIES.iter().position(|&c| c == Category::Body).unwrap();
        let mut traits = *self.traits_of(&token_id);
        traits[slot] = Some(body);
        self.traits.insert(token_id.clone(), traits);
        env::log_str(&format!("CTOad #{token_id} recolored to {}", self.layer(Category::Body, body).name));
    }
}

impl Contract {
    fn traits_of(&self, token_id: &TokenId) -> &Traits {
        self.traits
            .get(token_id)
            .unwrap_or_else(|| env::panic_str(&format!("CTOad #{token_id} doesn't exist")))
    }

    /// Fills in a token's `media` with its image, and adds its traits to `extra`.
    pub(crate) fn with_art(&self, mut token: Token) -> Token {
        if let Some(metadata) = token.metadata.as_mut() {
            let svg = self.ctoad_svg(token.token_id.clone());
            metadata.media = Some(format!("data:image/svg+xml;base64,{}", BASE64.encode(svg)));
            let mut extra: serde_json::Value = metadata
                .extra
                .as_deref()
                .and_then(|e| serde_json::from_str(e).ok())
                .unwrap_or_else(|| json!({}));
            extra["traits"] = json!(self.ctoad_traits(token.token_id.clone()));
            metadata.extra = Some(extra.to_string());
        }
        token
    }

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
