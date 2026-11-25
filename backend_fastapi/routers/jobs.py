from fastapi import APIRouter, Depends, HTTPException

from auth.dependencies import get_current_user
from services.background_jobs import get_job, public_status

router = APIRouter()


@router.get("/jobs/{job_id}")
async def job_status(job_id: str, current_user: dict = Depends(get_current_user)):
    job = get_job(job_id, current_user["username"])
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    # Browser jobs also carry live progress: step, page URL, and the latest screenshot.
    return public_status(job)
