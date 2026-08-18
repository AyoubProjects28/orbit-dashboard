# Agent de métriques — copie de déploiement

⚠️ **Ce script n'est pas de nous.** `orbit_metrics_agent.py` est l'agent de JB,
déployé aujourd'hui à la main sur `llm-test01` et `mcp-test01`
(`/opt/projects/orbit_metrics_agent.py`, service systemd `orbit-metric`).

Il est copié ici **sans aucune modification** pour pouvoir être conteneurisé et
déployé sur `web-test01` — la VM qui héberge désormais 3 services et que le
dashboard ne mesurait pas.

À terme, ce fichier devrait vivre dans le dépôt de JB et être référencé ici,
pas dupliqué. À trancher avec lui.

## Pourquoi `network_mode: host`

`psutil.net_io_counters()` lit `/proc/net/dev`, qui est **isolé par conteneur** :
sans le réseau de l'hôte, l'agent mesurerait le trafic de sa propre interface
virtuelle, pas celui de la VM. CPU et RAM, eux, ne sont pas isolés
(`/proc/stat` et `/proc/meminfo` sont ceux de l'hôte même dans un conteneur).

Effet de bord utile : avec `network_mode: host`, le conteneur hérite du nom
d'hôte de la VM, donc `socket.gethostname()` renvoie bien `web-test01`.
