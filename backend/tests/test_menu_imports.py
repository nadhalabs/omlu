import uuid
from decimal import Decimal

import pytest

from app.database import SessionLocal
from app.main import app
from app.models.menu import MenuItem, MenuOption, MenuOptionGroup
from app.models.menu_import import MenuImportDraftItem, MenuImportJob
from app.models.restaurant import Restaurant
from app.models.staff_user import StaffUser
from app.utils.auth import hash_password
from tests.auth_helpers import create_session_access_token as create_access_token
from tests.participant_helpers import ParticipantTestClient

client = ParticipantTestClient(app)


@pytest.fixture
def import_context():
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:10]
    restaurant = Restaurant(name="Import Bistro", slug=f"import-{suffix}", is_active=True, currency="INR", order_prefix="IB")
    other_restaurant = Restaurant(name="Other Bistro", slug=f"import-other-{suffix}", is_active=True, currency="INR", order_prefix="OB")
    db.add_all([restaurant, other_restaurant])
    db.flush()

    owner = StaffUser(
        restaurant_id=restaurant.id,
        name="Owner User",
        email=f"owner-{suffix}@import.local",
        password_hash=hash_password("Password123!"),
        role="owner",
        is_active=True,
    )
    other_owner = StaffUser(
        restaurant_id=other_restaurant.id,
        name="Other Owner",
        email=f"other-{suffix}@import.local",
        password_hash=hash_password("Password123!"),
        role="owner",
        is_active=True,
    )
    db.add_all([owner, other_owner])
    db.commit()

    data = {
        "restaurant_id": restaurant.id,
        "other_restaurant_id": other_restaurant.id,
        "owner_token": create_access_token({"sub": str(owner.id), "restaurant_id": restaurant.id, "role": "owner"}),
        "other_owner_token": create_access_token({"sub": str(other_owner.id), "restaurant_id": other_restaurant.id, "role": "owner"}),
    }
    db.close()
    yield data

    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id.in_([restaurant.id, other_restaurant.id])).delete()
    db.commit()
    db.close()


def auth(data, key="owner_token"):
    return {"Authorization": f"Bearer {data[key]}"}


def create_draft_job(db, restaurant_id, created_by_id, items_data):
    job = MenuImportJob(
        restaurant_id=restaurant_id,
        created_by=created_by_id,
        status="review_required",
        original_result={"categories": [], "general_warnings": []},
    )
    db.add(job)
    db.flush()

    draft_items = []
    for item in items_data:
        draft = MenuImportDraftItem(
            import_job_id=job.id,
            category_name=item.get("category_name", "Beverages"),
            item_name=item.get("item_name", "Test Item"),
            description=item.get("description"),
            price=Decimal(str(item["price"])) if item.get("price") is not None else None,
            food_type=item.get("food_type", "veg"),
            option_groups=item.get("option_groups", []),
            variants=item.get("variants", []),
            warnings=item.get("warnings", []),
            item_confidence=Decimal("0.95"),
            category_confidence=Decimal("0.95"),
            selected=item.get("selected", True),
        )
        db.add(draft)
        draft_items.append(draft)

    db.commit()
    job_id = job.id
    draft_ids = [d.id for d in draft_items]
    return job_id, draft_ids


def test_simple_item_import(import_context):
    db = SessionLocal()
    owner = db.query(StaffUser).filter(StaffUser.email.like("%import.local")).first()
    job_id, draft_ids = create_draft_job(db, import_context["restaurant_id"], owner.id, [
        {"item_name": "Black Tea", "price": "15.00", "category_name": "Hot Drinks", "description": "Freshly brewed tea"}
    ])
    db.close()

    response = client.post(
        f"/admin/menu-imports/{job_id}/confirm",
        headers=auth(import_context),
        json={
            "items": [
                {
                    "draft_item_id": str(draft_ids[0]),
                    "selected": True,
                    "category_name": "Hot Drinks",
                    "item_name": "Black Tea",
                    "description": "Freshly brewed hot tea",
                    "price": 15.00,
                    "food_type": "veg",
                    "option_groups": [],
                }
            ]
        },
    )

    assert response.status_code == 200
    assert response.json()["imported"] == 1

    db = SessionLocal()
    created_item = db.query(MenuItem).filter(MenuItem.restaurant_id == import_context["restaurant_id"], MenuItem.name_en == "Black Tea").first()
    assert created_item is not None
    assert created_item.price == Decimal("15.00")
    assert created_item.description_en == "Freshly brewed hot tea"
    db.close()


