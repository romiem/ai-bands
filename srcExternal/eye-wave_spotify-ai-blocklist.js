import { getTemplate } from "../scripts/get-template.js";
const template = getTemplate();

export default async () => {
    const re = await fetch('https://raw.githubusercontent.com/eye-wave/spotify-ai-blocklist/refs/heads/main/ai-trashbin.json');
    const json = await re.json();

    const artists = Object.keys(json.artists);
    const spotifyIds = artists.map(artist => artist.split(":")[2]).filter(Boolean);

    if (!spotifyIds.length) {
        throw new Error("External format changed, update external parser");
    }

    const exportData = [];

    spotifyIds.forEach(artistId => {
        const entry = structuredClone(template);
        entry.spotify = `https://open.spotify.com/artist/${artistId}`;

        entry.tags.push("external");
        entry.tags.push("eye-wave/spotify-ai-blocklist");

        exportData.push(entry);
    });

    return exportData;
}