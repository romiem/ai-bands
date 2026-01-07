const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000;

async function fetchWithRetry(url, options, attempt = 1) {
  const response = await fetch(url, options);

  if (!response.ok) {
    if (attempt < MAX_RETRIES) {
      console.log(`Attempt ${attempt} failed: HTTP ${response.status}. Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Create a Spotify API client
 * @param {Object} options
 * @param {string} options.clientId - Spotify client ID
 * @param {string} options.clientSecret - Spotify client secret
 */
export async function createSpotifyClient({ clientId, clientSecret }) {

  if (!clientId || !clientSecret) {
    throw new Error('clientId and clientSecret are required');
  }

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${tokenResponse.status} ${tokenResponse.statusText}`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  const headers = {
    'Authorization': `Bearer ${accessToken}`,
  };

  return {
    /**
     * Get a single artist by ID
     * @param {string} id - Spotify artist ID
     * @returns {Promise<Object>} Artist object
     */
    async getArtist(id) {
      return fetchWithRetry(`https://api.spotify.com/v1/artists/${id}`, { headers });
    },

    /**
     * Get an artist's top tracks
     * @param {string} id - Spotify artist ID
     * @param {string} [market='US'] - Market/country code
     * @returns {Promise<Object>} Top tracks response
     */
    async getArtistTopTracks(id, market = 'US') {
      return fetchWithRetry(`https://api.spotify.com/v1/artists/${id}/top-tracks?market=${market}`, { headers });
    },
  };
}
