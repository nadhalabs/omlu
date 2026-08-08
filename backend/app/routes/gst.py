from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import Response as FastAPIResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.staff_user import StaffUser
from app.services.gst_exports import (
    build_b2b_register_xlsx,
    build_b2c_register_xlsx,
    build_cancelled_documents_xlsx,
    build_csv_export,
    build_documents_issued_xlsx,
    build_gst_summary_pdf,
    build_gst_summary_xlsx,
    build_hsn_summary_xlsx,
    build_sales_register_xlsx,
    generate_ca_package_zip,
    sanitize_filename,
)
from app.services.gst_data_health import evaluate_gst_data_health
from app.services.gst_reports import (
    get_b2b_register,
    get_b2c_register,
    get_cancelled_documents_register,
    get_documents_issued_audit,
    get_gst_center_summary,
    get_gst_rate_summary,
    get_gst_sales_register,
    get_hsn_summary,
)
from app.utils.auth import RoleChecker


router = APIRouter(prefix="/admin/gst")
_owner_admin = RoleChecker(["owner", "admin"])


@router.get("/summary")
def gst_center_summary(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return get_gst_center_summary(
        db,
        staff=current_user,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/data-health")
def gst_data_health(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return evaluate_gst_data_health(
        db,
        staff=current_user,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/sales-register")
def sales_register(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    document_type: str | None = Query(None),
    customer_tax_type: str | None = Query(None),
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return get_gst_sales_register(
        db,
        staff=current_user,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
        page=page,
        limit=limit,
        document_type=document_type,
        customer_tax_type=customer_tax_type,
    )


@router.get("/rate-summary")
def rate_summary(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return get_gst_rate_summary(
        db,
        staff=current_user,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/hsn-summary")
def hsn_summary(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return get_hsn_summary(
        db,
        staff=current_user,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/b2b-register")
def b2b_register(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return get_b2b_register(
        db,
        staff=current_user,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
        page=page,
        limit=limit,
    )


@router.get("/b2c-register")
def b2c_register(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return get_b2c_register(
        db,
        staff=current_user,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
        page=page,
        limit=limit,
    )


@router.get("/documents-issued")
def documents_issued(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return get_documents_issued_audit(
        db,
        staff=current_user,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/cancelled-documents")
def cancelled_documents(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return get_cancelled_documents_register(
        db,
        staff=current_user,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
        page=page,
        limit=limit,
    )


# ==============================================================================
# EXPORT ENDPOINTS (XLSX, CSV, PDF, CA PACKAGE ZIP)
# ==============================================================================

@router.get("/export/ca-package")
def export_ca_package(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    zip_bytes, filename = generate_ca_package_zip(
        db, staff=current_user, preset=preset, start_date=start_date, end_date=end_date
    )
    return FastAPIResponse(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/sales-register")
def export_sales_register(
    format: str = Query("xlsx"),
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    restaurant = current_user.restaurant
    data = get_gst_sales_register(db, staff=current_user, preset=preset, start_date=start_date, end_date=end_date, page=1, limit=10000)
    slug = sanitize_filename(restaurant.slug or restaurant.name)

    if format.lower() == "csv":
        field_keys = [
            ("invoice_date", "Invoice Date"),
            ("document_number", "Doc #"),
            ("invoice_number", "Invoice #"),
            ("document_type", "Doc Type"),
            ("customer_tax_type", "Tax Type"),
            ("customer_legal_name", "Customer Name"),
            ("customer_gstin", "Customer GSTIN"),
            ("subtotal", "Subtotal"),
            ("discount_amount", "Discount"),
            ("taxable_amount", "Taxable Amount"),
            ("gst_rate", "GST Rate (%)"),
            ("cgst_amount", "CGST"),
            ("sgst_amount", "SGST"),
            ("igst_amount", "IGST"),
            ("tax_amount", "Total Tax"),
            ("total_amount", "Total Amount"),
            ("payment_status", "Payment Status"),
        ]
        csv_str = build_csv_export(data.get("records", []), field_keys)
        return FastAPIResponse(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="sales_register_{slug}.csv"'},
        )

    xlsx_bytes = build_sales_register_xlsx(data, restaurant)
    return FastAPIResponse(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="sales_register_{slug}.xlsx"'},
    )


@router.get("/export/rate-summary")
def export_rate_summary(
    format: str = Query("xlsx"),
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    restaurant = current_user.restaurant
    slug = sanitize_filename(restaurant.slug or restaurant.name)

    if format.lower() == "pdf":
        summary_data = get_gst_center_summary(db, staff=current_user, preset=preset, start_date=start_date, end_date=end_date)
        pdf_bytes = build_gst_summary_pdf(summary_data, restaurant)
        return FastAPIResponse(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="gst_summary_{slug}.pdf"'},
        )

    data = get_gst_rate_summary(db, staff=current_user, preset=preset, start_date=start_date, end_date=end_date)

    if format.lower() == "csv":
        field_keys = [
            ("gst_rate", "GST Rate (%)"),
            ("customer_tax_type", "Customer Tax Type"),
            ("taxable_amount", "Taxable Sales"),
            ("cgst_amount", "CGST Amount"),
            ("sgst_amount", "SGST Amount"),
            ("igst_amount", "IGST Amount"),
            ("total_gst", "Total GST"),
            ("document_count", "Document Count"),
        ]
        csv_str = build_csv_export(data.get("records", []), field_keys)
        return FastAPIResponse(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="gst_rate_summary_{slug}.csv"'},
        )

    xlsx_bytes = build_gst_summary_xlsx(data, restaurant)
    return FastAPIResponse(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="gst_rate_summary_{slug}.xlsx"'},
    )


@router.get("/export/hsn-summary")
def export_hsn_summary(
    format: str = Query("xlsx"),
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    restaurant = current_user.restaurant
    data = get_hsn_summary(db, staff=current_user, preset=preset, start_date=start_date, end_date=end_date)
    slug = sanitize_filename(restaurant.slug or restaurant.name)

    if format.lower() == "csv":
        field_keys = [
            ("hsn_sac_code", "HSN / SAC Code"),
            ("description", "Item Description"),
            ("total_quantity", "Total Quantity"),
            ("line_count", "Line Item Count"),
            ("taxable_amount", "Taxable Amount"),
        ]
        csv_str = build_csv_export(data.get("records", []), field_keys)
        return FastAPIResponse(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="hsn_summary_{slug}.csv"'},
        )

    xlsx_bytes = build_hsn_summary_xlsx(data, restaurant)
    return FastAPIResponse(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="hsn_summary_{slug}.xlsx"'},
    )


@router.get("/export/b2b-register")
def export_b2b_register(
    format: str = Query("xlsx"),
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    restaurant = current_user.restaurant
    data = get_b2b_register(db, staff=current_user, preset=preset, start_date=start_date, end_date=end_date, page=1, limit=10000)
    slug = sanitize_filename(restaurant.slug or restaurant.name)

    if format.lower() == "csv":
        field_keys = [
            ("invoice_date", "Invoice Date"),
            ("invoice_number", "Invoice #"),
            ("customer_gstin", "Customer GSTIN"),
            ("customer_legal_name", "Customer Name"),
            ("subtotal", "Subtotal"),
            ("taxable_amount", "Taxable Amount"),
            ("cgst_amount", "CGST"),
            ("sgst_amount", "SGST"),
            ("igst_amount", "IGST"),
            ("total_amount", "Total Amount"),
        ]
        csv_str = build_csv_export(data.get("records", []), field_keys)
        return FastAPIResponse(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="b2b_register_{slug}.csv"'},
        )

    xlsx_bytes = build_b2b_register_xlsx(data, restaurant)
    return FastAPIResponse(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="b2b_register_{slug}.xlsx"'},
    )


@router.get("/export/b2c-register")
def export_b2c_register(
    format: str = Query("xlsx"),
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    restaurant = current_user.restaurant
    data = get_b2c_register(db, staff=current_user, preset=preset, start_date=start_date, end_date=end_date, page=1, limit=10000)
    slug = sanitize_filename(restaurant.slug or restaurant.name)

    if format.lower() == "csv":
        field_keys = [
            ("invoice_date", "Invoice Date"),
            ("document_number", "Doc #"),
            ("invoice_number", "Invoice #"),
            ("document_type", "Doc Type"),
            ("subtotal", "Subtotal"),
            ("discount_amount", "Discount"),
            ("taxable_amount", "Taxable Amount"),
            ("tax_amount", "Total Tax"),
            ("total_amount", "Total Amount"),
        ]
        csv_str = build_csv_export(data.get("records", []), field_keys)
        return FastAPIResponse(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="b2c_register_{slug}.csv"'},
        )

    xlsx_bytes = build_b2c_register_xlsx(data, restaurant)
    return FastAPIResponse(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="b2c_register_{slug}.xlsx"'},
    )


@router.get("/export/documents-issued")
def export_documents_issued(
    format: str = Query("xlsx"),
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    restaurant = current_user.restaurant
    data = get_documents_issued_audit(db, staff=current_user, preset=preset, start_date=start_date, end_date=end_date)
    slug = sanitize_filename(restaurant.slug or restaurant.name)

    if format.lower() == "csv":
        field_keys = [
            ("invoice_number", "Invoice Number"),
            ("invoice_date", "Invoice Date"),
            ("document_type", "Doc Type"),
            ("document_number", "Doc Number"),
            ("status", "Status"),
        ]
        csv_str = build_csv_export(data.get("records", []), field_keys)
        return FastAPIResponse(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="documents_issued_{slug}.csv"'},
        )

    xlsx_bytes = build_documents_issued_xlsx(data, restaurant)
    return FastAPIResponse(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="documents_issued_{slug}.xlsx"'},
    )


@router.get("/export/cancelled-documents")
def export_cancelled_documents(
    format: str = Query("xlsx"),
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    restaurant = current_user.restaurant
    data = get_cancelled_documents_register(db, staff=current_user, preset=preset, start_date=start_date, end_date=end_date, page=1, limit=10000)
    slug = sanitize_filename(restaurant.slug or restaurant.name)

    if format.lower() == "csv":
        field_keys = [
            ("created_at", "Created Date"),
            ("document_number", "Bill #"),
            ("invoice_number", "Invoice #"),
            ("subtotal", "Subtotal"),
            ("discount_amount", "Discount"),
            ("taxable_amount", "Taxable Amount"),
            ("cgst_amount", "CGST"),
            ("sgst_amount", "SGST"),
            ("igst_amount", "IGST"),
            ("total_amount", "Total Amount"),
            ("cancellation_status", "Cancellation Status"),
        ]
        csv_str = build_csv_export(data.get("records", []), field_keys)
        return FastAPIResponse(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="cancelled_documents_{slug}.csv"'},
        )

    xlsx_bytes = build_cancelled_documents_xlsx(data, restaurant)
    return FastAPIResponse(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="cancelled_documents_{slug}.xlsx"'},
    )
