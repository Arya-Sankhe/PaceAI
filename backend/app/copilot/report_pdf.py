"""Renders the shift report as a designed A4 PDF (ReportLab, no external assets)."""

from __future__ import annotations

from datetime import datetime
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.graphics.shapes import Circle, Drawing, Line, PolyLine, Rect, String, Wedge
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, PageBreak, PageTemplate,
                                Paragraph, Spacer, Table, TableStyle)

W, H = A4
MARGIN = 16 * mm
CW = W - 2 * MARGIN  # content width

INK = colors.HexColor("#0f172a")
MUTED = colors.HexColor("#64748b")
FAINT = colors.HexColor("#e2e8f0")
PANEL = colors.HexColor("#f8fafc")
NAVY = colors.HexColor("#0b1120")
GREEN = colors.HexColor("#10b981")
AMBER = colors.HexColor("#f59e0b")
RED = colors.HexColor("#ef4444")
BLUE = colors.HexColor("#6366f1")
ZONE_COLORS = [colors.HexColor(c) for c in ("#6366f1", "#10b981", "#f59e0b", "#ec4899")]
IMPACT = {"high": RED, "medium": AMBER, "low": GREEN}


def _st(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=INK, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, **base)


BODY = _st("body")
SMALL = _st("small", fontSize=8, leading=11, textColor=MUTED)
H2 = _st("h2", fontName="Helvetica-Bold", fontSize=13, leading=16, spaceBefore=4, spaceAfter=6)
LABEL = _st("label", fontName="Helvetica-Bold", fontSize=7, leading=9, textColor=MUTED)
BIG = _st("big", fontName="Helvetica-Bold", fontSize=19, leading=22)
LEAD = _st("lead", fontName="Helvetica-Bold", fontSize=14.5, leading=19)


def P(text, style=BODY):
    return Paragraph(escape(str(text)), style)


def num(x, d=1, unit=""):
    return "—" if x is None else f"{x:,.{d}f}{unit}"


def tone(oee):
    return GREEN if oee is not None and oee >= 85 else AMBER if oee is not None and oee >= 65 else RED


def _fmt_dt(iso: str) -> str:
    return datetime.fromisoformat(iso).astimezone().strftime("%d %b %Y, %H:%M")


def _hm(hours: float) -> str:
    m = int(round(hours * 60))
    return f"{m // 60}h {m % 60:02d}m"


# ── graphics ──────────────────────────────────────────────────────────────────

def donut(value, size=118):
    d = Drawing(size, size)
    c, r = size / 2, size / 2 - 2
    d.add(Wedge(c, c, r, 0, 360, radius1=r - 15, fillColor=FAINT, strokeColor=None))
    if value:
        pct = max(0.5, min(100, value)) / 100
        d.add(Wedge(c, c, r, 90 - 360 * pct, 90, radius1=r - 15, fillColor=tone(value), strokeColor=None))
    d.add(String(c, c - 4, "—" if value is None else f"{value:.1f}", fontName="Helvetica-Bold", fontSize=25,
                 fillColor=INK, textAnchor="middle"))
    d.add(String(c, c - 18, "OEE  %", fontName="Helvetica-Bold", fontSize=7, fillColor=MUTED, textAnchor="middle"))
    return d


def hbar(items, width, colr, max_v=None, row=17, label_w=None):
    """Horizontal bars: items = [(label, value, value_text)]."""
    if not items:
        return None
    label_w = width * 0.42 if label_w is None else label_w
    d = Drawing(width, row * len(items))
    peak = max_v or max(v for _, v, _ in items) or 1
    for i, (label, v, txt) in enumerate(items):
        y = row * (len(items) - 1 - i) + 4
        d.add(String(0, y + 2, label[:34] + ("…" if len(label) > 34 else ""), fontName="Helvetica", fontSize=8, fillColor=INK))
        bw = width - label_w - 36
        d.add(Rect(label_w, y, bw, 7, rx=3.5, ry=3.5, fillColor=FAINT, strokeColor=None))
        d.add(Rect(label_w, y, max(3, bw * min(1, v / peak)), 7, rx=3.5, ry=3.5, fillColor=colr, strokeColor=None))
        d.add(String(width, y + 1, txt, fontName="Helvetica-Bold", fontSize=8, fillColor=INK, textAnchor="end"))
    return d


