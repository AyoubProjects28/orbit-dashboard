# Agent de métriques Orbit (source : JB — voir README.md)
FROM python:3.11-slim

WORKDIR /app
RUN pip install --no-cache-dir psutil
COPY orbit_metrics_agent.py ./

ENV PYTHONUNBUFFERED=1
EXPOSE 9100

# `network_mode: host` dans le compose : pas de mapping de port, l'agent
# écoute directement sur le 9100 de la VM.
CMD ["python", "orbit_metrics_agent.py"]
