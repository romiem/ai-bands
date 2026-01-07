/**
 * Create a SubmitHub API client
 * @param {Object} options
 * @param {string} options.apiKey - SubmitHub API key
 */
export function createSubmitHubClient({ apiKey }) {
  if (!apiKey) {
    throw new Error('apiKey is required');
  }

  const headers = {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json'
  };

  return {
    /**
     * Detect if a track is AI-generated
     * @param {string} spotifyTrackId - Spotify track ID
     * @returns {Promise<Object>} Detection result
     */
    async detectTrack(spotifyTrackId) {
      const response = await fetch('https://shlabs.music/api/v1/detect', {
        method: 'POST',
        headers,
        body: JSON.stringify({ spotifyTrackId })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    }
  };
}
