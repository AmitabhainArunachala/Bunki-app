"""Transcribe clips for the render job's admission gate: one JSON request per stdin line,
one JSON answer per stdout line, the model loaded once. Local and free: openai-whisper,
Japanese forced, greedy decoding, no context carried between clips.

    {"id": 1, "file": "/abs/clip.m4a"}  ->  {"id": 1, "text": "..."}
"""
import json
import sys

import whisper

model_name = sys.argv[1] if len(sys.argv) > 1 else "small"
model = whisper.load_model(model_name)
print(json.dumps({"ready": True, "model": model_name}), flush=True)
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    request = json.loads(line)
    try:
        result = model.transcribe(request["file"], language="ja", fp16=False, temperature=0,
                                  condition_on_previous_text=False)
        print(json.dumps({"id": request["id"], "text": result["text"]}, ensure_ascii=False), flush=True)
    except Exception as error:  # an unreadable clip is an admission failure, never a crash
        print(json.dumps({"id": request["id"], "error": str(error)[:200]}), flush=True)
