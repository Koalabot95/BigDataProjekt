// app.js - Master-Zentrale für das Big-Data-Projekt
const { scrapeWillhaben } = require('./test/willhaben_test');
const { scrapeImmoScout } = require('./test/immoscout24_test');

async function runMasterPipeline() {
    console.log("========================================");
    console.log("🏠 STARTE GESAMTEN WOHNUNGS-SCRAPER-JOB");
    console.log("========================================\n");

    try {
        // 1. Willhaben ausführen
        await scrapeWillhaben();

        // 2. ImmoScout24 ausführen
        await scrapeImmoScout();

        console.log("========================================");
        console.log("🎉 ALLES FERTIG! Daten liegen im data/-Ordner.");
        console.log("Bereit für Apache Spark! 🚀");
        console.log("========================================");

    } catch (error) {
        console.error("❌ Schwerwiegender Fehler im Master-Skript:", error);
    }
}

runMasterPipeline();