def waterfall(f, width):
    """100% → availability → performance → quality → OEE, each step a bar."""
    L = f["losses"]
    if not L or f["oee"] is None:
        return None
    steps = [("Planned time", 100.0, BLUE, None), ("Availability loss", L["availability"], RED, "-"),
             ("Performance loss", L["performance"], AMBER, "-"), ("Quality loss", L["quality"], colors.HexColor("#ec4899"), "-"),
             ("OEE", f["oee"], tone(f["oee"]), None)]
    h = 92
    d = Drawing(width, h)
    n = len(steps)
    gap = 10
    bw = (width - gap * (n - 1)) / n
    base, top = 18, h - 16
    scale = (top - base) / 100
    running = 100.0
    for i, (name, v, colr, sign) in enumerate(steps):
        x = i * (bw + gap)
        if sign:  # floating loss bar, hanging from the running total
            y0, hh = base + (running - v) * scale, v * scale
            running -= v
        else:
            y0, hh = base, v * scale
        d.add(Rect(x, y0, bw, max(hh, 3), rx=3, ry=3, fillColor=colr, strokeColor=None))
        d.add(String(x + bw / 2, y0 + max(hh, 3) + 3, ("-" if sign else "") + f"{v:.1f}", fontName="Helvetica-Bold",
                     fontSize=8.5, fillColor=INK, textAnchor="middle"))
        d.add(String(x + bw / 2, 5, name, fontName="Helvetica", fontSize=7.3, fillColor=MUTED, textAnchor="middle"))
    d.add(Line(0, base, width, base, strokeColor=FAINT, strokeWidth=0.8))
    return d


def trend(zones, width, height=120):
    series = [z for z in zones if len(z["series"]) > 1]
    if not series:
        return None
    lo = min(min(z["series"]) for z in series)
    hi = max(max(z["series"]) for z in series)
    for z in series:
        if z["setpoint"] is not None:
            lo, hi = min(lo, z["setpoint"]), max(hi, z["setpoint"])
    pad = max((hi - lo) * 0.12, 1.0)
    lo, hi = lo - pad, hi + pad
    d = Drawing(width, height)
    x0, y0, pw, ph = 30, 16, width - 36, height - 24
    for i in range(5):
        y = y0 + ph * i / 4
        d.add(Line(x0, y, x0 + pw, y, strokeColor=FAINT, strokeWidth=0.5))
        d.add(String(x0 - 4, y - 2.5, f"{lo + (hi - lo) * i / 4:.0f}", fontName="Helvetica", fontSize=6.5,
                     fillColor=MUTED, textAnchor="end"))
    for idx, z in enumerate(zones):
        colr = ZONE_COLORS[idx % 4]
        if z["setpoint"] is not None:
            y = y0 + ph * (z["setpoint"] - lo) / (hi - lo)
            d.add(Line(x0, y, x0 + pw, y, strokeColor=colr, strokeWidth=0.6, strokeDashArray=[2, 3]))
        s = z["series"]
        if len(s) > 1:
            pts = []
            for i, t in enumerate(s):
                pts += [x0 + pw * i / (len(s) - 1), y0 + ph * (t - lo) / (hi - lo)]
            d.add(PolyLine(pts, strokeColor=colr, strokeWidth=1.4, strokeLineJoin=1))
    lx = x0
    for idx, z in enumerate(zones):
        d.add(Rect(lx, 2, 8, 4, fillColor=ZONE_COLORS[idx % 4], strokeColor=None))
        d.add(String(lx + 11, 2, z["label"], fontName="Helvetica", fontSize=7, fillColor=MUTED))
        lx += 95
    return d


def pill(text, colr, w=44):
    d = Drawing(w, 13)
    d.add(Rect(0, 0, w, 13, rx=6.5, ry=6.5, fillColor=colr, strokeColor=None))
    d.add(String(w / 2, 4, text.upper(), fontName="Helvetica-Bold", fontSize=6.5, fillColor=colors.white, textAnchor="middle"))
    return d


# ── page furniture ────────────────────────────────────────────────────────────

