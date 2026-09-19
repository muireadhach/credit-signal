"""Thin wrapper around the Anthropic SDK: one place for model names, structured output,
prompt caching, refusal fallbacks, and a cost log every script appends to.

Three models, on purpose:
  REFERENCE (Claude Opus 5)   - writes the synthetic notes; classifies the gold set and a
                                sample as the accuracy reference.
  BULK      (Claude Sonnet 5) - classifies everything at ~1/3 the reference price.
  CHEAP     (Claude Haiku 4.5) - gold set only, for a three-way comparison.
Why Sonnet and not Haiku for bulk: Haiku 4.5 will not cache a prompt under 4,096 tokens,
and our classifier prompt is ~2,100. Uncached Haiku costs MORE per call than cached Sonnet
here ($0.0033 vs ~$0.0012 measured). Cheaper per token is not cheaper per record.
Whether BULK is "good enough" is a measured result, not an assumption.
"""
import json, os, time, threading
from pathlib import Path
from dotenv import load_dotenv
import anthropic

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
client = anthropic.Anthropic(max_retries=4)

REFERENCE = "claude-opus-5"
BULK = "claude-sonnet-5"
CHEAP = "claude-haiku-4-5"

# $ per million tokens (input, output, cached-read). Cached reads are ~10% of input price.
PRICE = {REFERENCE: (5.00, 25.00, 0.50), BULK: (2.00, 10.00, 0.20), CHEAP: (1.00, 5.00, 0.10)}
USAGE_LOG = Path("data/processed/usage.jsonl")
_lock = threading.Lock()

def _log(model, usage, purpose):
    cached = getattr(usage, "cache_read_input_tokens", 0) or 0
    written = getattr(usage, "cache_creation_input_tokens", 0) or 0
    pin, pout, pcache = PRICE[model]
    # cache writes bill at 1.25x the input price; cache reads at ~0.1x
    cost = (usage.input_tokens * pin + written * pin * 1.25 + cached * pcache + usage.output_tokens * pout) / 1e6
    rec = dict(ts=time.time(), model=model, purpose=purpose, input=usage.input_tokens,
               cache_write=written, cache_read=cached, output=usage.output_tokens, cost_usd=round(cost, 6))
    with _lock, open(USAGE_LOG, "a") as f: f.write(json.dumps(rec) + "\n")
    return cost

def call_json(model, system, user, schema, max_tokens, purpose, effort=None):
    """Structured-output call. `schema` is a pydantic model; returns a validated instance."""
    kw = dict(model=model, max_tokens=max_tokens,
              system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
              messages=[{"role": "user", "content": user}],
              output_format=schema)
    if model == REFERENCE:
        # Opus 5: refusals are re-run server-side on Anthropic's recommended substitute.
        kw["betas"] = ["server-side-fallback-2026-07-01"]; kw["fallbacks"] = "default"
    if effort and model in (REFERENCE, BULK):
        # effort is the cost lever on Opus 5 / Sonnet 5 (adaptive thinking is on by default);
        # Haiku 4.5 rejects the parameter.
        kw["output_config"] = {"effort": effort}
    r = client.beta.messages.parse(**kw)
    _log(model, r.usage, purpose)
    if r.stop_reason == "refusal":
        raise RuntimeError(f"refused: {getattr(r, 'stop_details', None)}")
    if r.parsed_output is None:
        raise RuntimeError(f"no parsed output (stop_reason={r.stop_reason})")
    return r.parsed_output

def total_cost():
    if not USAGE_LOG.exists(): return 0.0
    return sum(json.loads(l)["cost_usd"] for l in open(USAGE_LOG))