def test_final_price_variant_import(import_context):
    db = SessionLocal()
    owner = db.query(StaffUser).filter(StaffUser.email.like("%import.local")).first()
    job_id, draft_ids = create_draft_job(db, import_context["restaurant_id"], owner.id, [
        {
            "item_name": "Chicken Mandhi",
            "price": None,
            "category_name": "Arabic",
            "option_groups": [
                {
                    "name": "Portion",
                    "type": "variant",
                    "required": True,
                    "minimum_selections": 1,
                    "maximum_selections": 1,
                    "options": [
                        {"name": "Quarter", "final_price": 180.00, "price_delta": None},
                        {"name": "Half", "final_price": 350.00, "price_delta": None},
                        {"name": "Full", "final_price": 680.00, "price_delta": None},
                    ],
                }
            ],
        }
    ])
    db.close()

    response = client.post(
        f"/admin/menu-imports/{job_id}/confirm",
        headers=auth(import_context),
        json={
            "items": [
                {
                    "draft_item_id": str(draft_ids[0]),
                    "selected": True,
                    "category_name": "Arabic",
                    "item_name": "Chicken Mandhi",
                    "price": None,
                    "food_type": "non_veg",
                    "option_groups": [
                        {
                            "name": "Portion",
                            "type": "variant",
                            "required": True,
                            "minimum_selections": 1,
                            "maximum_selections": 1,
                            "options": [
                                {"name": "Quarter", "final_price": 180.00},
                                {"name": "Half", "final_price": 350.00},
                                {"name": "Full", "final_price": 680.00},
                            ],
                        }
                    ],
                }
            ]
        },
    )

    assert response.status_code == 200
    db = SessionLocal()
    item = db.query(MenuItem).filter(MenuItem.name_en == "Chicken Mandhi").first()
    assert item is not None
    assert item.price == Decimal("180.00")
    group = db.query(MenuOptionGroup).filter(MenuOptionGroup.name == "Portion").first()
    assert group is not None
    assert group.type == "variant"
    assert group.required is True
    options = db.query(MenuOption).filter(MenuOption.group_id == group.id).all()
    assert len(options) == 3
    assert {opt.name: opt.price_delta for opt in options} == {
        "Quarter": Decimal("180.00"),
        "Half": Decimal("350.00"),
        "Full": Decimal("680.00"),
    }
    db.close()


