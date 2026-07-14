import io
import os
from decimal import Decimal
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _money(value: Any) -> str:
    amount = Decimal(str(value or "0.00")).quantize(Decimal("0.01"))
    return f"INR {amount}"


def _number(value: Any) -> str:
    return str(value if value is not None else 0)


def _paragraph(value: Any, style: ParagraphStyle) -> Paragraph:
    text = "" if value is None else str(value)
    return Paragraph(text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), style)


def _table(styles, headers: list[str], rows: list[list[Any]], col_widths: list[float] | None = None) -> Table:
    body = rows or [["No data available"] + [""] * (len(headers) - 1)]
    data = [[_paragraph(header, styles["TableHeader"]) for header in headers]]
    data.extend([[_paragraph(cell, styles["TableCell"]) for cell in row] for row in body])
    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#27272a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("LEADING", (0, 0), (-1, -1), 10),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d4d4d8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafafa")]),
            ]
        )
    )
    return table


def _section(story: list, styles, title: str) -> None:
    story.append(Spacer(1, 6))
    story.append(Paragraph(title, styles["SectionTitle"]))
    story.append(Spacer(1, 4))


def _maybe_logo(logo_url: str | None) -> Image | None:
    if not logo_url:
        return None
    if logo_url.startswith(("http://", "https://")):
        return None
    path = logo_url
    if logo_url.startswith("/"):
        path = os.path.abspath(logo_url)
    if not os.path.exists(path):
        return None
    try:
        image = Image(path, width=28 * mm, height=18 * mm)
        image.hAlign = "RIGHT"
        return image
    except Exception:
        return None


def _footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#71717a"))
    canvas.drawString(18 * mm, 10 * mm, "OMLU performance report")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Brand", fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=colors.HexColor("#18181b")))
    styles.add(ParagraphStyle(name="ReportMeta", fontName="Helvetica", fontSize=9, leading=12, textColor=colors.HexColor("#52525b")))
    styles.add(ParagraphStyle(name="SectionTitle", fontName="Helvetica-Bold", fontSize=12, leading=16, spaceBefore=5, textColor=colors.HexColor("#18181b")))
    styles.add(ParagraphStyle(name="TableHeader", fontName="Helvetica-Bold", fontSize=8, leading=10, textColor=colors.white))
    styles.add(ParagraphStyle(name="TableCell", fontName="Helvetica", fontSize=8, leading=10, textColor=colors.HexColor("#27272a")))
    styles.add(ParagraphStyle(name="RightCell", parent=styles["TableCell"], alignment=TA_RIGHT))
    return styles


def build_performance_pdf(context: dict[str, Any]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title="OMLU Performance Report",
        author="OMLU",
    )
    styles = _styles()
    story: list = []
    restaurant = context["restaurant"]
    report = context["report"]
    summary = context["summary"]
    metrics = summary["metrics"]

    logo = _maybe_logo(restaurant.get("logo_url"))
    header_left = [
        Paragraph("OMLU", styles["Brand"]),
        Paragraph(restaurant.get("name") or "Restaurant", styles["ReportMeta"]),
        Paragraph(report["type"], styles["ReportMeta"]),
        Paragraph(f"Period: {report['start_date']} to {report['end_date']}", styles["ReportMeta"]),
        Paragraph(f"Timezone: {restaurant.get('timezone') or 'Asia/Kolkata'}", styles["ReportMeta"]),
        Paragraph(f"Generated: {report['generated_at']}", styles["ReportMeta"]),
    ]
    story.append(Table([[header_left, logo or ""]], colWidths=[120 * mm, 38 * mm]))
    story.append(Spacer(1, 8))

    _section(story, styles, "Summary")
    summary_rows = [
        ["Total revenue", _money(metrics["total_revenue"]), "Total orders", _number(metrics["total_orders"])],
        ["Average order value", _money(metrics["average_order_value"]), "Generated bills", _number(metrics["total_bills"])],
        ["Paid bills", _number(metrics["paid_bills"]), "Unpaid bills", _number(metrics["unpaid_bills"])],
        ["Rejected orders", _number(metrics["rejected_orders"]), "Average session duration", f"{_number(metrics['average_session_duration_minutes'])} min"],
    ]
    story.append(_table(styles, ["Metric", "Value", "Metric", "Value"], summary_rows, [44 * mm, 32 * mm, 48 * mm, 34 * mm]))

    _section(story, styles, "Payment Breakdown")
    story.append(
        _table(
            styles,
            ["Method", "Bills", "Amount", "Share"],
            [[row["method"], row["bill_count"], _money(row["amount"]), f"{row['percentage']}%"] for row in context["payment_breakdown"]],
            [46 * mm, 24 * mm, 44 * mm, 28 * mm],
        )
    )

    _section(story, styles, "Revenue By Day")
    story.append(_table(styles, ["Date", "Revenue"], [[row["date"], _money(row["revenue"])] for row in summary["revenue_by_day"]], [50 * mm, 40 * mm]))

    _section(story, styles, "Orders By Day")
    story.append(_table(styles, ["Date", "Orders"], [[row["date"], row["orders"]] for row in summary["orders_by_day"]], [50 * mm, 35 * mm]))

    _section(story, styles, "Sales Performance")
    story.append(_table(styles, ["Top-selling item", "Qty", "Revenue"], [[row["item_name"], row["quantity"], _money(row["revenue"])] for row in summary["top_selling_items"][:10]], [78 * mm, 22 * mm, 38 * mm]))
    story.append(Spacer(1, 6))
    story.append(_table(styles, ["Lowest-selling item", "Qty", "Revenue"], [[row["item_name"], row["quantity"], _money(row["revenue"])] for row in summary["lowest_selling_items"][:10]], [78 * mm, 22 * mm, 38 * mm]))

    _section(story, styles, "Category Performance")
    story.append(_table(styles, ["Category", "Qty", "Revenue"], [[row["category_name"], row["quantity"], _money(row["revenue"])] for row in summary["category_performance"]], [72 * mm, 24 * mm, 42 * mm]))

    _section(story, styles, "Busy Hours")
    story.append(_table(styles, ["Hour", "Orders"], [[f"{row['hour']:02d}:00", row["orders"]] for row in summary["orders_by_hour"]], [40 * mm, 35 * mm]))

    _section(story, styles, "Most-used Tables")
    story.append(_table(styles, ["Table", "Sessions", "Orders", "Revenue"], [[row["table_number"], row["sessions"], row["orders"], _money(row["revenue"])] for row in summary["table_usage"]], [36 * mm, 28 * mm, 28 * mm, 42 * mm]))

    _section(story, styles, "Staff Activity")
    story.append(
        _table(
            styles,
            ["Staff", "Orders", "Requests", "Bills", "Payments", "Opened", "Closed"],
            [
                [
                    row["staff_name"],
                    row["orders_created"],
                    row["requests_resolved"],
                    row["bills_generated"],
                    row["payments_recorded"],
                    row["sessions_opened"],
                    row["sessions_closed"],
                ]
                for row in context["staff_activity_detail"]
            ],
            [45 * mm, 18 * mm, 22 * mm, 18 * mm, 22 * mm, 18 * mm, 18 * mm],
        )
    )

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()
