const express = require('express');
const { runScraping } = require('./scripts/scraping');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

app.post('/start-scraping', async (req, res) => {
    const { search, location, num_urls } = req.body;
    const maxResults = parseInt(num_urls, 10);

    try {
        console.log(`Starting scraping for query: ${search} in ${location} with a maximum of ${maxResults} results.`);
        const contactInfo = await runScraping(search, location, maxResults);

        // Après le scraping, envoyer le lien vers le fichier CSV
        res.json({ fileUrl: '/results.csv' });
        console.log('Scraping completed.');
    } catch (error) {
        console.error('Error during scraping:', error);
        res.status(500).json({ error: 'Scraping failed' });
    }
});

// Démarrer le serveur sur le port 3000
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
