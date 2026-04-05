import httpx
import time

print("Starting job...")
r = httpx.post("http://localhost:8765/translate/job", json={
    "cues": [{"originalText": "Hello"}, {"originalText": "World"}],
    "engine": "opus-mt",
    "use_glossary": True
}, timeout=30)
data = r.json()
print("Job ID:", data.get("job_id"))
job_id = data.get("job_id")

if not job_id:
    print("Error:", data)
    exit(1)

while True:
    res = httpx.get(f"http://localhost:8765/translate/job/{job_id}").json()
    print("Status:", res.get("status"))
    if res.get("status") in ["completed", "error"]:
        print(res)
        break
    time.sleep(1)
