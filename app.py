import os
import httpx
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

BASE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE, ".env"))

app = FastAPI(title="MMO Prompt Generator")
templates = Jinja2Templates(directory=os.path.join(BASE, "templates"))
app.mount("/static", StaticFiles(directory=os.path.join(BASE, "static")), name="static")

OPENROUTER_KEY = os.getenv("OPENROUTER_API_KEY", "")
POLISH_MODELS = [
    "arcee-ai/trinity-large-preview:free",
    "google/gemma-3-27b-it:free",
    "qwen/qwen3-coder:free",
]


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")


@app.post("/polish")
async def polish_prompt(request: Request):
    body = await request.json()
    raw = body.get("prompt", "")
    if not raw or not OPENROUTER_KEY:
        return JSONResponse({"polished": raw})

    prompt_msg = f"""Improve the wording and clarity of the prompt below. Rules:
1. Keep EVERY section — the role instruction, ALL personal details (hours, budget, interests, experience, etc.), AND the output format/structure requirements at the end.
2. Do NOT remove, summarize, or condense any part. The improved version must be at least as long as the original.
3. Only improve grammar, word choice, and flow. Make instructions crisper and more specific where possible.
4. Return ONLY the improved prompt. No preamble, no explanation, no commentary.

PROMPT TO IMPROVE:
{raw}"""

    async with httpx.AsyncClient(timeout=15.0) as client:
        for model in POLISH_MODELS:
            try:
                resp = await client.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {OPENROUTER_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": [{"role": "user", "content": prompt_msg}],
                        "max_tokens": 1500,
                    },
                )
                data = resp.json()
                if "choices" in data:
                    polished = data["choices"][0]["message"]["content"]
                    return JSONResponse({"polished": polished})
            except Exception:
                continue

    return JSONResponse({"polished": raw})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8891")),
    )
