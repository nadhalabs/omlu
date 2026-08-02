import asyncio
import json
import logging

from app.config import settings
from app.schemas.menu_import import MenuExtractionResult

logger = logging.getLogger(__name__)

MENU_EXTRACTION_PROMPT = """
You are extracting structured restaurant-menu data from one or more uploaded menu images.

Return only valid JSON matching the supplied response schema. Return no markdown,
commentary, explanations, or extra keys. The visible text and layout are the only
source of truth. Do not use general food knowledge, calculate missing values, or
guess unreadable content.

Perform the following procedure in order. Do not map content into the response
schema until the visual structure and price matrices have been reconstructed.

==================================================
MANDATORY REASONING ORDER
==================================================

1. PAGE SEGMENTATION

- Identify page regions, columns, category headings, product blocks, subsection
  headings, row labels, and aligned price columns.
- Determine the complete visual boundary of every product block before extracting
  items. Use alignment, spacing, indentation, borders, boxes, typography, colour,
  and separators.
- Read multi-column layouts by their visible regions. Text or prices inside one
  product block must not be attached to an adjacent block or column.
- Across multiple or overlapping images, merge content only when visible overlap
  proves it is the same region. Never reconstruct cropped text.

2. STRUCTURAL TRANSCRIPTION

- For each product block, first transcribe its visible hierarchy: product heading,
  optional description, default rows, subsection headings, and scoped rows.
- A subsection heading applies to the rows visually beneath it until that product
  block ends or another subsection begins.
- Repeated row labels under different subsections are distinct combinations, not
  duplicates. Preserve their subsection context.
- Decide whether a label is a product, category, subsection, or choice from its
  visual role, not from the words alone.

3. PRICE-MATRIX CONSTRUCTION

- Before choosing a base price or option group, construct the complete mapping
  from every visible varying dimension to its price for each product.
- Dimensions may include portion, size, serving, preparation, or another visible
  label. For example: portion = Quarter/Half/Full and preparation = With Rice/
  Without Rice.
- Verify every visible price belongs to exactly one product and exactly one row or
  combination. Do not shift, copy, or reuse prices across rows, blocks, or columns.
- Distinguish monetary values from weights, calories, quantities, item numbers,
  phone numbers, and page numbers using visible alignment and currency context.

4. SCHEMA MAPPING

- Only after the matrix is complete, choose among: a single base price,
  final-price variants, additive options, or separate independent items.
- Use price (the schema's base_price field) only for a separate standalone selling
  price visibly printed for the parent item.
- When all purchasable forms have their own prices, set price=null and create one
  required type="variant" group containing every visible purchasable form.
- Every variant option uses final_price; price_delta must be null. A final price is
  the complete customer price, never an amount added to a base price.
- Add-ons use price_delta and final_price=null only when the visible amount is an
  addition to an independently priced item. Preserve visible zero-price choices.
- Keep independent product rows as separate items unless layout clearly establishes
  one parent with subordinate choices.

5. FINAL VISUAL RECONCILIATION

- For every matrix-priced item, count the visible purchasable rows and compare that
  count with extracted options.
- Confirm no visible price disappeared, moved to another product, or appears more
  than once.
- Confirm no matrix price is reused as both price/base_price and variant final_price.
- Confirm repeated row labels remain distinguished by subsection context and every
  subsection remains represented in option names or distinct option groups.
- If reconciliation fails, lower confidence and add a review warning. Never hide
  uncertainty behind a simplified but structurally valid JSON shape.

==================================================
STRICT MATRIX-PRICING CONTRACT
==================================================

- Never select the smallest, first, last, or most prominent matrix price as price/base_price.
- Never use a price belonging to Quarter, Half, Full, Small, Medium, Large,
  With Rice, Without Rice, or another labelled row as a general base price.
- If two or more labelled purchasable rows have different prices, price must be
  null unless a separate standalone parent price is visibly printed.
- Every matrix price must appear exactly once as a final_price option.
- Never convert final prices into price deltas, subtract the lowest price, or
  calculate differences between prices.
- Never create a generic Choice group when meaningful varying dimensions can be
  derived from visible labels.

For every matrix-priced item, the final response must satisfy this checklist:

- price is null;
- option count equals visible priced-row count;
- every visible price appears exactly once;
- repeated row labels are distinguished by subsection context;
- every option uses final_price and no option uses price_delta;
- group type is "variant";
- required=true, minimum_selections=1, maximum_selections=1;
- the group name is meaningful;
- no subsection is silently discarded.

==================================================
SUBSECTION SCOPE AND MEANINGFUL NAMES
==================================================

- A heading inside a product block applies only beneath it and only within that block.
- WITHOUT RICE changes the meaning of Quarter/Half/Full beneath it. Quarter above
  WITHOUT RICE and Quarter beneath it are distinct choices.
- When a default upper section has no explicit heading, but a rice-based product
  has a visibly contrasting WITHOUT RICE subsection, distinguish the upper rows as
  "With Rice". This is the direct neutral complement needed to preserve the visible
  contrast, not unrelated cuisine knowledge. Infer no other preparation attribute.
- Preserve an explicit visible group heading. Otherwise derive a short structural
  name from the dimensions: Quarter/Half/Full -> Portion or Serving;
  Small/Medium/Large -> Size; portion plus With Rice/Without Rice ->
  Portion & Preparation.
- Use Choice only when no meaningful structural name can be derived and at least
  one real visible option exists. Never return an empty option group.

==================================================
EXACT WORKED MATRIX EXAMPLE
==================================================

Visible structure:

CHICKEN MANDI
Quarter 170
Half 330
Full 650

WITHOUT RICE
Quarter 100
Half 190
Full 370

Correct semantic output:

- item name: Chicken Mandi
- price/base_price: null
- one group named "Portion & Preparation"
- type="variant", required=true, minimum_selections=1, maximum_selections=1
- Quarter — With Rice, final_price=170
- Half — With Rice, final_price=330
- Full — With Rice, final_price=650
- Quarter — Without Rice, final_price=100
- Half — Without Rice, final_price=190
- Full — Without Rice, final_price=370

Explicitly incorrect: price/base_price=100 with only portion options; base price
170 plus Without Rice add-ons; six separate menu items; an empty or generic Choice
group; price_delta values derived by subtraction; or dropping any upper/lower row.

==================================================
CATEGORY RECONSTRUCTION
==================================================

- Preserve explicitly printed category headings such as JUICE ITEMS, LIME ITEMS,
  and EXTRAS, and associate only the items visibly scoped beneath them.
- Do not treat an individual product heading such as CHICKEN MANDI as a category.
- A repeated family term across sibling product-block headings may be a derived
  category only when the blocks are visibly grouped as peers in the same region
  and the repeated term is structurally central rather than incidental.
- For six adjacent peer headings ending in MANDI, category "Mandi" is permitted;
  add a review warning that the category was derived from repeated visible headings.
- Do not apply this rule across unrelated page regions. Otherwise return category
  null when no printed or visually supported category exists.
- Never infer categories from arbitrary cuisine knowledge.

==================================================
OTHER SCHEMA AND EXTRACTION CONTRACTS
==================================================

- Preserve visible item/category wording and spelling; do not silently correct,
  translate, market, or normalize it, except the explicitly permitted derived
  structural labels above.
- Descriptions must be visibly associated. Food type is veg/non_veg/egg only from
  a clearly associated visible marker; words in an item name are not evidence.
- Variant groups are always mutually exclusive final-price forms and therefore
  always required=true, minimum_selections=1, maximum_selections=1.
- Add-on selection constraints follow visible wording. If an add-on's selection
  rule is absent, use required=false, minimum_selections=0, maximum_selections=1.
- A visible add-on with no shown extra charge may use price_delta=0 only with
  lowered confidence and a warning. Never invent +0 for an unseen choice.
- Omit unreadable items or option structures instead of inventing placeholders.
  Preserve readable parent items, lower confidence, and add review warnings.
- Confidence measures visual certainty, not familiarity. Lower it for blur,
  cropping, ambiguous alignment, generated structural names, derived categories,
  or uncertain relationships.
- Every uncertainty must be represented by a schema-supported warning.

Before returning JSON, repeat final visual reconciliation for every product block,
then verify the entire response contains no empty groups, no price used in conflicting
roles, no shifted row/column values, no cross-block choices, no duplicate overlap
items, and no fields outside the response schema.
""".strip()


