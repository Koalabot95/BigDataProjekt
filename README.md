# Wohnungsmarkt-Analyse Wien

Analyse und Preis/Leistungs-Bewertung von Mietwohnungen in Wien unter Berücksichtigung der Öffi-Anbindung. Daten von Willhaben, ImmoScout24 und DerStandard werden gescrapt, über Kafka in MongoDB gespeichert, bereinigt und analysiert.

## Voraussetzungen
- Docker Desktop
- Python 3.12
- Node.js 18 oder neuer
- Java JDK 17 (für Spark)
- VS Code

## Einrichtung

**1. Virtuelle Python-Umgebung anlegen**
```
python -m venv .venv
.venv\Scripts\activate
```

**2. Python-Abhängigkeiten installieren**
```
python -m pip install -r requirements.txt
```
Sollte etwas nicht klappen, die exakten Versionen verwenden (Stand: Windows):
```
python -m pip install -r requirements-lock.txt
```

**3. Node-Abhängigkeiten installieren**
```
cd immo_webscraper
npm install
```

**4. Docker-Container starten** (MongoDB, Kafka, Zookeeper, Spark)
```
docker compose up -d
```
Kafka braucht danach einige Sekunden. Mit `docker compose ps` prüfen, ob alles läuft.

## Ausführen

**Notebooks** (Kernel: `.venv`), der Reihe nach:
1. `01_data_source_layer.ipynb` – Datenquellen und Scraping
2. `02_data_storage_layer.ipynb` – Rohzone, Bereinigung, `listings_clean` in MongoDB

**Scraper** (im Ordner `immo_webscraper`, wird im Notebook ausgeführt):
```
node app.js fast     # einmaliger schneller Lauf (nur die erste Seite der Immoseiten)
node app.js full     # einmaliger voller Lauf (Grunddatensatz)
node app.js          # Dauerbetrieb: alle 10 Minuten erste Seite, täglich 03:00-06:00 alle Seiten
```

## Hinweise
- Der Willhaben-Scraper basiert auf dem Open-Source-Projekt `willhaben` von Christian Proschek (ISC-Lizenz), wurde aber für unsere Bedürfnisse umgebaut.