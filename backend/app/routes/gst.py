from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.staff_user import StaffUser
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