def test_zero_price_sugar_choice_and_additive_extra(import_context):
    db = SessionLocal()
    owner = db.query(StaffUser).filter(StaffUser.email.like("%import.local")).first()
    job_id, draft_ids = create_draft_job(db, import_context["restaurant_id"], owner.id, [
        {
            "item_name": "Coffee",
            "price": "40.00",
            "category_name": "Beverages",
            "option_groups": [
                {
                    "name": "Sugar Preference",
                    "type": "addon",
                    "required": True,
                    "minimum_selections": 1,
                    "maximum_selections": 1,
                    "options": [
                        {"name": "With Sugar", "price_delta": 0.0},
                        {"name": "Without Sugar", "price_delta": 0.0},
                        {"name": "Less Sugar", "price_delta": 0.0},
                    ],
                },
                {
                    "name": "Extras",
                    "type": "addon",
                    "required": False,
                    "minimum_selections": 0,
                    "maximum_selections": 2,
                    "options": [
                        {"name": "Extra Shot", "price_delta": 20.0},
                        {"name": "Ice Cream", "price_delta": 30.0},
                    ],
                },
            ],
        }
    ])
    db.close()

    response = client.post(
        f"/admin/menu-imports/{job_id}/confirm",
        headers=auth(import_context),
        json={
            "items": [
                {
                    "draft_item_id": str(draft_ids[0]),
                    "selected": True,
                    "category_name": "Beverages",
                    "item_name": "Coffee",
                    "price": 40.00,
                    "food_type": "veg",
                    "option_groups": [
                        {
                            "name": "Sugar Preference",
                            "type": "addon",
                            "required": True,
                            "minimum_selections": 1,
                            "maximum_selections": 1,
                            "options": [
                                {"name": "With Sugar", "price_delta": 0.0},
                                {"name": "Without Sugar", "price_delta": 0.0},
                                {"name": "Less Sugar", "price_delta": 0.0},
                            ],
                        },
                        {
                            "name": "Extras",
                            "type": "addon",
                            "required": False,
                            "minimum_selections": 0,
                            "maximum_selections": 2,
                            "options": [
                                {"name": "Extra Shot", "price_delta": 20.0},
                                {"name": "Ice Cream", "price_delta": 30.0},
                            ],
                        },
                    ],
                }
            ]
        },
    )

    assert response.status_code == 200
    db = SessionLocal()
    item = db.query(MenuItem).filter(MenuItem.name_en == "Coffee").first()
    assert item.price == Decimal("40.00")
    sugar_group = db.query(MenuOptionGroup).filter(MenuOptionGroup.name == "Sugar Preference").first()
    assert sugar_group.required is True
    sugar_opts = db.query(MenuOption).filter(MenuOption.group_id == sugar_group.id).all()
    assert len(sugar_opts) == 3
    assert all(opt.price_delta == Decimal("0.00") for opt in sugar_opts)

    extras_group = db.query(MenuOptionGroup).filter(MenuOptionGroup.name == "Extras").first()
    assert extras_group.required is False
    assert extras_group.maximum_selections == 2
    extras_opts = db.query(MenuOption).filter(MenuOption.group_id == extras_group.id).all()
    assert {opt.name: opt.price_delta for opt in extras_opts} == {
        "Extra Shot": Decimal("20.00"),
        "Ice Cream": Decimal("30.00"),
    }
    db.close()


def test_invalid_option_pricing_rejected(import_context):
    db = SessionLocal()
    owner = db.query(StaffUser).filter(StaffUser.email.like("%import.local")).first()
    job_id, draft_ids = create_draft_job(db, import_context["restaurant_id"], owner.id, [
        {"item_name": "Invalid Item", "price": "100.00"}
    ])
    db.close()

    response = client.post(
        f"/admin/menu-imports/{job_id}/confirm",
        headers=auth(import_context),
        json={
            "items": [
                {
                    "draft_item_id": str(draft_ids[0]),
                    "selected": True,
                    "category_name": "Food",
                    "item_name": "Invalid Item",
                    "price": 100.00,
                    "food_type": "veg",
                    "option_groups": [
                        {
                            "name": "Bad Group",
                            "type": "addon",
                            "required": False,
                            "minimum_selections": 0,
                            "maximum_selections": 1,
                            "options": [
                                {"name": "Conflict", "final_price": 50.0, "price_delta": 10.0}
                            ],
                        }
                    ],
                }
            ]
        },
    )

    assert response.status_code == 422


