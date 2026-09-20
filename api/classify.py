"""Live demo endpoint: classify one customer note with the same prompt, schema and model choice
as the pipeline. POST {"text": "..."} -> the extraction plus a routing decision.

Guardrails: input capped at 600 characters, best-effort per-IP throttle, and the Anthropic
console spend limit as the real backstop. The API key lives in Vercel's environment, never here.
"""
import json, os, time
from http.server import BaseHTTPRequestHandler
from typing import Literal, Optional
from pydantic import BaseModel, Field
import anthropic
from _prompt import MODE_IDS, MODE_NAMES, MODE_CATEGORY, SYSTEM

MODEL = os.environ.get("CS_MODEL", "claude-opus-5")
REVIEW_THRESHOLD = 0.7
MAX_CHARS = 600
_hits = {}  # ip -> [timestamps]; per warm instance, best effort

ModeId = Literal[tuple(MODE_IDS)]  # type: ignore
class Extraction(BaseModel):
    failure_mode: ModeId
    confidence: float = Field(ge=0, le=1)
    evidence: str
    origin_stage: Literal["manufacturing", "storage_handling", "fulfillment", "in_service", "customer_side", "unclear"]
    secondary_mode: Optional[ModeId] = None
    timing: Optional[Literal["first_use", "in_service", "unknown"]] = None
    part_type_mentioned: Optional[str] = None

def throttled(ip):
    now = time.time(); q = [t for t in _hits.get(ip, []) if now - t < 60]; _hits[ip] = q + [now]
    return len(q) >= 8

class handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode(); self.send_response(code)
        self.send_header("Content-Type", "application/json"); self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", 0)); data = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self._send(400, {"error": "bad request"})
        text = (data.get("text") or "").strip()
        if not text: return self._send(400, {"error": "empty"})
        if len(text) > MAX_CHARS: return self._send(413, {"error": f"keep it under {MAX_CHARS} characters"})
        ip = self.headers.get("x-forwarded-for", "?").split(",")[0].strip()
        if throttled(ip): return self._send(429, {"error": "slow down — a few per minute is plenty"})
        t0 = time.time()
        try:
            client = anthropic.Anthropic(max_retries=1, timeout=25.0)
            kw = dict(model=MODEL, max_tokens=400, system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
                      messages=[{"role": "user", "content": f"Text:\n\"\"\"\n{text}\n\"\"\""}], output_format=Extraction)
            if MODEL.startswith("claude-opus-5"):
                kw["betas"] = ["server-side-fallback-2026-07-01"]; kw["fallbacks"] = "default"
            if MODEL.startswith(("claude-opus-5", "claude-sonnet-5")): kw["output_config"] = {"effort": "low"}
            r = client.beta.messages.parse(**kw)
            if r.stop_reason == "refusal" or r.parsed_output is None: return self._send(502, {"error": "the model declined this one"})
            x = r.parsed_output
            u = r.usage; cached = getattr(u, "cache_read_input_tokens", 0) or 0; written = getattr(u, "cache_creation_input_tokens", 0) or 0
            price = {"claude-opus-5": (5, 25, .5), "claude-sonnet-5": (2, 10, .2)}.get(MODEL, (5, 25, .5))
            cost = (u.input_tokens * price[0] + written * price[0] * 1.25 + cached * price[2] + u.output_tokens * price[1]) / 1e6
            return self._send(200, {
                "failure_mode": x.failure_mode, "name": MODE_NAMES[x.failure_mode], "category": MODE_CATEGORY[x.failure_mode],
                "confidence": x.confidence, "evidence": x.evidence, "origin_stage": x.origin_stage, "timing": x.timing,
                "secondary_mode": x.secondary_mode and MODE_NAMES.get(x.secondary_mode), "part_type": x.part_type_mentioned,
                "route": "auto_file" if x.confidence >= REVIEW_THRESHOLD else "review", "threshold": REVIEW_THRESHOLD,
                "model": MODEL, "seconds": round(time.time() - t0, 1), "cost_usd": round(cost, 4)})
        except anthropic.RateLimitError:
            return self._send(429, {"error": "rate limited upstream — try again in a moment"})
        except Exception as e:
            return self._send(502, {"error": "classifier unavailable", "detail": type(e).__name__})
    def do_GET(self):
        self._send(200, {"ok": True, "model": MODEL, "modes": len(MODE_IDS)})
