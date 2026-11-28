"""
Export der bewerteten Inserate (03_ml.ipynb) nach ClickHouse, damit Grafana sie anzeigen kann.

Aufruf am Ende von 03_ml.ipynb (nach Abschnitt 3.15, die Variablen heißen dort so):

    import sys; sys.path.append("..")          # export_to_clickhouse.py liegt im Projektordner
    from export_to_clickhouse import export_all
    export_all(df, ergebnisse, wichtigkeit, effekte, bester_name,
               mape_neu=mape_neu, basis_bezirk=basis)

Hinweis Zeitzone: Beim Erzeugen der Spark-Session zusätzlich
    .config("spark.sql.session.timeZone", "UTC")
setzen, sonst sind first_seen/last_seen im DataFrame in lokaler Zeit statt UTC.
"""
import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import clickhouse_connect

CH = dict(host="localhost", port=8123, username="wohnung", password="wohnung", database="wohnungsmarkt")
INIT_SQL = Path(__file__).parent / "clickhouse" / "init.sql"

BEZIRK_NAMEN = {
    1: "Innere Stadt", 2: "Leopoldstadt", 3: "Landstraße", 4: "Wieden", 5: "Margareten",
    6: "Mariahilf", 7: "Neubau", 8: "Josefstadt", 9: "Alsergrund", 10: "Favoriten",
    11: "Simmering", 12: "Meidling", 13: "Hietzing", 14: "Penzing", 15: "Rudolfsheim-Fünfhaus",
    16: "Ottakring", 17: "Hernals", 18: "Währing", 19: "Döbling", 20: "Brigittenau",
    21: "Floridsdorf", 22: "Donaustadt", 23: "Liesing",
}
KATEGORIE_RANG = {"Sehr guter Deal": 1, "Guter Deal": 2, "Fair": 3, "Teuer": 4, "Zu teuer": 5}
MERKMAL_NAMEN = {
    "area_m2": "Fläche (+1 m²)", "rooms": "Zimmer (+1)", "has_outdoor_space": "Freifläche (ja)",
    "oeffi_score": "Öffi-Score (+1 Punkt)", "source_willhaben": "Plattform Willhaben (ggü. ImmoScout24)",
}

LISTING_COLUMNS = [
    "listing_id", "source", "id", "url", "title", "plz", "bezirk", "bezirk_label", "address",
    "price", "area_m2", "rooms", "price_per_m2", "bezirk_median_ppm2", "ppm2_vs_bezirk",
    "has_outdoor_space", "is_private", "n_portals", "lat", "lon", "dist_ubahn_m", "nearest_ubahn",
    "ubahn_within_500m", "n_ubahn_lines", "n_tram_lines", "n_bus_lines", "n_regionalbus_lines",
    "n_sbahn_lines", "n_badnerbahn_lines", "n_lines", "oeffi_score", "faire_miete", "abweichung",
    "ersparnis", "kategorie", "kategorie_rang", "status", "first_seen", "last_seen",
]
NULLABLE = ["url", "plz", "address", "bezirk_median_ppm2", "ppm2_vs_bezirk", "dist_ubahn_m", "nearest_ubahn"]


def bezirk_label(nr):
    return f"{int(nr):02d} {BEZIRK_NAMEN.get(int(nr), 'Unbekannt')}"


def _none_for_na(series):
    """NaN/NA -> None, damit ClickHouse NULL speichert."""
    return series.astype(object).where(series.notna(), None)


def _utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def prepare_listings(df):
    d = df.copy()
    d["listing_id"] = d["source"].astype(str) + ":" + d["id"].astype(str)
    d["bezirk"] = d["bezirk"].astype(int)
    d["bezirk_label"] = d["bezirk"].map(bezirk_label)
    d["kategorie"] = d["kategorie"].astype(str)
    d["kategorie_rang"] = d["kategorie"].map(KATEGORIE_RANG).astype(int)
    d["title"] = d["title"].fillna("").astype(str)
    for c in ("first_seen", "last_seen"):
        d[c] = pd.to_datetime(d[c], utc=True).dt.tz_localize(None)
    plz = pd.to_numeric(d["plz"], errors="coerce")
    d["plz"] = pd.Series([None if pd.isna(v) else int(v) for v in plz], index=d.index, dtype=object)
    for c in ("bezirk_median_ppm2", "ppm2_vs_bezirk", "dist_ubahn_m"):
        d[c] = _none_for_na(pd.to_numeric(d[c], errors="coerce"))
    for c in ("url", "address", "nearest_ubahn"):
        d[c] = _none_for_na(d[c])
    for c in ("has_outdoor_space", "is_private", "n_portals", "ubahn_within_500m"):
        d[c] = d[c].astype(int)
    for c in [c for c in LISTING_COLUMNS if c.startswith("n_") and c.endswith("_lines")]:
        d[c] = d[c].astype(int)
    return d[LISTING_COLUMNS]


def prepare_effects(effekte):
    rows = []
    for name, val in effekte.items():
        m = re.fullmatch(r"bezirk_(\d+)(?:\.0)?", str(name))
        if m:
            rows.append(("Bezirk", bezirk_label(m.group(1)), float(val)))
        else:
            rows.append(("Merkmal", MERKMAL_NAMEN.get(name, str(name)), float(val)))
    return pd.DataFrame(rows, columns=["gruppe", "merkmal", "effekt_pct"])


def prepare_metrics(ergebnisse, mape_neu=None, bester_name=None):
    now = _utc_now()
    rows = [dict(trained_at=now, modell=r["Modell"], testart="Zufalls-Split",
                 mae=float(r["MAE (€)"]), mape=float(r["MAPE (%)"]),
                 rmse=float(r["RMSE (€)"]), r2=float(r["R²"]))
            for _, r in ergebnisse.iterrows()]
    if mape_neu is not None and bester_name is not None:
        rows.append(dict(trained_at=now, modell=bester_name, testart="Zeit-Split (neueste 20 %)",
                         mae=None, mape=float(mape_neu), rmse=None, r2=None))
    return pd.DataFrame(rows)


def get_client():
    return clickhouse_connect.get_client(**CH)


def create_schema(client):
    """Führt clickhouse/init.sql aus (idempotent, falls der Container-Init nicht lief)."""
    for stmt in INIT_SQL.read_text(encoding="utf-8").split(";"):
        if stmt.strip():
            client.command(stmt)


def export_all(df, ergebnisse=None, wichtigkeit=None, effekte=None, bester_name=None,
               mape_neu=None, basis_bezirk=None):
    client = get_client()
    create_schema(client)

    listings = prepare_listings(df)
    client.command("TRUNCATE TABLE listings")          # listings_clean wird ohnehin komplett neu aufgebaut
    client.insert_df("listings", listings)
    print(f"{len(listings)} Inserate nach ClickHouse geschrieben")

    if ergebnisse is not None:                          # Historie: jede Trainingsrunde wird angehängt
        client.insert_df("model_metrics", prepare_metrics(ergebnisse, mape_neu, bester_name))
        print("Modellkennzahlen angehängt")
    if wichtigkeit is not None:
        client.command("TRUNCATE TABLE feature_importance")
        client.insert_df("feature_importance",
                         pd.DataFrame({"merkmal": wichtigkeit.index.astype(str),
                                       "wichtigkeit": wichtigkeit.values.astype(float)}))
    if effekte is not None:
        client.command("TRUNCATE TABLE effects")
        client.insert_df("effects", prepare_effects(effekte))
    n = client.query("SELECT count() FROM listings").result_rows[0][0]
    print(f"Kontrolle: {n} Zeilen in wohnungsmarkt.listings")
