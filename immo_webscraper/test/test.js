const fs = require('fs');
const wh = require('../app');
const assert = require('assert');

describe('Willhaben Vollständiger Scraper', () => {
    it('should fetch all pages, save as JSON and CSV, and log total count', async function() {
        this.timeout(600000); // 10 Minuten Timeout für alle Seiten

        const baseUrl = 'https://www.willhaben.at/iad/immobilien/mietwohnungen/wien';
        let allListings = [];
        let page = 1;
        let hasMorePages = true;

        while (hasMorePages) {
            const url = page === 1 ? baseUrl : `${baseUrl}?page=${page}`;
            console.log(`Lade Seite ${page}...`);

            let success = false;
            let retries = 0;

            while (!success && retries < 3) {
                try {
                    const listings = await wh.getListings(url);

                    if (!listings || listings.length === 0) {
                        console.log('Keine weiteren Anzeigen gefunden. Schleife beendet.');
                        hasMorePages = false;
                        success = true;
                    } else {
                        allListings.push(...listings);
                        console.log(`-> Seite ${page}: ${listings.length} Anzeigen (Gesamt: ${allListings.length})`);
                        page++;
                        success = true;

                        // 1,5 Sekunden Pause zwischen den Anfragen (schont die IP)
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                } catch (error) {
                    retries++;
                    console.log(`⚠️ Fehler/Blockade auf Seite ${page} (Versuch ${retries}/3): ${error.message}`);
                    console.log('Warte 10 Sekunden, bevor erneut versucht wird...');
                    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 Sek. Abklingzeit
                }
            }

            if (!success) {
                console.log(`❌ Seite ${page} konnte nach 3 Versuchen nicht geladen werden. Breche ab und speichere bisherige Daten.`);
                hasMorePages = false;
            }
        }

        // --- HIER WIRD DIE ANZAHL AM ENDE AUSGEGEBEN ---
        console.log(`\n========================================`);
        console.log(`🎉 Fertig! Das Ergebnis enthält genau **${allListings.length}** Wohnungen.`);
        console.log(`========================================\n`);

        // Daten speichern, wenn welche da sind
        if (allListings.length > 0) {
            // 1. JSON speichern
            fs.writeFileSync('listings.json', JSON.stringify(allListings, null, 2), 'utf8');
            console.log('listings.json erfolgreich gespeichert!');

            // 2. CSV speichern
            const keys = Object.keys(allListings[0]);
            let csvContent = keys.join(',') + '\n';

            allListings.forEach(item => {
                const row = keys.map(key => {
                    let val = item[key] !== undefined ? item[key] : '';
                    return `"${String(val).replace(/"/g, '""')}"`;
                }).join(',');
                csvContent += row + '\n';
            });

            fs.writeFileSync('listings.csv', csvContent, 'utf8');
            console.log('listings.csv erfolgreich gespeichert!');
        }

        assert.notEqual(allListings.length, 0, "length of result is not 0");
    });
});