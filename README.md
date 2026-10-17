### Wohnungsmarkt-Analyse Wien
## Analyse und Preisvorhersage von Mietwohnungen in Wien unter Berücksichtigung der U-Bahn-Nähe

# Einrichtung:
Vorraussetzung: Docker Desktop, Python 3.12, Java JDK 17 (für Spark), VS Code 

1. Virtuelle Python Umgebung anlegen:
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-lock.txt (hier sind alle exakten Versionsnummern gespeichert - mit requirements ist die Installation auch möglich)

2. MongoDB starten:
docker compose up -d

3. Notebook öffnen und loslegen
