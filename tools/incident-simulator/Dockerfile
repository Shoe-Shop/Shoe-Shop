# Incident simulator — Python-in-container with a host Docker CLI.
#
# The simulator drives the real Compose stack (recreate a container to apply an
# env-knob fault) AND the storefront load path, then writes a label record into
# the mounted repo. So the image needs: Python + the deps, plus the `docker` CLI
# and the compose plugin (which talk to the HOST daemon via the mounted socket —
# "docker-out-of-docker"). We copy both from the official pinned docker:cli image
# rather than adding an apt repo.

FROM docker:27-cli AS dockercli

FROM python:3.12-slim
# docker CLI + compose v2 plugin (standard plugin path).
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose \
     /usr/local/libexec/docker/cli-plugins/docker-compose

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY simulate.py .
COPY scenarios ./scenarios

# The repo is mounted at /work at run time (compose files + docs/dataset output).
WORKDIR /work
ENTRYPOINT ["python", "/app/simulate.py"]
