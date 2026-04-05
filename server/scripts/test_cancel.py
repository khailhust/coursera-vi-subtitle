import httpx
import time

r = httpx.post("http://localhost:8765/translate/job", json={
    "cues": [{"originalText": "Very long text to translate on CPU"} for _ in range(20)],
    "engine": "opus-mt",
    "use_glossary": True
})
data = r.json()
job_id = data.get("job_id")
print("Job ID:", job_id)

time.sleep(0.5)
c = httpx.post("http://localhost:8765/translate/job/cancel", json={"job_id": job_id})
print("Cancel Response:", c.json())

time.sleep(1)
res = httpx.get(f"http://localhost:8765/translate/job/{job_id}").json()
print("Final Status:", res.get("status"))
