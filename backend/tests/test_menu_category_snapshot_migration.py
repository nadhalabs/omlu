from pathlib import Path

from app.models.order import OrderItem
from app.models.quick_sale import QuickSaleItem


def test_category_snapshot_migration_backfills_both_line_item_tables_and_is_reversible():
    migration = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "d2e3f4a5b6c7_menu_item_category_snapshots.py"
    )
    source = migration.read_text()

    assert 'revision = "d2e3f4a5b6c7"' in source
    assert 'down_revision = "b1c2d3e4f5a7"' in source
    for table in ("order_items", "quick_sale_items"):
        assert f'op.add_column("{table}", sa.Column("category_id_snapshot"' in source
        assert f'op.add_column("{table}", sa.Column("category_name_snapshot"' in source
        assert f"UPDATE {table} AS line" in source
        assert f'op.drop_column("{table}", "category_id_snapshot")' in source
        assert f'op.drop_column("{table}", "category_name_snapshot")' in source
    assert source.count("JOIN menu_categories AS category") == 2
    assert "ForeignKey" not in source


def test_category_snapshot_model_columns_are_nullable_and_informational_only():
    for model in (OrderItem, QuickSaleItem):
        id_column = model.__table__.c.category_id_snapshot
        name_column = model.__table__.c.category_name_snapshot
        assert id_column.nullable is True
        assert name_column.nullable is True
        assert not id_column.foreign_keys
        assert not name_column.foreign_keys
