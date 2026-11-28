CREATE DATABASE IF NOT EXISTS wohnungsmarkt;

CREATE TABLE IF NOT EXISTS wohnungsmarkt.listings
(
    listing_id          String,
    source              LowCardinality(String),
    id                  String,
    url                 Nullable(String),
    title               String,
    plz                 Nullable(UInt16),
    bezirk              UInt8,
    bezirk_label        LowCardinality(String),
    address             Nullable(String),
    price               Float64,
    area_m2             Float64,
    rooms               Float32,
    price_per_m2        Float64,
    bezirk_median_ppm2  Nullable(Float64),
    ppm2_vs_bezirk      Nullable(Float64),
    has_outdoor_space   UInt8,
    is_private          UInt8,
    n_portals           UInt8,
    lat                 Float64,
    lon                 Float64,
    dist_ubahn_m        Nullable(Float64),
    nearest_ubahn       Nullable(String),
    ubahn_within_500m   UInt8,
    n_ubahn_lines       UInt16,
    n_tram_lines        UInt16,
    n_bus_lines         UInt16,
    n_regionalbus_lines UInt16,
    n_sbahn_lines       UInt16,
    n_badnerbahn_lines  UInt16,
    n_lines             UInt16,
    oeffi_score         Float32,
    faire_miete         Float64,
    abweichung          Float64,
    ersparnis           Float64,
    kategorie           LowCardinality(String),
    kategorie_rang      UInt8,
    status              LowCardinality(String),
    first_seen          DateTime,
    last_seen           DateTime
)
ENGINE = MergeTree
ORDER BY (status, bezirk, listing_id);

CREATE TABLE IF NOT EXISTS wohnungsmarkt.model_metrics
(
    trained_at DateTime,
    modell     LowCardinality(String),
    testart    LowCardinality(String),
    mae        Nullable(Float64),
    mape       Nullable(Float64),
    rmse       Nullable(Float64),
    r2         Nullable(Float64)
)
ENGINE = MergeTree
ORDER BY (trained_at, modell, testart);

CREATE TABLE IF NOT EXISTS wohnungsmarkt.feature_importance
(
    merkmal     String,
    wichtigkeit Float64
)
ENGINE = MergeTree
ORDER BY merkmal;

CREATE TABLE IF NOT EXISTS wohnungsmarkt.effects
(
    gruppe     LowCardinality(String),
    merkmal    String,
    effekt_pct Float64
)
ENGINE = MergeTree
ORDER BY (gruppe, merkmal);
