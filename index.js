const express = require('express');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();

// Servir les fichiers statiques depuis le dossier 'public'
app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.json());

app.post('/start-scraping', async (req, res) => {
    const { search, location, num_urls } = req.body;
    const maxResults = parseInt(num_urls, 10);

    const browser = await puppeteer.launch({ headless: true });
    const urls = await searchUrls(browser, `${search} ${location}`, maxResults);
    const contactInfo = await scrapeContactInfo(browser, urls);

    const csvContent = contactInfo.map(info => `${info.url},${info.phoneNumber},${info.email}`).join('\n');
    const filePath = path.join(__dirname, 'public', 'results.csv');
    fs.writeFileSync(filePath, csvContent);

    await browser.close();

    res.json({ fileUrl: '/results.csv' });
});

async function searchUrls(browser, searchQuery, maxResults) {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    const page = await browser.newPage();
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    let urls = await page.$$eval('a', (links) => 
        links.map(link => link.href)
            .filter(href => href.startsWith('http') && !href.includes('google'))
    );

    urls = urls.slice(0, maxResults);
    await page.close();
    return urls;
}

async function scrapeContactInfo(browser, urls) {
    const results = [];
    for (const url of urls) {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

        const phoneNumbers = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const phoneRegex = /(\+?\d{1,3}[-.\s]?)?(\(?\d{2,3}\)?[-.\s]?)?[\d.\s]{7,}/g;
            const rawPhoneNumbers = bodyText.match(phoneRegex) || [];
            return rawPhoneNumbers.map(number => number.replace(/[-.\s]/g, '').trim())[0] || null;
        });

        const emails = await page.$$eval('a[href^="mailto:"]', links => 
            links.map(link => link.href.replace('mailto:', '').trim())[0] || null
        );

        results.push({ url, phoneNumber: phoneNumbers, email: emails });
        await page.close();
    }
    return results;
}

// Démarrer le serveur sur le port 3000
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
