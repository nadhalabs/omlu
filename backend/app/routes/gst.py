from datetime import date
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.staff_user import StaffUser
from app.services.gst_reports import get_gst_center_summary
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