def _on_page(f):
    def draw(c, doc):
        c.saveState()
        if doc.page == 1:
            c.setFillColor(NAVY)
            c.rect(0, H - 46 * mm, W, 46 * mm, stroke=0, fill=1)
            c.setFillColor(BLUE)
            c.rect(0, H - 46 * mm, W, 1.4 * mm, stroke=0, fill=1)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(MARGIN, H - 14 * mm, "PACEAI  ORION")
            c.setFont("Helvetica-Bold", 25)
            c.drawString(MARGIN, H - 27 * mm, "Shift Report")
            c.setFont("Helvetica", 10.5)
            c.setFillColor(colors.HexColor("#cbd5e1"))
            c.drawString(MARGIN, H - 35 * mm, f"{f['machine']}   |   {_fmt_dt(f['since'])}  to  {_fmt_dt(f['until'])}   |   {_hm(f['hours'])}")
            c.setFont("Helvetica", 8)
            c.drawRightString(W - MARGIN, H - 14 * mm, f"Generated {_fmt_dt(f['generated_at'])}")
        else:
            c.setFillColor(NAVY)
            c.rect(0, H - 11 * mm, W, 11 * mm, stroke=0, fill=1)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(MARGIN, H - 7 * mm, f"PACEAI ORION  |  Shift Report  |  {f['machine']}")
        c.setStrokeColor(FAINT)
        c.line(MARGIN, 12 * mm, W - MARGIN, 12 * mm)
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7.5)
        src = "live PLC data (read-only)" if f["source"] == "plc" else "demo data"
        c.drawString(MARGIN, 8 * mm, f"Built from {src}. Figures are from the machine; the assessment is AI-written from those figures.")
        c.drawRightString(W - MARGIN, 8 * mm, f"Page {doc.page}")
        c.restoreState()
    return draw


def section(title, sub=None):
    parts = [Paragraph(escape(title), H2)]
    if sub:
        parts.append(P(sub, SMALL))
        parts.append(Spacer(1, 3))
    return parts


def tile(label, value, sub="", colr=INK, size=17):
    return [P(label.upper(), LABEL), Paragraph(escape(value), _st("tv", fontName="Helvetica-Bold", fontSize=size, leading=21, textColor=colr)),
            P(sub, SMALL)]


def tiles_row(cells):
    n = len(cells)
    t = Table([cells], colWidths=[CW / n] * n)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL), ("BOX", (0, 0), (-1, -1), 0.6, FAINT),
        ("LINEAFTER", (0, 0), (-2, -1), 0.6, FAINT), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    return t


def apq_bars(f, width):
    rows = [("Availability", f["availability"]), ("Performance", f["performance"]), ("Quality", f["quality"])]
    d = Drawing(width, 60)
    for i, (name, v) in enumerate(rows):
        y = 60 - 18 * (i + 1) + 6
        d.add(String(0, y + 8, name, fontName="Helvetica-Bold", fontSize=7.5, fillColor=MUTED))
        d.add(String(width, y + 8, "—" if v is None else f"{v:.1f}%", fontName="Helvetica-Bold", fontSize=8.5, fillColor=INK, textAnchor="end"))
        d.add(Rect(0, y - 1, width, 5, rx=2.5, ry=2.5, fillColor=FAINT, strokeColor=None))
        if v:
            d.add(Rect(0, y - 1, max(3, width * min(v, 100) / 100), 5, rx=2.5, ry=2.5, fillColor=tone(v), strokeColor=None))
    return d


