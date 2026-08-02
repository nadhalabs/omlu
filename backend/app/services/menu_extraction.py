import asyncio
import json
import logging

from app.config import settings
from app.schemas.menu_import import MenuExtractionResult

logger = logging.getLogger(__name__)

MENU_EXTRACTION_PROMPT = """
You are extracting structured restaurant-menu data from one or more uploaded menu images.

Return only valid JSON matching the supplied response schema.

Do not return markdown.
Do not return commentary.
Do not return explanations outside the JSON.
Do not return extra keys that are not in the schema.
Do not invent missing information.
Do not use general food knowledge as evidence.
The visible image content and visible layout are the only source of truth.

==================================================
1. GENERAL READING RULES
==================================================

- Treat all uploaded images as parts of one possible continuous menu.
- First determine whether the images visibly belong to the same menu.
- Read visible section headings before assigning items.
- Read multi-column layouts column by column.
- Respect visible alignment, spacing, indentation, borders, boxes, font size,
  font weight, colour, separators and section boundaries.
- Do not merge unrelated rows, columns or sections.
- Do not continue one row into a neighbouring column.
- Preserve visible spelling, wording and capitalization.
- Do not silently correct spelling.
- Never estimate or infer a missing name, category, description, price, option,
  selection rule or relationship.
- Add a warning whenever a visible relationship is unclear.
- Lower confidence whenever text, alignment or grouping is uncertain.

==================================================
2. MULTIPLE IMAGE AND OVERLAP RULES
==================================================

- Uploaded images may overlap.
- Treat overlapping images as repeated views of the same menu area only when
  visible content confirms the overlap.
- Avoid duplicate items caused by overlapping photographs.
- When the same item appears in multiple images, use the clearest complete
  visible version.
- Do not duplicate an item merely because it appears in two photographs.
- Do not assign a heading from one image to an item in another image unless the
  images visibly overlap or clearly continue the same section.
- If an item is cropped at an image boundary, do not reconstruct missing text.
- If the relationship across image boundaries is unclear, add a warning.

==================================================
3. CATEGORY RULES
==================================================

- Extract a category only when a category heading is visibly present.
- Assign an item only to the category heading visibly associated with it.
- Use layout signals such as heading position, spacing, indentation, borders,
  columns and section boundaries.
- Never infer category from general food knowledge.
- Never infer category from the item name alone.
- Preserve the exact visible category wording.
- Do not rename, translate, normalize, combine or improve category names.
- If category association is unclear, return category as null.
- Do not create a category merely because several item names share a word such
  as Tea, Coffee, Juice, Dosa, Biriyani, Mandhi, Pizza or Burger.
- Never assume Chicken 65 belongs to Starters.
- Never assume Biriyani belongs to Main Course.
- Never assume Chicken Mandhi, Peri Peri Mandhi or Al Faham Mandhi belong to a
  category named Mandhi unless a visible heading or visible layout supports it.
- Return category confidence based only on visible certainty.

==================================================
4. ITEM RULES
==================================================

- Extract each visibly separate product as a separate item.
- Treat independent menu rows as independent items unless the visible layout
  clearly establishes a parent item with subordinate choices.
- Do not merge separate products merely because their names are similar.
- Do not split one wrapped item name into multiple items.
- Do not join two neighbouring item names into one item.
- Do not create an item from a category heading.
- Do not create a category heading as an item.
- Preserve the exact visible item name and spelling.
- Extract descriptions only when visibly associated with the item.
- Do not generate descriptions from the item name.
- Do not infer ingredients, serving size, spice level, preparation method,
  included sides or dietary status.
- If an item name is unreadable, omit the item and add a warning.
- If only part of an item name is readable, do not guess the missing part.
- Return item confidence based only on visual certainty.

==================================================
5. SEPARATE ITEM VERSUS CONFIGURABLE ITEM
==================================================

Keep items separate when they are shown as independent rows.

Example:

Black Tea ₹15
Black Tea Without Sugar ₹15

Correct interpretation:
- two separate menu items

Do not automatically combine them into one Black Tea item with sugar options.

Create one configurable item only when the visible layout clearly shows one
parent item with subordinate choices.

Example:

Black Tea ₹15
With Sugar / Without Sugar / Less Sugar

Correct interpretation when the choices are visibly subordinate:
- one item: Black Tea
- one choice group containing the visible sugar choices

The same rule applies to juices, coffees, pizzas, burgers, dosas, Mandhi,
bakery items and all other menu types.

Do not convert separate rows such as Orange Juice, Watermelon Juice and
Pineapple Juice into flavour choices unless the visible menu explicitly presents
them as choices under one parent item.

==================================================
6. BASE PRICE RULES
==================================================

- Use base_price only when the item has one clear visible selling price.
- Preserve the visible numeric value exactly.
- Do not calculate or estimate a price.
- Do not derive one price from another.
- Do not choose the cheapest variant as base_price.
- Do not duplicate a variant price into base_price.
- When final-price variants determine the selling price, base_price may be null.
- When additive option groups are present, preserve the visible base item price.
- If no valid base price and no final-price variant group is visible, do not
  invent a price. Add a warning.

==================================================
7. PRICE FORMAT RULES
==================================================

- Treat ₹, Rs, INR and clearly aligned bare numeric values as prices only when
  their visible placement supports that interpretation.
- Preserve decimals exactly as visible.
- Do not infer missing decimal places.
- Do not convert currencies.
- Do not calculate tax-inclusive or tax-exclusive values.
- Do not confuse weights, calories, percentages, item numbers, quantities,
  page numbers or phone numbers with prices.
- Do not assign a nearby price unless row or column alignment clearly connects
  it to the item or choice.
- Never shift a price from the row above, row below or neighbouring column.
- Never copy a missing price from another row.
- Negative prices are invalid.
- If a price association is unclear, leave it null where the schema allows and
  add a warning.

==================================================
8. OPTION GROUP DETECTION
==================================================

An option group is a visibly connected set of choices belonging to one item.

Possible visible group concepts include:

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
- Temperature
- Bread Choice
- Cooking Style

These are examples only.
Do not create an option group unless the visible menu supports it.

Treat labels as choices when one or more of the following is visible:

- the labels appear under one parent item
- they share one visible group heading
- the menu says choose, choice of, select, available in, with/without or
  equivalent wording
- indentation or alignment clearly connects them to one parent item
- a table, box, bracket or shared header visibly groups them

Treat labels as separate items when:

- each label appears as an independent menu row
- each has its own independent price structure
- each is styled like other product names
- the visible layout does not establish one parent item

Do not create a group merely because several names are similar.

==================================================
EMPTY OPTION GROUPS — STRICTLY FORBIDDEN
==================================================

- Never return an option group with an empty options array.
- Create an option group only when at least one real, visible option can be extracted from the menu.
- A heading, bracket, indentation pattern, price column, or suspected configuration structure is not sufficient by itself.
- Never create placeholder option groups.
- Never create a group named "Choice" unless it contains at least one actual extracted option.
- If a possible option structure is visible but its options are unreadable, cropped, absent, or ambiguous:
  - omit the option group completely;
  - preserve the menu item;
  - lower the relevant confidence where supported by the schema;
  - add an owner-review warning only if the existing schema supports such a warning.
- Never represent uncertainty using an empty option group.
- Before returning JSON, remove every option group whose options array is empty.

==================================================
9. OPTION GROUP NAME RULES
==================================================

- Preserve the exact visible option-group heading when one exists.
- Do not rename or normalize a visible heading.
- If choices are clearly connected to an item but no group heading is visible,
  use a short neutral structural name only if the schema requires a name.
- Use the neutral group name "Choice" only when real options are clearly visible but the group heading is missing or unreadable.
- "Choice" must never be created merely because an item might be configurable.
- Every "Choice" group must contain at least one extracted option.
- Lower confidence and add a warning whenever the group name was not visibly
  present.
- Do not invent marketing-oriented, cuisine-based or knowledge-based group names.

==================================================
10. FINAL-PRICE VARIANT RULES
==================================================

Use type="variant" when choosing one option determines the final customer price.

Common visible examples include:

- Quarter, Half, Full
- Small, Regular, Large
- Single, Double
- Half Plate, Full Plate
- 250 ml, 500 ml, 1 litre
- 6 inch, 9 inch, 12 inch

These examples are recognition aids only.
Do not create a variant unless the visible layout supports it.

For variant groups:

- each option uses final_price
- price_delta must be null
- final_price is the complete final customer price for that selected option
- never treat final_price as an amount added to base_price
- never subtract one variant price from another
- do not calculate price differences
- do not invent a base price
- preserve the exact visible option label
- preserve each visible final price exactly
- use required=true, minimum_selections=1 and maximum_selections=1 only when the
  visible structure clearly requires exactly one selection
- if exact-one selection is not visibly established, follow the ambiguity
  fallback rules

Example:

Chicken Mandhi
Quarter ₹180
Half ₹350
Full ₹680

Correct:
- group type: variant
- Quarter final_price: 180
- Half final_price: 350
- Full final_price: 680

Incorrect:
- base_price: 180
- Half price_delta: 170
- Full price_delta: 500

==================================================
11. ADDITIVE AND ZERO-PRICE CHOICE RULES
==================================================

Use type="addon" for any non-final-price choice group, including:

- free preparation choices
- required preferences
- optional extras
- additive paid choices
- zero-price choices

In this schema, type="addon" means the option value is added to the current item
price, including an addition of zero.

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

For addon groups:

- each option uses price_delta
- final_price must be null
- preserve zero-price choices
- do not remove an option because price_delta is zero
- do not convert additive amounts into final prices
- do not convert final prices into additive amounts
- do not subtract values to calculate price_delta
- preserve exact visible added amounts
- do not silently make a paid option required
- do not assume optional or required behaviour from restaurant conventions

A zero-price choice may represent preparation preference rather than an extra.

Examples include:

- With Sugar
- Without Sugar
- Less Sugar
- With Ice
- Without Ice
- Hot
- Cold
- Regular Crust
- No Onion
- No Garlic

Preserve such choices when visibly connected to the item.

Do not invent +₹0 solely because no price is printed.
When a visible choice has no stated added price and the schema requires a
numeric price_delta:
- use price_delta=0
- lower confidence
- add a warning stating that no additional charge was visibly shown

==================================================
12. MULTIPLE OPTION GROUPS
==================================================

One item may contain multiple visible option groups.

Example:

Pizza

Size:
- Small ₹180
- Medium ₹260
- Large ₹340

Crust:
- Regular +₹0
- Thin +₹0
- Cheese Burst +₹80

Toppings:
- Mushroom +₹30
- Paneer +₹40
- Extra Cheese +₹50

Correct interpretation:
- one final-price variant group for Size
- one addon group for Crust
- one addon group for Toppings

Keep each visible group separate.
Do not merge all choices into one group.
Do not place choices from one group into another group.
Preserve visible group order.

==================================================
13. SELECTION RULES
==================================================

Do not infer required, optional, single-select or multi-select behaviour from
general restaurant conventions.

Set required, minimum_selections and maximum_selections only when the visible
menu explicitly supports the selection rule.

Visible support may include wording such as:

- choose one
- select one
- any one
- choose up to two
- select any three
- optional
- add any
- choose your toppings
- one choice included
- maximum two
- multiple selections allowed

When the menu clearly requires one mutually exclusive choice, use:

- required=true
- minimum_selections=1
- maximum_selections=1

When the menu clearly states optional, use:

- required=false
- minimum_selections=0

When the menu clearly permits multiple selections, set maximum_selections only
to the visibly supported number.

Never silently make a paid option required.

Never silently allow multiple selections when the menu does not visibly permit
them.

==================================================
14. AMBIGUITY FALLBACK RULES
==================================================

When a visible item or option structure is real but its exact configuration is
unclear:

- preserve the visible item and choice labels
- do not invent missing prices
- do not invent required status
- do not invent multi-select behaviour
- use required=false
- use minimum_selections=0
- use maximum_selections=1
- lower option-group confidence
- add a warning requiring owner review

Never discard a clearly visible choice solely because its selection rules are
unclear.

Never silently make an extra paid option compulsory.

Never silently allow multiple selections when the menu does not visibly permit
them.

==================================================
15. SHARED TABLE AND MATRIX RULES
==================================================

When a menu uses row and column pricing:

- identify row labels before assigning prices
- identify column labels before assigning prices
- treat visible size labels as shared column headers when clearly shown
- match each aligned price to the correct row and column
- do not shift prices between rows
- do not shift prices between columns
- do not copy missing values from neighbouring rows
- do not assign one row's prices to another row
- lower confidence and add a warning when alignment is ambiguous

A shared price row may apply to several items only when a visible table, box,
bracket, shared header or clear alignment supports that relationship.

Do not reuse one item's option prices for nearby items merely because their names
are similar.

==================================================
16. ITEM FAMILY RULES
==================================================

Related products may appear under one visible category.

Example:

MANDHI

Chicken Mandhi
Peri Peri Mandhi
Al Faham Mandhi

When they are independent rows:
- create separate items
- keep the visible category association
- do not combine them into one parent item
- do not treat Chicken, Peri Peri or Al Faham as size variants

If each row has Quarter, Half and Full prices:
- create one Portion variant group per item
- assign only the aligned prices belonging to that row

Do not merge same-named or similar items unless the visible structure clearly
shows a single configurable parent item.

==================================================
17. ADD-ON VERSUS SEPARATE PRODUCT RULES
==================================================

Examples such as:

Extra Shot +₹20
Extra Cheese +₹30
Ice Cream +₹40

should be addon choices only when visibly subordinate to a parent item or group.

If "Extra Cheese Pizza" appears as an independent product row with its own full
price, keep it as a separate item.

Do not convert an independent product into an addon merely because its name
contains "Extra".

==================================================
18. FOOD TYPE RULES
==================================================

- Use veg, non-veg, egg or similar classification only when visibly indicated.
- A clearly visible standard veg, non-veg or egg marker may be used.
- The marker must be visibly associated with the specific item.
- Do not copy a marker from one item to neighbouring items.
- Do not copy a marker from a category heading to all items unless the layout
  explicitly establishes that relationship.
- Do not infer food type from words such as Chicken, Beef, Fish, Egg, Paneer,
  Vegetable or Mushroom.
- If the marker or association is unclear, return unknown and add a warning.

==================================================
19. CONFIDENCE RULES
==================================================

- Confidence measures visual extraction certainty only.
- Do not increase confidence because a dish or menu pattern is familiar.
- Lower confidence when text is blurry, cropped, obstructed, distorted,
  shadowed or low-resolution.
- Lower confidence when price alignment is ambiguous.
- Lower confidence when category association is ambiguous.
- Lower confidence when parent-item and choice relationships are ambiguous.
- Lower confidence when a group name is generated because no heading is visible.
- Lower confidence when selection rules are not visibly stated.
- Item confidence, category confidence and option-group confidence must be
  evaluated separately.
- Every uncertain relationship must produce a warning.
- High confidence must never be used to hide uncertainty.

==================================================
20. FINAL VALIDATION
==================================================

Before returning JSON, verify:

- every item is visibly present
- every item name is readable
- every category is visibly supported or null
- every description is visibly associated
- every option group is visibly connected to its parent item
- every option label is visible
- every monetary value is visible or explicitly handled under the zero-price
  ambiguity rule
- final prices and added amounts are not confused
- zero-price choices are preserved
- separate products were not incorrectly merged
- configurable choices were not incorrectly turned into separate products
- row and column prices were not shifted
- overlapping photos did not create duplicates
- no required or multi-select rule was invented
- every option group contains at least one valid option
- no option group has an empty options array
- no placeholder option groups exist
- every generic "Choice" group contains real extracted options
- unreadable option structures are omitted rather than returned as empty groups
- every uncertainty has a warning
- only schema-supported fields are returned
- the response is valid JSON only
""".strip()


def _normalize_extraction_payload(payload: dict) -> dict:
    """Normalize extracted menu JSON payload by removing invalid empty option groups before schema validation."""
    if not isinstance(payload, dict):
        return payload

    categories = payload.get("categories")
    if not isinstance(categories, list):
        return payload

    removed_groups_count = 0
    affected_items_count = 0

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
            item_affected = False
            for group in option_groups:
                if not isinstance(group, dict):
                    removed_groups_count += 1
                    item_affected = True
                    continue
                options = group.get("options")
                if not isinstance(options, list) or len(options) == 0:
                    removed_groups_count += 1
                    item_affected = True
                    continue

                valid_groups.append(group)

            item["option_groups"] = valid_groups
            if item_affected:
                affected_items_count += 1

    if removed_groups_count > 0:
        logger.info(
            f"Normalized menu extraction payload: removed {removed_groups_count} empty option group(s) across {affected_items_count} item(s)."
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
