import { getTemplate } from "../scripts/get-template.js";
const template = getTemplate();

export default async () => {
    const re = await fetch('https://raw.githubusercontent.com/CennoxX/spotify-ai-blocker/refs/heads/main/SpotifyAiArtists.csv');
    const data = await re.text();
    const csv = data.split('\n').map(line => line.split(','));
    const header = csv.shift(); // Remove header

    if (!header || !header[0].toLowerCase().includes("artist") || !header[1].toLowerCase().includes("id")) {
        throw new Error("External format changed, update external parser");
    }

    const exportData = [];

    csv.forEach(row => {
        const artistName = row[0];
        const artistId = row[1];

        const entry = structuredClone(template);
        entry.name = artistName;
        entry.spotify = `https://open.spotify.com/artist/${artistId}`;

        entry.tags.push("external");
        entry.tags.push("CennoxX/spotify-ai-blocker");

        exportData.push(entry);
    });

    return exportData;
}