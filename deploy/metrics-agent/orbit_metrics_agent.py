#!/usr/bin/env python3
# =============================================================================
# Orbit Planner - Agent de metriques temps reel
# A deployer sur LLM-TEST01 (172.18.53.7) et MCP-TEST01 (172.18.53.9)
#
# Expose GET /metrics -> JSON { cpu, ram, reseau, load } avec en-tetes CORS
# Le dashboard (web-test01) poll cet endpoint toutes les ~1 s.
#
# Installation :
#   sudo pip3 install psutil --break-system-packages
#   python3 orbit_metrics_agent.py            # ecoute sur 0.0.0.0:9100
#
# Pare-feu : ouvrir le port 9100/tcp depuis web-test01 / le navigateur.
# =============================================================================
import json
import time
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import psutil
except ImportError:
    raise SystemExit("psutil manquant -> sudo pip3 install psutil --break-system-packages")

PORT = 9100
HOST = "0.0.0.0"

# etat pour calculer les debits reseau (delta entre deux appels)
_state = {"t": None, "net": None}

# amorce cpu_percent (le 1er appel renvoie toujours 0.0)
psutil.cpu_percent(interval=None)
psutil.cpu_percent(interval=None, percpu=True)


def collect():
    now = time.time()
    cpu = psutil.cpu_percent(interval=None)
    per_cpu = psutil.cpu_percent(interval=None, percpu=True)
    vm = psutil.virtual_memory()
    try:
        la1, la5, la15 = psutil.getloadavg()
    except (AttributeError, OSError):
        la1 = la5 = la15 = 0.0
    net = psutil.net_io_counters()
    rx_bps = tx_bps = 0.0
    if _state["net"] is not None and _state["t"] is not None:
        dt = now - _state["t"]
        if dt > 0:
            rx_bps = max(0.0, (net.bytes_recv - _state["net"].bytes_recv) / dt)
            tx_bps = max(0.0, (net.bytes_sent - _state["net"].bytes_sent) / dt)
    _state["net"] = net
    _state["t"] = now
    return {
        "host": socket.gethostname(),
        "ts": now,
        "cpu_percent": round(cpu, 1),
        "per_cpu": [round(x, 1) for x in per_cpu],
        "cpu_count": psutil.cpu_count(),
        "mem_used_bytes": vm.used,
        "mem_total_bytes": vm.total,
        "mem_percent": vm.percent,
        "load_avg": [round(la1, 2), round(la5, 2), round(la15, 2)],
        "net_rx_bps": round(rx_bps, 1),
        "net_tx_bps": round(tx_bps, 1),
    }


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] not in ("/metrics", "/"):
            self.send_response(404)
            self._cors()
            self.end_headers()
            return
        try:
            payload = json.dumps(collect()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.end_headers()
            self.wfile.write(payload)
        except BrokenPipeError:
            pass
        except Exception as e:  # noqa
            self.send_response(500)
            self._cors()
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def log_message(self, *args):
        pass  # silencieux


if __name__ == "__main__":
    print(f"[orbit-metrics] ecoute sur http://{HOST}:{PORT}/metrics  (host={socket.gethostname()})")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
