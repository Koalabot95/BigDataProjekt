const fs = require('fs');
const path = require('path');

async function scrapeImmoScout() {
    const url = 'https://www.immobilienscout24.at/portal/graphql';
    const outputPath = path.join(__dirname, '../../data/raw/immobilienscout_listings.jsonl');
    
    const dataDir = path.dirname(outputPath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    let allListings = [];
    let page = 1;
    let hasMorePages = true;
    const pageSize = 20;
    const maxPages = 2;
    const shaHash = "2f6188db30c658d6d5b86b9a796432039ef174bfebfd28bf7ddb9f9c4f9cc3bd";

    fs.writeFileSync(outputPath, '');
    console.log("🚀 Starte ImmoScout24 Scraping...");

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
                console.log(`⚠️ ImmoScout Fehler auf Seite ${page} (Versuch ${retries}/3): ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        if (!success || listings.length === 0) {
            hasMorePages = false;
            break;
        }

        allListings.push(...listings);
        const stream = fs.createWriteStream(outputPath, { flags: 'a' });
        for (const item of listings) {
            stream.write(JSON.stringify(item) + '\n');
        }
        stream.end();

        console.log(`-> ImmoScout Seite ${page}: ${listings.length} Anzeigen (Gesamt: ${allListings.length})`);
        page++;
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log(`✅ ImmoScout fertig: ${allListings.length} Wohnungen gespeichert.\n`);
    return allListings.length;
}

module.exports = { scrapeImmoScout };