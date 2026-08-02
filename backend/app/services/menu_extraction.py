import asyncio

from app.config import settings
from app.schemas.menu_import import MenuExtractionResult

MENU_EXTRACTION_PROMPT = """
You are extracting structured restaurant-menu data from uploaded menu images.

Return only valid JSON matching the supplied response schema.
Do not return markdown.
Do not return explanations outside JSON.
Do not invent missing information.
Do not use general food knowledge as evidence.
The visible layout is the source of truth.

GENERAL READING RULES

- Treat all uploaded images as parts of one continuous menu.
- Read visible headings before items.
- Read columns separately.
- Respect alignment, spacing, indentation, boxes, borders, font size and section boundaries.
- Do not merge unrelated rows or columns.
- Avoid duplicate items caused by overlapping photographs.
- Preserve visible spelling and wording.
- Never estimate a missing name, price, category, option or relationship.
- Add a warning whenever a relationship is unclear.

CATEGORY RULES

- Extract a category only when a category heading is visibly present.
- Assign an item only to the visibly associated heading.
- Never infer category from food knowledge or item name.
- Preserve exact category wording.
- If category association is unclear, return category as null.
- Do not create a category merely because multiple names share words such as Tea, Coffee, Juice, Dosa, Biriyani or Mandhi.

ITEM RULES

- Extract each visibly separate product as a separate item.
- Do not merge separate rows into one item merely because they are similar.
- Do not split one wrapped item name into multiple items.
- Omit unreadable item names and add a warning.
- Extract descriptions only when visibly associated.
- Do not infer ingredients, serving size, spice level or included sides.

BASE PRICE RULES

- Use base_price when the item has one clear selling price.
- Preserve the visible price exactly.
- Do not calculate or estimate prices.
- Do not use the cheapest variant as base_price.
- If final-price variants determine the price, base_price may be null.

OPTION GROUP DETECTION

An option group is a visibly connected set of choices belonging to one item.

Possible groups include:

- Size
- Portion
- Sugar Preference
- Milk Choice
- Spice Level
- Crust
- Preparation
- Toppings
- Extras
- Add-ons
- Flavour

These names are examples only.
Do not create a group unless the visible menu supports it.

Distinguish separate products from choices.

Treat labels as separate products when:

- each appears as a separate item row
- each has its own independent price structure
- each is formatted like other item names

Treat labels as choices when:

- they appear under one item
- they share one visible group heading
- the menu says choose, choice of, select, available in, with/without, or equivalent wording
- their alignment clearly connects them to one parent item

Do not automatically turn Orange Juice, Watermelon Juice and Pineapple Juice into flavour choices if they are listed as separate menu items.

FINAL-PRICE VARIANT RULES

Use type="variant" when selecting one option determines the final customer price.

Common examples:

- Quarter, Half, Full
- Small, Regular, Large
- Single, Double
- Half Plate, Full Plate

Rules:

- each option uses final_price
- price_delta must be null
- final_price is the complete customer price for that selection
- never convert final prices into added amounts
- never subtract one option price from another
- do not invent a base price
- preserve visible labels
- use required=true, minimum=1 and maximum=1 only when the visual structure clearly requires exactly one selection

Example:

Chicken Mandhi
Quarter ₹180
Half ₹350
Full ₹680

Correct:
- group name: Portion
- type: variant
- Quarter final_price: 180
- Half final_price: 350
- Full final_price: 680

Incorrect:
- base price 180
- Half +170
- Full +500

ADDITIVE OPTION RULES

Use type="addon" when an option adds an amount to the base item price or represents a configurable choice.

Examples:

Black Tea ₹15
Sugar Preference:
- With Sugar +₹0
- Without Sugar +₹0
- Less Sugar +₹0

Coffee ₹40
Extras:
- Extra Shot +₹20
- Ice Cream +₹30

Rules:

- each choice uses price_delta
- final_price must be null
- preserve zero-price choices
- do not drop +₹0 choices
- do not turn additive amounts into final prices
- do not infer required/optional status unless visibly supported
- use single-select when only one choice is allowed
- use multi-select when multiple choices are visibly allowed
- if selection rules are unclear, use conservative defaults and add a warning

MULTIPLE GROUP RULES

One item may have more than one group.

Example:

Pizza
- Size: Small / Medium / Large
- Crust: Regular / Thin / Cheese Burst
- Toppings: Mushroom / Paneer / Extra Cheese

Keep each visible group separate.
Do not merge all choices into one group.

SHARED TABLE RULES

When a menu uses row and column pricing:

- treat size labels as shared column headers
- match each aligned price to the correct row and column
- do not shift prices between rows
- do not copy missing values from neighbouring rows
- lower confidence and add a warning when alignment is ambiguous

ZERO-PRICE CHOICE RULES

Choices with no additional charge are valid.

Preserve choices such as:

- With Sugar +₹0
- Without Sugar +₹0
- Less Sugar +₹0
- Regular Crust +₹0

Do not remove them because their price is zero.

FOOD TYPE RULES

- Use veg, non-veg, egg or similar classification only when visibly indicated.
- Do not infer food type from words such as Chicken, Beef, Egg, Paneer or Vegetable.
- If the marker is unclear, return unknown and add a warning.

CONFIDENCE RULES

- Confidence measures visual certainty only.
- Do not increase confidence because a dish is familiar.
- Lower confidence for blurry, cropped, obstructed or ambiguously aligned text.
- Item confidence, category confidence and option-group confidence must be evaluated separately.
- Every uncertain relationship must produce a warning.

FINAL VALIDATION

Before returning JSON, verify:

- every item is visibly present
- every category is visibly supported or null
- every option group is visibly connected to its parent item
- every option label is visible
- every monetary value is visible
- final prices and added amounts are not confused
- zero-price options are preserved
- separate products were not incorrectly merged
- overlapping photos did not create duplicates
- only schema-supported fields are returned
- the response is valid JSON only
""".strip()


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
    return MenuExtractionResult.model_validate_json(response.text)
