import { Octokit } from '@octokit/rest';
import fs from 'fs';
import path from 'path';
// import { createSpotifyClient } from './spotify.js';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const payload = JSON.parse(process.env.PAYLOAD);
const data = payload.data;

const schemaPath = path.join(process.cwd(), 'artist.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const propertyOrder = Object.keys(schema.properties);

const orderedData = {};
for (const key of propertyOrder) {
  orderedData[key] = data[key];
}

// Convert comma-delimited strings to arrays for tags, default to empty array
orderedData.tags = orderedData.tags && typeof orderedData.tags === 'string' ? orderedData.tags.split(',').map(s => s.trim()) : [];

// Trim strings and set empty to null
for (const key in orderedData) {
  if (typeof orderedData[key] === 'string') {
    const trimmed = orderedData[key].trim();
    orderedData[key] = trimmed === '' ? null : trimmed;
  }
}

// Create link to souloverai.com submission form with prefilled data
const params = Object.keys(orderedData)
  .map(key => {
    let value = orderedData[key];
    if (Array.isArray(value)) {
      if (value.length === 0) return null;
      value = value.join(',');
    } else if (value === null || value === undefined) {
      return null;
    }
    const encodedValue = encodeURIComponent(value)
      .replace(/\(/g, '%28') // left parenthesis
      .replace(/\)/g, '%29'); // right parenthesis
    return `${key}=${encodedValue}`;
  })
  .filter(Boolean)
  .join('&');

const link = `[Review changes](https://souloverai.com/add?${params})`;
const issueBody = `\`\`\`json\n${JSON.stringify(orderedData, null, 2)}\n\`\`\`\n\n${link}`;

// If an issue with the same artist name exists, add a comment instead of creating a new issue
(async () => {
  const searchQuery = `repo:${owner}/${repo} is:issue is:open in:title "Add Artist: ${data.name}"`;
  const searchResults = await octokit.search.issuesAndPullRequests({ q: searchQuery });

  // Add comment
  if (searchResults.data.items.length > 0) {
    const existingIssue = searchResults.data.items[0];
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: existingIssue.number,
      body: issueBody,
    });
  }

  // Add new issue
  else {
    // Determine label based on Spotify followers/popularity
    // let label = 'add-artist:low';
    // if (data.spotify) {
    //   try {
    //     const spotify = await createSpotifyClient({
    //       clientId: process.env.SPOTIFY_CLIENT_ID,
    //       clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    //     });
    //     const artist = await spotify.getArtist(data.spotify);
    //     const followers = artist.followers.total;
    //     const popularity = artist.popularity;

    //     if (followers >= 5000 || popularity >= 40) {
    //       label = 'add-artist:high';
    //     } else if (followers <= 200 && popularity < 15) {
    //       label = 'add-artist:trash';
    //     }
    //   } catch (err) {
    //     console.warn('Failed to fetch Spotify data, defaulting to low priority:', err.message);
    //   }
    // }
    const label = data.submissionScore >= 3 ? 'add-artist:high' : 'add-artist:low';

    await octokit.issues.create({
      owner,
      repo,
      title: `Add Artist: ${data.name}`,
      body: issueBody,
      labels: [label],
    });
  }
})();