def build(f: dict, story_ai: dict) -> bytes:
    buf = BytesIO()
    doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=16 * mm, bottomMargin=18 * mm,
                          title=f"Shift Report - {f['machine']}", author="PaceAI Orion")
    first = Frame(MARGIN, 18 * mm, CW, H - 46 * mm - 18 * mm - 6 * mm, id="first", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    later = Frame(MARGIN, 18 * mm, CW, H - 11 * mm - 18 * mm - 6 * mm, id="later", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    draw = _on_page(f)
    doc.addPageTemplates([PageTemplate(id="first", frames=[first], onPage=draw, autoNextPageTemplate="later"),
                          PageTemplate(id="later", frames=[later], onPage=draw)])
    s = []

    if not f["connected"]:
        warn = Table([[P(f"Machine offline: these figures are the last reading received ({_fmt_dt(f['last_data']) if f['last_data'] else 'no data'}).",
                         _st("w", textColor=colors.HexColor("#92400e"), fontSize=8.5))]], colWidths=[CW])
        warn.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fef3c7")), ("BOX", (0, 0), (-1, -1), 0.6, AMBER),
                                  ("LEFTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
        s += [warn, Spacer(1, 8)]

    # Hero: OEE donut, the one-sentence verdict, and the three OEE factors.
    verdict = [Paragraph(escape(story_ai["headline"]), LEAD), Spacer(1, 4), P(story_ai["summary"], BODY)]
    hero = Table([[donut(f["oee"]), verdict, apq_bars(f, 118)]], colWidths=[128, CW - 128 - 130, 130])
    hero.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                              ("RIGHTPADDING", (1, 0), (1, 0), 14)]))
    s += [hero, Spacer(1, 10)]

    rating = {"world-class": "World-class (85%+)", "typical": "Typical (65-85%)", "needs work": "Below typical (<65%)"}.get(f["rating"], "—")
    s.append(tiles_row([
        tile("Good bags", num(f["good"], 0), f"of {num(f['total'], 0)} made"),
        tile("Rejected", num(f["bad"], 0), f"{num(f['scrap_pct'], 1, '%')} scrap", RED if (f["scrap_pct"] or 0) > 3 else INK),
        tile("Avg speed", num(f["avg_speed"] or f["actual_speed"], 0), f"of {num(f['set_speed'], 0)} ppm set"),
        tile("Unplanned stops", str(f["unplanned_stops"]), "logged this period", RED if f["unplanned_stops"] else INK),
        tile("Rating", rating.split(" (")[0], rating.split(" (")[-1].rstrip(")") if " (" in rating else "", tone(f["oee"]), 13),
    ]))
    s.append(Spacer(1, 12))

    w = waterfall(f, CW)
    if w:
        s += section("Where the shift went", "From 100% of planned time to what actually left the line, in OEE points.")
        s += [w, Spacer(1, 8)]

    # Went well / watch, side by side.
    def bullets(items, colr, empty):
        rows = [[_dot(colr), P(t, BODY)] for t in items] or \
               [[_dot(FAINT), P(empty, SMALL)]]
        t = Table(rows, colWidths=[10, None])
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                               ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("TOPPADDING", (0, 0), (-1, -1), 1)]))
        return t
    half = (CW - 12) / 2
    for_col = lambda title, body: [[Paragraph(escape(title), _st("ct", fontName="Helvetica-Bold", fontSize=10.5, leading=14)), ], [body]]
    left = Table(for_col("What went well", bullets(story_ai["went_well"], GREEN, "Nothing stood out this shift.")), colWidths=[half])
    right = Table(for_col("What to watch", bullets(story_ai["watch"], RED, "No problems recorded.")), colWidths=[half])
    for t in (left, right):
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PANEL), ("BOX", (0, 0), (-1, -1), 0.6, FAINT),
                               ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                               ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    two = Table([[left, right]], colWidths=[half + 6, half + 6])
    two.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 6)]))
    s += [two, PageBreak()]

    # Breakdowns.
    dt_head = section("Downtime breakdown", "Stop counts by reason as logged by the machine.")
    un = [(r["reason"], r["count"], f"{r['count']}x") for r in f["unplanned"][:7]]
    pl = [(r["reason"], r["count"], f"{r['count']}x") for r in f["planned"][:7]]
    cw = (CW - 16) / 2
    cols = [[P("UNPLANNED", LABEL), Spacer(1, 3), hbar(un, cw, RED, label_w=cw * 0.5) or P("No unplanned stops recorded.", SMALL)],
            [P("PLANNED", LABEL), Spacer(1, 3), hbar(pl, cw, BLUE, label_w=cw * 0.5) or P("No planned stops recorded.", SMALL)]]
    dt = Table([cols], colWidths=[cw + 8, cw + 8])
    dt.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    s += dt_head + [dt, Spacer(1, 14)]

    s += section("Sealing heaters", f"Temperature over the last {_hm(f['hours'])}. Dashed lines are setpoints.")
    tr = trend(f["zones"], CW)
    if tr:
        s += [tr, Spacer(1, 6)]
    head = [P(h, LABEL) for h in ("ZONE", "SETPOINT", "NOW", "MIN / MAX", "OUTPUT", "IN TOLERANCE")]
    rows = [head]
    for i, z in enumerate(f["zones"]):
        pct = z["in_tol_pct"]
        rows.append([P(z["label"], _st("zl", fontName="Helvetica-Bold", fontSize=9, textColor=ZONE_COLORS[i % 4])),
                     P(num(z["setpoint"], 0, "°C"), BODY), P(num(z["now"], 1, "°C"), BODY),
                     P(f"{num(z['min'], 0)} / {num(z['max'], 0)}", BODY), P(num(z["output"], 0, "%"), BODY),
                     hbar([("", pct or 0, num(pct, 0, "%"))], 92, GREEN if (pct or 0) >= 90 else AMBER if (pct or 0) >= 70 else RED, max_v=100, row=14, label_w=0) or P("—")])
    zt = Table(rows, colWidths=[CW * 0.22, CW * 0.13, CW * 0.13, CW * 0.16, CW * 0.11, CW * 0.25])
    zt.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, FAINT), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 2), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    s += [zt, Spacer(1, 12)]

    s += section("Servo drives")
    ax_cells = []
    for a in f["axes"]:
        bad = a["fault"]
        ax_cells.append([P(a["label"].upper(), LABEL), Paragraph(escape(f"Error {a['error_id']}" if bad else "Healthy"),
                         _st("ax", fontName="Helvetica-Bold", fontSize=9.5, textColor=RED if bad else GREEN)),
                         P(f"{num(a['rpm'], 0)} rpm" + (f"  |  {num(a['temp'], 0)}°C" if a["temp"] is not None else ""), SMALL)])
    at = Table([ax_cells[:3], ax_cells[3:]], colWidths=[CW / 3] * 3)
    at.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PANEL), ("BOX", (0, 0), (-1, -1), 0.6, FAINT), ("INNERGRID", (0, 0), (-1, -1), 0.6, FAINT),
                            ("LEFTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    s += [at, Spacer(1, 12)]

    s += section("Events this shift", "Faults, alarms and tolerance changes, newest first.")
    if f["events"]:
        sev = {"error": RED, "warning": AMBER, "info": BLUE}
        rows = [[P(h, LABEL) for h in ("TIME", "TYPE", "DETAIL")]]
        for e in f["events"][:10]:
            d = e["data"] or {}
            detail = ", ".join(f"{k.replace('_', ' ')}: {v}" for k, v in d.items() if v not in ("", None))
            rows.append([P(datetime.fromisoformat(e["ts"]).astimezone().strftime("%H:%M:%S"), SMALL),
                         Paragraph(escape(e["type"].upper()), _st("ev", fontName="Helvetica-Bold", fontSize=7.5, textColor=sev.get(e["severity"], MUTED))),
                         P(detail[:110], SMALL)])
        et = Table(rows, colWidths=[CW * 0.15, CW * 0.17, CW * 0.68])
        et.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, FAINT), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                ("LEFTPADDING", (0, 0), (-1, -1), 2), ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        s.append(et)
    else:
        s.append(P("No faults, alarms or tolerance changes were logged in this period.", SMALL))
    s.append(Spacer(1, 14))

    # What to do next: flows on after the events; the heading travels with the first card.
    heading = section("Actions for the next shift", "Ordered by expected payoff.")
    for i, a in enumerate(story_ai["actions"], 1):
        num_box = Drawing(24, 24)
        num_box.add(Circle(12, 12, 11, fillColor=NAVY, strokeColor=None))
        num_box.add(String(12, 8, str(i), fontName="Helvetica-Bold", fontSize=11, fillColor=colors.white, textAnchor="middle"))
        body = [Paragraph(escape(a["title"]), _st("at", fontName="Helvetica-Bold", fontSize=11, leading=14)), Spacer(1, 2),
                P("Why: " + a["why"], _st("aw", fontSize=9, leading=12.5, textColor=MUTED)), Spacer(1, 2),
                P("How: " + a["how"], BODY)]
        side = [pill(a["impact"] + " impact", IMPACT[a["impact"]], 62), Spacer(1, 4), P(a["owner"], _st("ao", fontSize=8, textColor=MUTED))]
        card = Table([[num_box, body, side]], colWidths=[34, CW - 34 - 80, 80])
        card.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PANEL), ("BOX", (0, 0), (-1, -1), 0.6, FAINT),
                                  ("LINEBEFORE", (0, 0), (0, -1), 3, IMPACT[a["impact"]]), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                  ("LEFTPADDING", (0, 0), (-1, -1), 9), ("TOPPADDING", (0, 0), (-1, -1), 9), ("BOTTOMPADDING", (0, 0), (-1, -1), 9)]))
        s += [KeepTogether((heading if i == 1 else []) + [card]), Spacer(1, 7)]

    if story_ai["next_shift_focus"]:
        focus = Table([[P("START OF NEXT SHIFT", _st("fl", fontName="Helvetica-Bold", fontSize=7, textColor=colors.HexColor("#a5b4fc"))),],
                       [Paragraph(escape(story_ai["next_shift_focus"]), _st("ff", fontName="Helvetica-Bold", fontSize=11.5, leading=16, textColor=colors.white))]],
                      colWidths=[CW])
        focus.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), NAVY), ("LEFTPADDING", (0, 0), (-1, -1), 14),
                                   ("TOPPADDING", (0, 0), (-1, 0), 11), ("BOTTOMPADDING", (0, -1), (-1, -1), 12)]))
        s += [Spacer(1, 6), focus]

    doc.build(s)
    return buf.getvalue()


def _dot(colr):
    d = Drawing(8, 12)
    d.add(Circle(3.5, 6.5, 2.7, fillColor=colr, strokeColor=None))
    return d
