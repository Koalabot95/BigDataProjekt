const fs = require('fs');
const path = require('path');

// Optionen: maxPages (Anzahl Seiten), outputPath (Zieldatei), runType ('full' | 'fast', wird als Metadatum gespeichert)
async function scrapeImmoScout({
    maxPages = 2,
    outputPath = path.join(__dirname, '../../data/raw/immobilienscout_listings.jsonl'),
    runType = 'full'
} = {}) {
    const url = 'https://www.immobilienscout24.at/portal/graphql';
    
    const dataDir = path.dirname(outputPath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    let allListings = [];
    const seenIds = new Set();
    const scrapedAt = new Date().toISOString();
    let page = 1;
    let hasMorePages = true;
    const pageSize = 20;
    const shaHash = "2f6188db30c658d6d5b86b9a796432039ef174bfebfd28bf7ddb9f9c4f9cc3bd";

    fs.writeFileSync(outputPath, '');
    console.log("Starte ImmoScout24 Scraping...");

    while (hasMorePages && page <= maxPages) {
        const fromIndex = (page - 1) * pageSize;
        let success = false;
        let retries = 0;
        let listings = [];

        while (!success && retries < 3) {
            try {
                const requestBody = {
                    operationName: "findPropertiesByParams",
                    variables: {
                        params: {
                            countryCode: "AT",
                            from: fromIndex.toString(),
                            region: "009001",
                            size: pageSize.toString(),
                            transferType: "RENT",
                            useType: "RESIDENTIAL"
                        }
                    },
                    extensions: {
                        persistedQuery: { version: 1, sha256Hash: shaHash }
                    }
                };

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json, application/graphql-response+json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                    },
                    body: JSON.stringify(requestBody)
                });

                const data = await response.json();
                if (data.errors) throw new Error(JSON.stringify(data.errors));

                listings = data.data?.findPropertiesByParams?.hits || [];
                success = true;
            } catch (error) {
                retries++;
                console.log(`ImmoScout Fehler auf Seite ${page} (Versuch ${retries}/3): ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        // Duplikate ausfiltern; liefert eine Seite nichts Neues mehr, ist das Ende erreicht
        const fresh = listings.filter(item => !seenIds.has(item.exposeId));
        fresh.forEach(item => seenIds.add(item.exposeId));

        if (!success || fresh.length === 0) {
            hasMorePages = false;
            break;
        }

        allListings.push(...fresh);
        fs.appendFileSync(outputPath, fresh.map(item =>
            JSON.stringify({ ...item, _scraped_at: scrapedAt, _run_type: runType })).join('\n') + '\n');

        console.log(`-> ImmoScout Seite ${page}: ${fresh.length} Anzeigen (Gesamt: ${allListings.length})`);
        page++;
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log(`ImmoScout fertig: ${allListings.length} Wohnungen gespeichert.\n`);
    return allListings.length;
}

module.exports = { scrapeImmoScout };