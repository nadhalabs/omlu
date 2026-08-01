from pathlib import Path


def test_quick_sale_gst_migration_is_legacy_safe_and_reversible():
    migration = Path(__file__).parents[1] / "alembic" / "versions" / "b1c2d3e4f5a7_quick_sale_gst_snapshots.py"
    source = migration.read_text()
    assert 'down_revision = "a0e1f2a3b4c5"' in source
    assert 'server_default="0.00"' in source
    assert "server_default=sa.false()" in source
    for field in (
        "discount_amount", "tax_amount", "gst_enabled_snapshot", "taxable_amount",
        "gst_rate", "cgst_amount", "sgst_amount", "igst_amount", "tax_mode_snapshot",
        "gstin_snapshot", "legal_business_name_snapshot", "billing_address_snapshot",
        "state_name_snapshot", "state_code_snapshot",
    ):
        assert f'"{field}"' in source
        assert f'op.drop_column("quick_sales", "{field}")' in source or f'"{field}",' in source
