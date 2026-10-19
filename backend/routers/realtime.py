import asyncio
import json
from typing import Set, Optional
from datetime import datetime, timezone
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/realtime", tags=["Realtime Sync"])

# Global Monotonic Version Tracker
_data_version: int = 1
_last_updated: str = datetime.now(timezone.utc).isoformat()
_subscribers: Set[asyncio.Queue] = set()

def get_current_version() -> int:
    return _data_version

def get_last_updated() -> str:
    return _last_updated

def notify_change(entity: str, action: str = "updated", payload: Optional[dict] = None):
    """
    Broadcasts a data change notification to all active SSE subscribers across all devices,
    and increments the global synchronization version.
    """
    global _data_version, _last_updated
    _data_version += 1
    _last_updated = datetime.now(timezone.utc).isoformat()

    event_data = {
        "type": "change",
        "version": _data_version,
        "entity": entity,
        "action": action,
        "timestamp": _last_updated,
        "payload": payload or {}
    }

    # Dispatch to all connected in-memory subscriber queues
    dead_queues = set()
    for queue in _subscribers:
        try:
            queue.put_nowait(event_data)
        except Exception:
            dead_queues.add(queue)

    for dead in dead_queues:
        _subscribers.discard(dead)

@router.get("/version")
def get_version():
    """
    Ultra-lightweight endpoint for client polling fallback across platforms and serverless functions.
    """
    return {
        "version": _data_version,
        "last_updated": _last_updated
    }

@router.get("/stream")
async def event_stream():
    """
    Server-Sent Events (SSE) streaming endpoint for instantaneous multi-device real-time updates.
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.add(queue)

    async def event_generator():
        try:
            # Send initial connection handshake
            handshake = {
                "type": "connected",
                "version": _data_version,
                "timestamp": _last_updated
            }
            yield f"data: {json.dumps(handshake)}\n\n"

            while True:
                try:
                    # Wait for next event or send heartbeat ping every 15 seconds
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    # Keep-alive comment for HTTP proxies and browser connections
                    yield ": ping\n\n"
        except (asyncio.CancelledError, GeneratorExit):
            pass
        finally:
            _subscribers.discard(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
