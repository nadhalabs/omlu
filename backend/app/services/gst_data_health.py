import datetime
from decimal import Decimal
import re
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.models.bill import Bill
from app.models.quick_sale import QuickSale, QuickSaleItem
from app.models.staff_user import StaffUser
from app.services.gst_reports import (
    get_documents_issued_audit,
    resolve_gst_period_bounds,
)

# Standard 15-character Indian GSTIN regex matching OMLU's existing schema validator
GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
SCAN_LIMIT = 10000


def evaluate_gst_data_health(
    db: Session,
    staff: StaffUser,
    preset: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Evaluates data health and reconciliation status for GST documents in a restaurant and period.
    Returns plain-language, non-destructive audit warnings and review items.
    """
    restaurant = staff.restaurant
    start_local, end_local, start_utc, end_utc = resolve_gst_period_bounds(restaurant, preset, start_date, end_date)
    is_gst = bool(restaurant.gst_enabled)
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    period_info = {
        "preset": preset or "today",
        "start_date": start_local.isoformat(),
        "end_date": end_local.isoformat(),
    }

    if not is_gst:
        return {
            "gst_enabled": False,
            "period": period_info,
            "scan_limit": SCAN_LIMIT,
            "scan_limit_reached": False,
            "scan_complete": True,
            "summary": {
                "total_documents_checked": 0,
                "ready_count": 0,
                "warning_count": 0,
                "needs_review_count": 0,
                "summary_text": "0 documents checked · GST Reporting Disabled",
            },
            "note": "GST reporting is disabled for this restaurant. Non-GST transaction sales registers remain available.",
            "issues": [],
            "checked_at": now_iso,
        }

    issues: List[Dict[str, Any]] = []

    # 1. Fetch authoritative final documents with 10,000 scan limit
    bills = (
        db.query(Bill)
        .filter(
            Bill.restaurant_id == restaurant.id,
            Bill.status.in_(["issued", "payment_pending", "paid"]),
            Bill.created_at >= start_utc,
            Bill.created_at < end_utc,
        )
        .limit(SCAN_LIMIT)
        .all()
    )

    qsales = (
        db.query(QuickSale)
        .filter(
            QuickSale.restaurant_id == restaurant.id,
            QuickSale.status == "completed",
            QuickSale.created_at >= start_utc,
            QuickSale.created_at < end_utc,
        )
        .limit(SCAN_LIMIT)
        .all()
    )

    scan_limit_reached = len(bills) >= SCAN_LIMIT or len(qsales) >= SCAN_LIMIT
    scan_complete = not scan_limit_reached

    checked_doc_ids = set()
    affected_doc_ids = set()

    # Track invoice numbers for duplicate detection within FY/prefix namespace
    seen_invoices: Dict[str, Dict[str, Any]] = {}

    supplier_state_code_default = (restaurant.gst_state_code or "").strip()

    # Check Bills
    for b in bills:
        doc_key = f"bill_{b.id}"
        checked_doc_ids.add(doc_key)
        doc_num = b.bill_number or f"Bill #{b.id}"
        inv_num = b.invoice_number
        doc_date = b.invoice_date.isoformat() if b.invoice_date else (b.created_at.isoformat()[:10] if b.created_at else None)

        # Check B: B2B Customer Details
        if b.customer_tax_type == "b2b":
            gstin_snap = (b.customer_gstin_snapshot or "").strip().upper()
            legal_name_snap = (b.customer_legal_name_snapshot or "").strip()

            if not gstin_snap:
                affected_doc_ids.add(doc_key)
                issues.append({
                    "severity": "needs_review",
                    "code": "missing_b2b_gstin",
                    "document_id": doc_key,
                    "document_type": "bill",
                    "document_number": doc_num,
                    "invoice_number": inv_num or "N/A",
                    "document_date": doc_date or "N/A",
                    "explanation": f"Bill {doc_num} is marked B2B but is missing a customer GSTIN snapshot.",
                    "suggested_action": "Review customer tax details for this B2B bill.",
                })
            elif not GSTIN_REGEX.match(gstin_snap):
                affected_doc_ids.add(doc_key)
                issues.append({
                    "severity": "warning",
                    "code": "invalid_b2b_gstin",
                    "document_id": doc_key,
                    "document_type": "bill",
                    "document_number": doc_num,
                    "invoice_number": inv_num or "N/A",
                    "document_date": doc_date or "N/A",
                    "explanation": f"Customer GSTIN format needs review for '{gstin_snap}' on Bill {doc_num}.",
                    "suggested_action": "Verify customer GSTIN format for accuracy.",
                })

            if not legal_name_snap:
                affected_doc_ids.add(doc_key)
                issues.append({
                    "severity": "warning",
                    "code": "missing_b2b_legal_name",
                    "document_id": doc_key,
                    "document_type": "bill",
                    "document_number": doc_num,
                    "invoice_number": inv_num or "N/A",
                    "document_date": doc_date or "N/A",
                    "explanation": f"Bill {doc_num} is marked B2B but is missing a customer legal business name snapshot.",
                    "suggested_action": "Add customer legal business name to customer profile.",
                })

        # Check D1: Missing Official Invoice Number
        if b.gst_enabled_snapshot and not inv_num:
            affected_doc_ids.add(doc_key)
            issues.append({
                "severity": "needs_review",
                "code": "missing_invoice_number",
                "document_id": doc_key,
                "document_type": "bill",
                "document_number": doc_num,
                "invoice_number": "N/A",
                "document_date": doc_date or "N/A",
                "explanation": f"Final GST Bill {doc_num} does not have an official tax invoice number assigned.",
                "suggested_action": "Issue official tax invoice for this final bill.",
            })

        # Check D2: Missing Invoice Date
        if b.gst_enabled_snapshot and not b.invoice_date:
            affected_doc_ids.add(doc_key)
            issues.append({
                "severity": "needs_review",
                "code": "missing_invoice_date",
                "document_id": doc_key,
                "document_type": "bill",
                "document_number": doc_num,
                "invoice_number": inv_num or "N/A",
                "document_date": "N/A",
                "explanation": f"Final GST Bill {doc_num} is missing an official tax invoice date.",
                "suggested_action": "Ensure tax invoice date is recorded upon issuance.",
            })

        # Check D3: Duplicate Invoice Number
        if inv_num:
            if inv_num in seen_invoices:
                affected_doc_ids.add(doc_key)
                prev = seen_invoices[inv_num]
                issues.append({
                    "severity": "needs_review",
                    "code": "duplicate_invoice_number",
                    "document_id": doc_key,
                    "document_type": "bill",
                    "document_number": doc_num,
                    "invoice_number": inv_num,
                    "document_date": doc_date or "N/A",
                    "explanation": f"Duplicate invoice number '{inv_num}' detected (also used on {prev['document_type']} {prev['document_number']}).",
                    "suggested_action": "Investigate invoice sequence allocation for duplicate numbering.",
                })
            else:
                seen_invoices[inv_num] = {
                    "document_type": "bill",
                    "document_number": doc_num,
                }

        # Check E: Tax Reconciliation
        subtotal = b.subtotal or Decimal("0.00")
        discount = b.discount_amount or Decimal("0.00")
        taxable = b.taxable_amount or Decimal("0.00")
        cgst = b.cgst_amount or Decimal("0.00")
        sgst = b.sgst_amount or Decimal("0.00")
        igst = b.igst_amount or Decimal("0.00")
        tax_total = b.tax_amount or Decimal("0.00")
        total = b.total_amount or Decimal("0.00")

        comp_sum = cgst + sgst + igst
        if abs(comp_sum - tax_total) > Decimal("0.02"):
            affected_doc_ids.add(doc_key)
            issues.append({
                "severity": "needs_review",
                "code": "tax_component_mismatch",
                "document_id": doc_key,
                "document_type": "bill",
                "document_number": doc_num,
                "invoice_number": inv_num or "N/A",
                "document_date": doc_date or "N/A",
                "explanation": f"Sum of tax components (CGST: {cgst}, SGST: {sgst}, IGST: {igst}) does not match stored tax total ({tax_total}).",
                "suggested_action": "Review tax calculation components on this document.",
            })

        if b.gst_enabled_snapshot:
            expected_total = taxable + tax_total
            if abs(expected_total - total) > Decimal("0.02"):
                affected_doc_ids.add(doc_key)
                issues.append({
                    "severity": "needs_review",
                    "code": "total_reconciliation_mismatch",
                    "document_id": doc_key,
                    "document_type": "bill",
                    "document_number": doc_num,
                    "invoice_number": inv_num or "N/A",
                    "document_date": doc_date or "N/A",
                    "explanation": f"Taxable amount ({taxable}) plus total tax ({tax_total}) equals {expected_total}, which differs from document total ({total}).",
                    "suggested_action": "Reconcile header subtotal, discount, and tax additions.",
                })

        # Check F: Impossible / Negative values
        if any(v < Decimal("0.00") for v in [subtotal, taxable, cgst, sgst, igst, tax_total, total]):
            affected_doc_ids.add(doc_key)
            issues.append({
                "severity": "needs_review",
                "code": "negative_value_detected",
                "document_id": doc_key,
                "document_type": "bill",
                "document_number": doc_num,
                "invoice_number": inv_num or "N/A",
                "document_date": doc_date or "N/A",
                "explanation": f"Bill {doc_num} contains negative monetary values which are not supported.",
                "suggested_action": "Review transaction values for negative line amounts.",
            })

        # Check G: Place of Supply / Tax Mode Consistency (Intrastate vs Interstate)
        supplier_code = (b.state_code_snapshot or supplier_state_code_default).strip()
        customer_pos_code = (
            b.place_of_supply_code_snapshot
            or b.customer_state_code_snapshot
            or (b.customer_gstin_snapshot[:2] if b.customer_gstin_snapshot and len(b.customer_gstin_snapshot) >= 2 else None)
        )

        if supplier_code and customer_pos_code:
            customer_pos_code = customer_pos_code.strip()
            is_intrastate = supplier_code == customer_pos_code
            if is_intrastate:
                if igst > Decimal("0.00") and (cgst == Decimal("0.00") or sgst == Decimal("0.00")):
                    affected_doc_ids.add(doc_key)
                    issues.append({
                        "severity": "needs_review",
                        "code": "intrastate_tax_mismatch",
                        "document_id": doc_key,
                        "document_type": "bill",
                        "document_number": doc_num,
                        "invoice_number": inv_num or "N/A",
                        "document_date": doc_date or "N/A",
                        "explanation": f"Stored tax components (IGST: {igst}) do not match transaction's frozen place-of-supply state data ({customer_pos_code} intrastate).",
                        "suggested_action": "Verify place of supply and tax jurisdiction components.",
                    })
            else:
                if (cgst > Decimal("0.00") or sgst > Decimal("0.00")) and igst == Decimal("0.00"):
                    affected_doc_ids.add(doc_key)
                    issues.append({
                        "severity": "needs_review",
                        "code": "interstate_tax_mismatch",
                        "document_id": doc_key,
                        "document_type": "bill",
                        "document_number": doc_num,
                        "invoice_number": inv_num or "N/A",
                        "document_date": doc_date or "N/A",
                        "explanation": f"Stored tax components (CGST: {cgst}, SGST: {sgst}) do not match transaction's frozen place-of-supply state data ({customer_pos_code} interstate).",
                        "suggested_action": "Verify place of supply and tax jurisdiction components.",
                    })

    # Check Quick Sales
    for q in qsales:
        doc_key = f"qs_{q.id}"
        checked_doc_ids.add(doc_key)
        doc_num = q.order_number or f"Quick Sale #{q.id}"
        inv_num = q.invoice_number
        doc_date = q.invoice_date.isoformat() if q.invoice_date else (q.created_at.isoformat()[:10] if q.created_at else None)

        # Check B: B2B Customer Details
        if q.customer_tax_type == "b2b":
            gstin_snap = (q.customer_gstin_snapshot or "").strip().upper()
            legal_name_snap = (q.customer_legal_name_snapshot or "").strip()

            if not gstin_snap:
                affected_doc_ids.add(doc_key)
                issues.append({
                    "severity": "needs_review",
                    "code": "missing_b2b_gstin",
                    "document_id": doc_key,
                    "document_type": "quick_sale",
                    "document_number": doc_num,
                    "invoice_number": inv_num or "N/A",
                    "document_date": doc_date or "N/A",
                    "explanation": f"Quick Sale {doc_num} is marked B2B but is missing a customer GSTIN snapshot.",
                    "suggested_action": "Review customer tax details for this B2B quick sale.",
                })
            elif not GSTIN_REGEX.match(gstin_snap):
                affected_doc_ids.add(doc_key)
                issues.append({
                    "severity": "warning",
                    "code": "invalid_b2b_gstin",
                    "document_id": doc_key,
                    "document_type": "quick_sale",
                    "document_number": doc_num,
                    "invoice_number": inv_num or "N/A",
                    "document_date": doc_date or "N/A",
                    "explanation": f"Customer GSTIN format needs review for '{gstin_snap}' on Quick Sale {doc_num}.",
                    "suggested_action": "Verify customer GSTIN format for accuracy.",
                })

            if not legal_name_snap:
                affected_doc_ids.add(doc_key)
                issues.append({
                    "severity": "warning",
                    "code": "missing_b2b_legal_name",
                    "document_id": doc_key,
                    "document_type": "quick_sale",
                    "document_number": doc_num,
                    "invoice_number": inv_num or "N/A",
                    "document_date": doc_date or "N/A",
                    "explanation": f"Quick Sale {doc_num} is marked B2B but is missing a customer legal business name snapshot.",
                    "suggested_action": "Add customer legal business name to quick sale record.",
                })

        # Check C: HSN/SAC line snapshots
        items = db.query(QuickSaleItem).filter(QuickSaleItem.quick_sale_id == q.id).all()
        missing_hsn_items = [item.item_name for item in items if not item.hsn_sac_code_snapshot]
        if missing_hsn_items:
            affected_doc_ids.add(doc_key)
            issues.append({
                "severity": "warning",
                "code": "missing_hsn_snapshot",
                "document_id": doc_key,
                "document_type": "quick_sale",
                "document_number": doc_num,
                "invoice_number": inv_num or "N/A",
                "document_date": doc_date or "N/A",
                "explanation": f"Quick Sale {doc_num} contains item(s) ({', '.join(missing_hsn_items[:3])}) without a stored HSN/SAC snapshot.",
                "suggested_action": "Ensure menu items have HSN/SAC codes configured before sales.",
            })

        # Check D1: Missing Invoice Number
        if q.gst_enabled_snapshot and not inv_num:
            affected_doc_ids.add(doc_key)
            issues.append({
                "severity": "needs_review",
                "code": "missing_invoice_number",
                "document_id": doc_key,
                "document_type": "quick_sale",
                "document_number": doc_num,
                "invoice_number": "N/A",
                "document_date": doc_date or "N/A",
                "explanation": f"Completed GST Quick Sale {doc_num} does not have an official tax invoice number assigned.",
                "suggested_action": "Issue official tax invoice for this quick sale.",
            })

        # Check D2: Missing Invoice Date
        if q.gst_enabled_snapshot and not q.invoice_date:
            affected_doc_ids.add(doc_key)
            issues.append({
                "severity": "needs_review",
                "code": "missing_invoice_date",
                "document_id": doc_key,
                "document_type": "quick_sale",
                "document_number": doc_num,
                "invoice_number": inv_num or "N/A",
                "document_date": "N/A",
                "explanation": f"Completed GST Quick Sale {doc_num} is missing an official tax invoice date.",
                "suggested_action": "Ensure tax invoice date is recorded upon completion.",
            })

        # Check D3: Duplicate Invoice Number
        if inv_num:
            if inv_num in seen_invoices:
                affected_doc_ids.add(doc_key)
                prev = seen_invoices[inv_num]
                issues.append({
                    "severity": "needs_review",
                    "code": "duplicate_invoice_number",
                    "document_id": doc_key,
                    "document_type": "quick_sale",
                    "document_number": doc_num,
                    "invoice_number": inv_num,
                    "document_date": doc_date or "N/A",
                    "explanation": f"Duplicate invoice number '{inv_num}' detected (also used on {prev['document_type']} {prev['document_number']}).",
                    "suggested_action": "Investigate invoice sequence allocation for duplicate numbering.",
                })
            else:
                seen_invoices[inv_num] = {
                    "document_type": "quick_sale",
                    "document_number": doc_num,
                }

        # Check E: Tax Reconciliation
        subtotal = q.subtotal or Decimal("0.00")
        discount = q.discount_amount or Decimal("0.00")
        taxable = q.taxable_amount or Decimal("0.00")
        cgst = q.cgst_amount or Decimal("0.00")
        sgst = q.sgst_amount or Decimal("0.00")
        igst = q.igst_amount or Decimal("0.00")
        tax_total = q.tax_amount or Decimal("0.00")
        total = q.total_amount or Decimal("0.00")

        comp_sum = cgst + sgst + igst
        if abs(comp_sum - tax_total) > Decimal("0.02"):
            affected_doc_ids.add(doc_key)
            issues.append({
                "severity": "needs_review",
                "code": "tax_component_mismatch",
                "document_id": doc_key,
                "document_type": "quick_sale",
                "document_number": doc_num,
                "invoice_number": inv_num or "N/A",
                "document_date": doc_date or "N/A",
                "explanation": f"Sum of tax components (CGST: {cgst}, SGST: {sgst}, IGST: {igst}) does not match stored tax total ({tax_total}).",
                "suggested_action": "Review tax calculation components on this document.",
            })

        expected_total = taxable + tax_total
        if abs(expected_total - total) > Decimal("0.02"):
            affected_doc_ids.add(doc_key)
            issues.append({
                "severity": "needs_review",
                "code": "total_reconciliation_mismatch",
                "document_id": doc_key,
                "document_type": "quick_sale",
                "document_number": doc_num,
                "invoice_number": inv_num or "N/A",
                "document_date": doc_date or "N/A",
                "explanation": f"Taxable amount ({taxable}) plus total tax ({tax_total}) equals {expected_total}, which differs from document total ({total}).",
                "suggested_action": "Reconcile header subtotal, discount, and tax additions.",
            })

        # Check F: Impossible / Negative values
        if any(v < Decimal("0.00") for v in [subtotal, taxable, cgst, sgst, igst, tax_total, total]):
            affected_doc_ids.add(doc_key)
            issues.append({
                "severity": "needs_review",
                "code": "negative_value_detected",
                "document_id": doc_key,
                "document_type": "quick_sale",
                "document_number": doc_num,
                "invoice_number": inv_num or "N/A",
                "document_date": doc_date or "N/A",
                "explanation": f"Quick Sale {doc_num} contains negative monetary values which are not supported.",
                "suggested_action": "Review transaction values for negative line amounts.",
            })

        # Check G: Place of Supply / Tax Mode Consistency (Intrastate vs Interstate)
        supplier_code = (q.state_code_snapshot or supplier_state_code_default).strip()
        customer_pos_code = (
            q.place_of_supply_code_snapshot
            or q.customer_state_code_snapshot
            or (q.customer_gstin_snapshot[:2] if q.customer_gstin_snapshot and len(q.customer_gstin_snapshot) >= 2 else None)
        )

        if supplier_code and customer_pos_code:
            customer_pos_code = customer_pos_code.strip()
            is_intrastate = supplier_code == customer_pos_code
            if is_intrastate:
                if igst > Decimal("0.00") and (cgst == Decimal("0.00") or sgst == Decimal("0.00")):
                    affected_doc_ids.add(doc_key)
                    issues.append({
                        "severity": "needs_review",
                        "code": "intrastate_tax_mismatch",
                        "document_id": doc_key,
                        "document_type": "quick_sale",
                        "document_number": doc_num,
                        "invoice_number": inv_num or "N/A",
                        "document_date": doc_date or "N/A",
                        "explanation": f"Stored tax components (IGST: {igst}) do not match transaction's frozen place-of-supply state data ({customer_pos_code} intrastate).",
                        "suggested_action": "Verify place of supply and tax jurisdiction components.",
                    })
            else:
                if (cgst > Decimal("0.00") or sgst > Decimal("0.00")) and igst == Decimal("0.00"):
                    affected_doc_ids.add(doc_key)
                    issues.append({
                        "severity": "needs_review",
                        "code": "interstate_tax_mismatch",
                        "document_id": doc_key,
                        "document_type": "quick_sale",
                        "document_number": doc_num,
                        "invoice_number": inv_num or "N/A",
                        "document_date": doc_date or "N/A",
                        "explanation": f"Stored tax components (CGST: {cgst}, SGST: {sgst}) do not match transaction's frozen place-of-supply state data ({customer_pos_code} interstate).",
                        "suggested_action": "Verify place of supply and tax jurisdiction components.",
                    })

    # Check Sequence Gaps using Phase 3 sequence parser
    audit_data = get_documents_issued_audit(db, staff, preset, start_date, end_date)
    seq_gaps = audit_data.get("audit", {}).get("sequence_gaps", [])
    for gap in seq_gaps:
        issues.append({
            "severity": "needs_review",
            "code": "invoice_sequence_gap",
            "document_id": "sequence_audit",
            "document_type": "sequence",
            "document_number": f"{gap.get('prefix', '')}{gap.get('gap_from', '')}",
            "invoice_number": f"{gap.get('gap_from', '')} to {gap.get('gap_to', '')}",
            "document_date": start_local.isoformat(),
            "explanation": f"Missing contiguous invoice sequence range from {gap.get('gap_from')} to {gap.get('gap_to')} ({gap.get('missing_count')} invoice(s)). This may be expected in some operational cases.",
            "suggested_action": "Review operational invoice log for missing numbers.",
        })

    # Tally overall summary ensuring affected documents are not counted as ready
    total_docs = len(checked_doc_ids)
    affected_count = len(affected_doc_ids)
    ready_count = max(0, total_docs - affected_count)

    warning_count = sum(1 for iss in issues if iss["severity"] == "warning")
    needs_review_count = sum(1 for iss in issues if iss["severity"] == "needs_review")

    if scan_limit_reached:
        summary_text = (
            f"{ready_count:,} documents ready (Scan Limit Reached · Partial Evaluation) · "
            f"{warning_count} warning{'s' if warning_count != 1 else ''} · "
            f"{needs_review_count} needs review — Narrow date filter for complete audit"
        )
    else:
        summary_text = (
            f"{ready_count:,} documents ready · "
            f"{warning_count} warning{'s' if warning_count != 1 else ''} · "
            f"{needs_review_count} needs review"
        )

    res_dict = {
        "gst_enabled": True,
        "period": period_info,
        "scan_limit": SCAN_LIMIT,
        "scan_limit_reached": scan_limit_reached,
        "scan_complete": scan_complete,
        "summary": {
            "total_documents_checked": total_docs,
            "ready_count": ready_count,
            "warning_count": warning_count,
            "needs_review_count": needs_review_count,
            "summary_text": summary_text,
        },
        "issues": issues,
        "checked_at": now_iso,
    }

    if scan_limit_reached:
        res_dict["scan_warning"] = (
            f"Audit scan limit reached ({SCAN_LIMIT:,} documents). "
            "Results represent a partial period assessment. Narrow date filter for full evaluation."
        )

    return res_dict
