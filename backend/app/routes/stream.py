"""WebSocket streaming route for live event updates."""
import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import List

router = APIRouter()

# Simple in-memory connection manager
_connections: List[WebSocket] = []


async def broadcast_event(event_data: dict):
    """Broadcast an event to all connected WebSocket clients."""
    dead = []
    for ws in _connections:
        try:
            await ws.send_json(event_data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _connections.remove(ws)


@router.websocket("/stream")
async def websocket_stream(websocket: WebSocket):
    """WebSocket endpoint for live event/incident streaming."""
    await websocket.accept()
    _connections.append(websocket)
    try:
        while True:
            # Keep connection alive; client can also send commands
            data = await websocket.receive_text()
            # Echo back as acknowledgment
            await websocket.send_json({"type": "ack", "message": data})
    except WebSocketDisconnect:
        if websocket in _connections:
            _connections.remove(websocket)