def test_tenant_isolation_and_atomic_rollback(import_context):
    db = SessionLocal()
    owner = db.query(StaffUser).filter(StaffUser.email.like("%import.local")).first()
    job_id, draft_ids = create_draft_job(db, import_context["restaurant_id"], owner.id, [
        {"item_name": "Valid Item", "price": "100.00"},
        {"item_name": "Failing Item", "price": "200.00"},
    ])
    db.close()

    cross_response = client.post(
        f"/admin/menu-imports/{job_id}/confirm",
        headers=auth(import_context, "other_owner_token"),
        json={"items": []},
    )
    assert cross_response.status_code == 404

    fail_response = client.post(
        f"/admin/menu-imports/{job_id}/confirm",
        headers=auth(import_context),
        json={
            "items": [
                {
                    "draft_item_id": str(draft_ids[0]),
                    "selected": True,
                    "category_name": "Valid Category",
                    "item_name": "Valid Item",
                    "price": 100.00,
                    "food_type": "veg",
                    "option_groups": [],
                },
                {
                    "draft_item_id": str(draft_ids[1]),
                    "selected": True,
                    "category_name": "",
                    "item_name": "Failing Item",
                    "price": 200.00,
                    "food_type": "veg",
                    "option_groups": [],
                },
            ]
        },
    )

    assert fail_response.status_code == 400
    db = SessionLocal()
    assert db.query(MenuItem).filter(MenuItem.restaurant_id == import_context["restaurant_id"]).count() == 0
    db.close()


def test_legacy_variants_backward_compatibility(import_context):
    db = SessionLocal()
    owner = db.query(StaffUser).filter(StaffUser.email.like("%import.local")).first()
    job_id, draft_ids = create_draft_job(db, import_context["restaurant_id"], owner.id, [
        {
            "item_name": "Legacy Pizza",
            "price": "180.00",
            "variants": [{"name": "Small", "price": 180.00}, {"name": "Large", "price": 300.00}],
        }
    ])
    db.close()

    response = client.post(
        f"/admin/menu-imports/{job_id}/confirm",
        headers=auth(import_context),
        json={
            "items": [
                {
                    "draft_item_id": str(draft_ids[0]),
                    "selected": True,
                    "category_name": "Pizzas",
                    "item_name": "Legacy Pizza",
                    "price": 180.00,
                    "food_type": "veg",
                    "option_groups": [],
                    "variants": [{"name": "Small", "price": 180.00}, {"name": "Large", "price": 300.00}],
                }
            ]
        },
    )

    assert response.status_code == 200
    db = SessionLocal()
    item = db.query(MenuItem).filter(MenuItem.name_en == "Legacy Pizza").first()
    assert item is not None
    group = db.query(MenuOptionGroup).filter(MenuOptionGroup.name == "Legacy Pizza size").first()
    assert group is not None
    assert group.type == "variant"
    db.close()


def test_normalize_extraction_payload_empty_group_removal():
    from app.services.menu_extraction import _normalize_extraction_payload
    from app.schemas.menu_import import MenuExtractionResult

    payload = {
        "categories": [
            {
                "name": "Hot Drinks",
                "items": [
                    {
                        "name": "Black Tea",
                        "price": 15.0,
                        "option_groups": [
                            {"name": "Choice", "type": "variant", "options": []}
                        ],
                    }
                ],
            }
        ]
    }

    normalized = _normalize_extraction_payload(payload)
    assert normalized["categories"][0]["items"][0]["option_groups"] == []
    result = MenuExtractionResult.model_validate(normalized)
    assert len(result.categories[0].items[0].option_groups) == 0


def test_normalize_extraction_payload_valid_group_preservation():
    from app.services.menu_extraction import _normalize_extraction_payload
    from app.schemas.menu_import import MenuExtractionResult

    payload = {
        "categories": [
            {
                "name": "Beverages",
                "items": [
                    {
                        "name": "Coffee",
                        "price": 40.0,
                        "option_groups": [
                            {
                                "name": "Sugar Preference",
                                "type": "addon",
                                "required": True,
                                "minimum_selections": 1,
                                "maximum_selections": 1,
                                "options": [
                                    {"name": "With Sugar", "price_delta": 0.0}
                                ],
                            }
                        ],
                    }
                ],
            }
        ]
    }

    normalized = _normalize_extraction_payload(payload)
    result = MenuExtractionResult.model_validate(normalized)
    assert len(result.categories[0].items[0].option_groups) == 1
    assert result.categories[0].items[0].option_groups[0].name == "Sugar Preference"


