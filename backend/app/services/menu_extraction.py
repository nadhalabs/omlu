import asyncio

from app.config import settings
from app.schemas.menu_import import MenuExtractionResult

MENU_EXTRACTION_PROMPT = """
Read the menu according to its visible layout. Return only the requested schema.

Category rules:
- Assign an item only to the category heading visibly associated with it.
- Never infer a category from general food knowledge.
- Never assume Chicken 65 is a starter.
- Never assume biriyani is a main course.
- If the category heading is unclear, return category as null.
- Preserve the exact category wording shown in the image.
- Do not create categories that are not visible.

Item rules:
- Extract only text visibly present.
- Do not invent names, descriptions, prices or variants.
- If multiple prices correspond to sizes, create variants. Each variant price
  must be the final customer price for that size, never a price adjustment.
- If the relationship between prices and sizes is unclear, add a warning.
- If an item is unreadable, do not guess.
- Return a confidence score for every item and category assignment.

Read columns separately and headings before items. Respect price alignment,
half/full and regular/large variants. Use veg/non-veg symbols only when clearly
visible. Treat uploaded photos as a continuous menu and avoid repeated items
caused by overlapping photos.
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
