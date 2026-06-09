# Trace-labeler — dataset export pipeline (tools/trace-labeler).
#
# Unlike the incident-simulator, this tool does NOT drive Compose — it only
# reads incident records and queries the LGTM bundle's backends over HTTP, then
# writes the dataset into the mounted repo. So it needs Python + httpx/PyYAML and
# nothing else (no docker CLI, no host socket). It runs on the `shoeshop` network
# so it can reach otel-lgtm:{3200,3100,9090} directly.
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY label.py .

# The repo is mounted at /work at run time (incident records in, dataset out).
WORKDIR /work
ENTRYPOINT ["python", "/app/label.py"]