def test_normalize_extraction_payload_mixed_groups():
    from app.services.menu_extraction import _normalize_extraction_payload
    from app.schemas.menu_import import MenuExtractionResult

    payload = {
        "categories": [
            {
                "name": "Beverages",
                "items": [
                    {
                        "name": "Tea",
                        "price": 20.0,
                        "option_groups": [
                            {"name": "Choice", "type": "variant", "options": []},
                            {
                                "name": "Sugar",
                                "type": "addon",
                                "required": True,
                                "minimum_selections": 1,
                                "maximum_selections": 1,
                                "options": [{"name": "Less Sugar", "price_delta": 0.0}],
                            },
                        ],
                    }
                ],
            }
        ]
    }

    normalized = _normalize_extraction_payload(payload)
    result = MenuExtractionResult.model_validate(normalized)
    assert len(result.categories[0].items[0].option_groups) == 1
    assert result.categories[0].items[0].option_groups[0].name == "Sugar"


def test_normalize_extraction_payload_multiple_affected_items():
    from app.services.menu_extraction import _normalize_extraction_payload
    from app.schemas.menu_import import MenuExtractionResult

    items_payload = [
        {
            "name": f"Item {i}",
            "price": 50.0 + i,
            "option_groups": [
                {"name": "Choice", "type": "variant", "options": []}
            ],
        }
        for i in range(6)
    ]
    payload = {
        "categories": [
            {
                "name": "Main Menu",
                "items": items_payload,
            }
        ]
    }

    normalized = _normalize_extraction_payload(payload)
    result = MenuExtractionResult.model_validate(normalized)
    assert len(result.categories[0].items) == 6
    for item in result.categories[0].items:
        assert len(item.option_groups) == 0


def test_normalize_extraction_payload_unrelated_validation_still_fails():
    from app.services.menu_extraction import _normalize_extraction_payload
    from app.schemas.menu_import import MenuExtractionResult
    from pydantic import ValidationError

    payload = {
        "categories": [
            {
                "name": "Food",
                "items": [
                    {
                        "name": "Invalid Option Item",
                        "price": 100.0,
                        "option_groups": [
                            {
                                "name": "Bad Group",
                                "type": "addon",
                                "options": [
                                    {
                                        "name": "Conflict",
                                        "final_price": 50.0,
                                        "price_delta": 10.0,
                                    }
                                ],
                            }
                        ],
                    }
                ],
            }
        ]
    }

    normalized = _normalize_extraction_payload(payload)
    with pytest.raises(ValidationError):
        MenuExtractionResult.model_validate(normalized)


@pytest.mark.asyncio
async def test_extract_menu_end_to_end_with_mocked_gemini_empty_groups(monkeypatch):
    import json
    from app.config import settings
    from app.services.menu_extraction import extract_menu

    monkeypatch.setattr(settings, "gemini_api_key", "mock_key")
    monkeypatch.setattr(settings, "gemini_model", "mock_model")

    mock_json_response = json.dumps({
        "categories": [
            {
                "name": "Breakfast",
                "items": [
                    {
                        "name": f"Breakfast Item {i}",
                        "price": 100.0,
                        "option_groups": [
                            {"name": "Choice", "type": "variant", "options": []}
                        ],
                    }
                    for i in range(6)
                ],
            }
        ],
        "general_warnings": [],
    })

    class MockModelResponse:
        text = mock_json_response

    class MockModelsService:
        def generate_content(self, **kwargs):
            return MockModelResponse()

    class MockGenAIClient:
        def __init__(self, api_key=None):
            self.models = MockModelsService()

    import google.genai
    monkeypatch.setattr(google.genai, "Client", MockGenAIClient)

    result = await extract_menu([{"mime_type": "image/jpeg", "content": b"fake_image_bytes"}])
    assert len(result.categories[0].items) == 6
    for item in result.categories[0].items:
        assert len(item.option_groups) == 0


