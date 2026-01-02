import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');

const SPOTIFY_API_URL = 'https://api.spotify.com/v1/artists';
const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000;

async function getAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET environment variables are required');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchWithRetry(url, options, attempt = 1) {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (attempt < MAX_RETRIES) {
      console.log(`Attempt ${attempt} failed: ${error.message}. Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw error;
  }
}

async function fetchArtistsBatch(spotifyIds, accessToken) {
  const ids = spotifyIds.join(',');
  const url = `${SPOTIFY_API_URL}?ids=${ids}`;

  const data = await fetchWithRetry(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  return data.artists;
}

function loadArtistFiles() {
  const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.json'));
  const artists = [];

  for (const file of files) {
    const filePath = path.join(SRC_DIR, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const obj = JSON.parse(raw);
    artists.push({ file, filePath, data: obj });
  }

  return artists;
}

function saveArtistFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

async function main() {
  console.log('Starting Spotify genres update...');

  const accessToken = await getAccessToken();
  console.log('Successfully authenticated with Spotify API');

  const artists = loadArtistFiles();
  console.log(`Loaded ${artists.length} artist files`);

  // Filter artists with Spotify IDs
  const artistsWithSpotify = artists.filter(a => a.data.spotify);
  console.log(`Found ${artistsWithSpotify.length} artists with Spotify IDs`);

  // Process in batches of 50
  let updatedCount = 0;

  for (let i = 0; i < artistsWithSpotify.length; i += BATCH_SIZE) {
    const batch = artistsWithSpotify.slice(i, i + BATCH_SIZE);
    const spotifyIds = batch.map(a => a.data.spotify);

    console.log(`Fetching batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(artistsWithSpotify.length / BATCH_SIZE)} (${spotifyIds.length} artists)...`);

    try {
      const spotifyArtists = await fetchArtistsBatch(spotifyIds, accessToken);

      // Map Spotify responses to our artists
      for (const spotifyArtist of spotifyArtists) {
        if (!spotifyArtist) continue; // Artist may not exist on Spotify

        const artist = batch.find(a => a.data.spotify === spotifyArtist.id);
        if (!artist) continue;

        const newGenres = spotifyArtist.genres || [];
        const currentGenres = artist.data.genres || [];

        // Check if genres have changed
        const genresChanged =
          newGenres.length !== currentGenres.length ||
          !newGenres.every(g => currentGenres.includes(g));

        if (genresChanged) {
          artist.data.genres = newGenres;
          saveArtistFile(artist.filePath, artist.data);
          console.log(`  Updated genres for ${artist.data.name}: ${newGenres.join(', ') || '(none)'}`);
          updatedCount++;
        }
      }
    } catch (error) {
      console.error(`Failed to fetch batch starting at index ${i}: ${error.message}`);
      process.exit(1);
    }

    // Small delay between batches to be nice to the API
    if (i + BATCH_SIZE < artistsWithSpotify.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`\nUpdate complete. ${updatedCount} artist(s) updated.`);
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