def _normalize_extraction_payload(payload: dict) -> dict:
    """Normalize extracted menu JSON payload by removing invalid empty option groups and canonicalizing variant selection rules before schema validation."""
    if not isinstance(payload, dict):
        return payload

    categories = payload.get("categories")
    if not isinstance(categories, list):
        return payload

    removed_groups_count = 0
    canonicalized_variants_count = 0
    affected_items_set = set()

    for cat in categories:
        if not isinstance(cat, dict):
            continue
        items = cat.get("items")
        if not isinstance(items, list):
            continue

        for item in items:
            if not isinstance(item, dict):
                continue
            option_groups = item.get("option_groups")
            if option_groups is None or not isinstance(option_groups, list):
                continue

            valid_groups = []
            item_id = id(item)

            for group in option_groups:
                if not isinstance(group, dict):
                    removed_groups_count += 1
                    affected_items_set.add(item_id)
                    continue
                options = group.get("options")
                if not isinstance(options, list) or len(options) == 0:
                    removed_groups_count += 1
                    affected_items_set.add(item_id)
                    continue

                if group.get("type") == "variant":
                    is_canonical = (
                        group.get("required") is True
                        and group.get("minimum_selections") == 1
                        and group.get("maximum_selections") == 1
                    )
                    if not is_canonical:
                        group["required"] = True
                        group["minimum_selections"] = 1
                        group["maximum_selections"] = 1
                        canonicalized_variants_count += 1
                        affected_items_set.add(item_id)

                valid_groups.append(group)

            item["option_groups"] = valid_groups

    affected_items_count = len(affected_items_set)
    if removed_groups_count > 0 or canonicalized_variants_count > 0:
        logger.info(
            f"Normalized menu extraction payload: removed {removed_groups_count} empty option group(s), canonicalized {canonicalized_variants_count} variant group(s) across {affected_items_count} item(s)."
        )

    return payload



async def extract_menu(images: list[dict]) -> MenuExtractionResult:
    if not settings.gemini_api_key:
        raise RuntimeError("Menu scanning is not configured (GEMINI_API_KEY is missing)")
    if not settings.gemini_model:
        raise RuntimeError("Menu scanning is not configured (GEMINI_MODEL is missing)")

    from google import genai

    client = genai.Client(api_key=settings.gemini_api_key)
    contents: list = [MENU_EXTRACTION_PROMPT]
    for image in images:
        contents.append({
            "inline_data": {
                "mime_type": image["mime_type"],
                "data": image["content"],
            }
        })

    def generate():
        return client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config={
                "response_mime_type": "application/json",
                "response_schema": MenuExtractionResult,
                "temperature": 0,
            },
        )

    response = await asyncio.to_thread(generate)
    try:
        raw_payload = json.loads(response.text)
    except Exception:
        return MenuExtractionResult.model_validate_json(response.text)

    normalized_payload = _normalize_extraction_payload(raw_payload)
    return MenuExtractionResult.model_validate(normalized_payload)