def test_normalize_extraction_payload_non_canonical_variant_canonicalization():
    from app.services.menu_extraction import _normalize_extraction_payload
    from app.schemas.menu_import import MenuExtractionResult

    payload = {
        "categories": [
            {
                "name": "Beverages",
                "items": [
                    {
                        "name": "Tea",
                        "price": None,
                        "option_groups": [
                            {
                                "name": "Choice",
                                "type": "variant",
                                "required": False,
                                "minimum_selections": 0,
                                "maximum_selections": 1,
                                "options": [
                                    {"name": "Small", "final_price": 15.0},
                                    {"name": "Large", "final_price": 25.0},
                                ],
                            }
                        ],
                    }
                ],
            }
        ]
    }

    normalized = _normalize_extraction_payload(payload)
    group = normalized["categories"][0]["items"][0]["option_groups"][0]
    assert group["required"] is True
    assert group["minimum_selections"] == 1
    assert group["maximum_selections"] == 1

    result = MenuExtractionResult.model_validate(normalized)
    assert result.categories[0].items[0].option_groups[0].required is True
    assert result.categories[0].items[0].option_groups[0].minimum_selections == 1
    assert result.categories[0].items[0].option_groups[0].maximum_selections == 1


def test_normalize_extraction_payload_canonical_variant_remains_unchanged():
    from app.services.menu_extraction import _normalize_extraction_payload
    from app.schemas.menu_import import MenuExtractionResult

    payload = {
        "categories": [
            {
                "name": "Beverages",
                "items": [
                    {
                        "name": "Coffee",
                        "price": None,
                        "option_groups": [
                            {
                                "name": "Size",
                                "type": "variant",
                                "required": True,
                                "minimum_selections": 1,
                                "maximum_selections": 1,
                                "options": [
                                    {"name": "Regular", "final_price": 40.0},
                                ],
                            }
                        ],
                    }
                ],
            }
        ]
    }

    normalized = _normalize_extraction_payload(payload)
    result = MenuExtractionResult.model_validate(normalized)
    og = result.categories[0].items[0].option_groups[0]
    assert og.required is True
    assert og.minimum_selections == 1
    assert og.maximum_selections == 1


def test_normalize_extraction_payload_optional_addon_remains_unchanged():
    from app.services.menu_extraction import _normalize_extraction_payload
    from app.schemas.menu_import import MenuExtractionResult

    payload = {
        "categories": [
            {
                "name": "Sides",
                "items": [
                    {
                        "name": "Fries",
                        "price": 80.0,
                        "option_groups": [
                            {
                                "name": "Dips",
                                "type": "addon",
                                "required": False,
                                "minimum_selections": 0,
                                "maximum_selections": 1,
                                "options": [
                                    {"name": "Mayo", "price_delta": 20.0},
                                ],
                            }
                        ],
                    }
                ],
            }
        ]
    }

    normalized = _normalize_extraction_payload(payload)
    og = normalized["categories"][0]["items"][0]["option_groups"][0]
    assert og["required"] is False
    assert og["minimum_selections"] == 0
    assert og["maximum_selections"] == 1

    result = MenuExtractionResult.model_validate(normalized)
    assert result.categories[0].items[0].option_groups[0].required is False
    assert result.categories[0].items[0].option_groups[0].minimum_selections == 0


def test_normalize_extraction_payload_mixed_empty_variant_addon():
    from app.services.menu_extraction import _normalize_extraction_payload
    from app.schemas.menu_import import MenuExtractionResult

    payload = {
        "categories": [
            {
                "name": "Food",
                "items": [
                    {
                        "name": "Pizza",
                        "price": 200.0,
                        "option_groups": [
                            {"name": "Empty Placeholder", "type": "variant", "options": []},
                            {
                                "name": "Size Choice",
                                "type": "variant",
                                "required": False,
                                "minimum_selections": 0,
                                "maximum_selections": 1,
                                "options": [{"name": "Medium", "final_price": 200.0}],
                            },
                            {
                                "name": "Extra Cheese",
                                "type": "addon",
                                "required": False,
                                "minimum_selections": 0,
                                "maximum_selections": 1,
                                "options": [{"name": "Add Cheese", "price_delta": 50.0}],
                            },
                        ],
                    }
                ],
            }
        ]
    }

    normalized = _normalize_extraction_payload(payload)
    groups = normalized["categories"][0]["items"][0]["option_groups"]
    assert len(groups) == 2
    assert groups[0]["name"] == "Size Choice"
    assert groups[0]["required"] is True
    assert groups[0]["minimum_selections"] == 1
    assert groups[1]["name"] == "Extra Cheese"
    assert groups[1]["required"] is False
    assert groups[1]["minimum_selections"] == 0

    result = MenuExtractionResult.model_validate(normalized)
    assert len(result.categories[0].items[0].option_groups) == 2


