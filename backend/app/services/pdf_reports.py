import io
import os
from decimal import Decimal
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.graphics.charts.linecharts import HorizontalLineChart
from reportlab.graphics.shapes import Drawing
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


def _revenue_chart(rows: list[dict[str, Any]]) -> Drawing | None:
    if len(rows) < 2:
        return None
    drawing = Drawing(480, 150)
    chart = HorizontalLineChart()
    chart.x = 48
    chart.y = 30
    chart.width = 410
    chart.height = 100
    chart.data = [[float(Decimal(str(row["revenue"]))) for row in rows]]
    chart.categoryAxis.categoryNames = [row["date"][5:] for row in rows]
    chart.categoryAxis.labels.fontSize = 6
    chart.categoryAxis.labels.angle = 30
    chart.valueAxis.valueMin = 0
    chart.valueAxis.labels.fontSize = 7
    chart.lines[0].strokeColor = colors.HexColor("#ea580c")
    chart.lines[0].strokeWidth = 2
    drawing.add(chart)
    return drawing


def build_performance_pdf(context: dict[str, Any]) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=18 * mm,
        title=context["report"]["title"],
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
        Paragraph(report["title"], styles["Brand"]),
        Paragraph(restaurant.get("name") or "Restaurant", styles["ReportMeta"]),
        Paragraph(f"Selected reporting period: {report['start_date']} to {report['end_date']}", styles["ReportMeta"]),
        Paragraph(f"Generated: {report['generated_at']}", styles["ReportMeta"]),
    ]
    story.append(Table([[header_left, logo or ""]], colWidths=[120 * mm, 38 * mm]))
    story.append(Spacer(1, 8))

    _section(story, styles, "Executive Summary")
    summary_rows = [
        ["Total Revenue", _money(metrics["total_revenue"]), "Collected Revenue", _money(metrics["collected_revenue"])],
        ["Pending Collection", _money(metrics["pending_collection"]), "Total Orders", _number(metrics["total_orders"])],
        ["Average Order Value", _money(metrics["average_order_value"]), "Total Bills", _number(metrics["total_bills"])],
    ]
    story.append(_table(styles, ["Metric", "Value", "Metric", "Value"], summary_rows, [44 * mm, 32 * mm, 48 * mm, 34 * mm]))

    _section(story, styles, "Sales Mix")
    story.append(_table(styles, ["Sale Type", "Revenue", "Contribution"], [[row["label"], _money(row["revenue"]), f"{row['contribution_percentage']}%"] for row in context["sales_mix"]], [58 * mm, 45 * mm, 38 * mm]))

    _section(story, styles, "Revenue Trend")
    chart = _revenue_chart(summary["revenue_by_day"])
    if chart:
        story.append(chart)
        story.append(Spacer(1, 4))
    story.append(_table(styles, ["Date", "Revenue"], [[row["date"], _money(row["revenue"])] for row in summary["revenue_by_day"]], [50 * mm, 40 * mm]))

    _section(story, styles, "Order Health")
    story.append(_table(styles, ["Measure", "Value"], [
        ["Cancelled Orders", "Not tracked"],
        ["Rejected Orders", _number(metrics["rejected_orders"])],
        ["Payment Failures", "Not tracked"],
    ], [70 * mm, 35 * mm]))

    _section(story, styles, "Operations")
    story.append(_table(styles, ["Measure", "Value"], [
        ["Average Table Session", f"{_number(metrics['average_session_duration_minutes'])} min"],
        ["Active Table Time", f"{_number(metrics['active_table_time_minutes'])} min"],
    ], [70 * mm, 35 * mm]))

    _section(story, styles, "Top Performance")
    story.append(_table(styles, ["Top-selling Item", "Quantity Sold", "Revenue"], [[row["item_name"], row["quantity"], _money(row["revenue"])] for row in summary["top_selling_items"][:10]], [78 * mm, 30 * mm, 38 * mm]))

    _section(story, styles, "Owner Insights")
    for insight in context["owner_insights"] or ["No owner insights are available for this period."]:
        story.append(Paragraph(f"• {insight}", styles["TableCell"]))
        story.append(Spacer(1, 3))

    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buffer.getvalue()
