"""Quick test for /translate endpoint"""
import httpx
import json

vtt_content = open("test_en.vtt", "r", encoding="utf-8").read()
r = httpx.post(
    "http://localhost:8765/translate",
    json={
        "content": vtt_content,
        "format": "vtt",
        "engine": "opus-mt",
        "use_glossary": True,
    },
    timeout=120,
)
data = r.json()
print(f"Success: {data['success']}")
print(f"Engine: {data['engine']}")
print(f"Total cues: {data['totalCues']}")
print()
for cue in data["translatedCues"]:
    print(f"[{cue['start']:.1f}-{cue['end']:.1f}]")
    print(f"  EN: {cue['originalText']}")
    print(f"  VI: {cue['translatedText']}")
    print()