def test_normalize_extraction_payload_multiple_production_failure_items():
    from app.services.menu_extraction import _normalize_extraction_payload
    from app.schemas.menu_import import MenuExtractionResult

    items_payload = [
        {
            "name": f"Item {i}",
            "price": None,
            "option_groups": [
                {
                    "name": "Choice",
                    "type": "variant",
                    "required": False,
                    "minimum_selections": 0,
                    "maximum_selections": 1,
                    "options": [
                        {"name": "Full", "final_price": 100.0 + i},
                        {"name": "Half", "final_price": 60.0 + i},
                    ],
                }
            ],
        }
        for i in range(6)
    ]
    payload = {"categories": [{"name": "Main Menu", "items": items_payload}]}

    normalized = _normalize_extraction_payload(payload)
    result = MenuExtractionResult.model_validate(normalized)
    assert len(result.categories[0].items) == 6
    for item in result.categories[0].items:
        og = item.option_groups[0]
        assert og.required is True
        assert og.minimum_selections == 1
        assert og.maximum_selections == 1


@pytest.mark.asyncio
async def test_extract_menu_end_to_end_with_mocked_gemini_optional_variants(monkeypatch):
    import json
    from app.config import settings
    from app.services.menu_extraction import extract_menu

    monkeypatch.setattr(settings, "gemini_api_key", "mock_key")
    monkeypatch.setattr(settings, "gemini_model", "mock_model")

    mock_json_response = json.dumps({
        "categories": [
            {
                "name": "Meals",
                "items": [
                    {
                        "name": "Biryani",
                        "price": None,
                        "option_groups": [
                            {
                                "name": "Choice",
                                "type": "variant",
                                "required": False,
                                "minimum_selections": 0,
                                "maximum_selections": 1,
                                "options": [
                                    {"name": "Half", "final_price": 150.0},
                                    {"name": "Full", "final_price": 280.0},
                                ],
                            }
                        ],
                    }
                ],
            }
        ],
        "general_warnings": [],
    })

    class MockModelResponse:
        text = mock_json_response

    class MockModelsService:
        def generate_content(self, **kwargs):
            return MockModelResponse()

    class MockGenAIClient:
        def __init__(self, api_key=None):
            self.models = MockModelsService()

    import google.genai
    monkeypatch.setattr(google.genai, "Client", MockGenAIClient)

    result = await extract_menu([{"mime_type": "image/jpeg", "content": b"fake_image_bytes"}])
    og = result.categories[0].items[0].option_groups[0]
    assert og.required is True
    assert og.minimum_selections == 1
    assert og.maximum_selections == 1


def test_schema_validator_independently_rejects_non_canonical_variants_without_normalization():
    from pydantic import ValidationError
    from app.schemas.menu_import import ExtractedMenuOptionGroup

    invalid_variant_payload = {
        "name": "Choice",
        "type": "variant",
        "required": False,
        "minimum_selections": 0,
        "maximum_selections": 1,
        "options": [{"name": "Standard", "final_price": 50.0}],
    }

    with pytest.raises(ValidationError) as excinfo:
        ExtractedMenuOptionGroup.model_validate(invalid_variant_payload)

    assert "Variant option groups must be required" in str(excinfo.value)
