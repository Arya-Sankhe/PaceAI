"""One-click shift report: facts from the machine, assessment from the model, PDF out."""

from datetime import datetime

import anyio
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.api import deps
from app.copilot import report, report_pdf

router = APIRouter()


@router.get("/machines/{key}/report.pdf")
async def shift_report(key: str, hours: float | None = Query(None, gt=0, le=report.MAX_HOURS),
                       _=Depends(deps.require_user)):
    try:
        facts = await report.collect(key, hours)
    except KeyError:
        raise HTTPException(404, "unknown_machine")
    if not facts["has_data"]:
        raise HTTPException(409, "no_machine_data")
    story = await report.narrative(facts)
    pdf = await anyio.to_thread.run_sync(report_pdf.build, facts, story)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    return Response(
        pdf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="shift-report-{key}-{stamp}.pdf"'},
    )
