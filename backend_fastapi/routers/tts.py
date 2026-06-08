import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth.dependencies import get_current_user
from services.tts_service import synthesize

logger = logging.getLogger(__name__)

router = APIRouter()


class TtsRequest(BaseModel):
    text: str
    language: str = "en-US"


@router.post("/tts")
async def tts(body: TtsRequest, _: dict = Depends(get_current_user)):
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    try:
        result = await synthesize(body.text, body.language)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("TTS failed for language=%s text_len=%d", body.language, len(body.text))
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {e}")
