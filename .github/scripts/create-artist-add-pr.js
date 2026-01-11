import fs from 'fs';
import path from 'path';
import { Octokit } from '@octokit/rest';
import slugify from '@sindresorhus/slugify';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
// import { createSpotifyClient } from './spotify.js';
// import { createSubmitHubClient } from './submithub.js';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');
const SCHEMA_PATH = path.join(ROOT_DIR, 'artist.schema.json');
const ARTISTS_PATH = path.join(ROOT_DIR, 'dist', 'artists.json');

const artistsRaw = fs.readFileSync(ARTISTS_PATH, 'utf8');
const artists = JSON.parse(artistsRaw);
const schemaRaw = fs.readFileSync(SCHEMA_PATH, 'utf8');
const schema = JSON.parse(schemaRaw);

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const { GITHUB_TOKEN, REPO, ISSUE_NUMBER, ISSUE_BODY, COMMENT_ID, GITHUB_OUTPUT } = process.env;
const [owner, repo] = REPO?.split('/') || [];

const octokit = new Octokit({ auth: GITHUB_TOKEN });


/**
 * Order and transform properties to match schema
 */
const transformAndOrder = (input) => {
  const data = { ...input };

  // Use the artist schema's required keys for ordering
  const orderedKeys = schema.required;

  const ordered = {};
  for (const key of orderedKeys) {
    if (key in data) ordered[key] = data[key];
  }
  for (const key in data) {
    if (!(key in ordered)) ordered[key] = data[key];
  }

  return ordered;
};

/**
 * Extract JSON from a text containing a code block
 */
const extractJSON = (text) => {
  const match = text.match(/```json\s*\n([\s\S]*?)\n```/);
  return match ? match[1] : null;
};

/**
 * Get content to parse from issue body or most recent comment
 */
const getContentToParse = async () => {
  const comments = await octokit.issues.listComments({ owner, repo, issue_number: ISSUE_NUMBER });
  const sortedComments = comments.data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  for (const comment of sortedComments) {
    const json = extractJSON(comment.body);
    if (json) {
      console.log('Using comment from', comment.created_at);
      return json;
    }
  }

  const json = extractJSON(ISSUE_BODY);
  if (json) {
    console.log('Using issue body');
    return json;
  }

  throw new Error('No JSON code block found in issue body or comments');
};

/**
 * Create unique filename for artist
 */
const createUniqueFilePath = (artistName) => {
  const baseName = slugify(artistName, { decamelize: false });
  let fileName = `${baseName}.json`;
  let filePath = path.join(SRC_DIR, fileName);

  let counter = 2;
  while (fs.existsSync(filePath)) {
    fileName = `${baseName}-${counter}.json`;
    filePath = path.join(SRC_DIR, fileName);
    counter++;
  }

  return { fileName, filePath };
};

/**
 * Set GitHub Actions output
 */
const setOutput = (key, value) => {
  if (GITHUB_OUTPUT) {
    fs.appendFileSync(GITHUB_OUTPUT, `${key}=${value}\n`);
  }
};


/**
 * Main execution
 */
const main = async () => {
  try {
    // Get and parse content
    const content = await getContentToParse();
    console.log('Received content:', content, '\n---');

    const artistData = JSON.parse(content);
    if (!artistData.name) {
      throw new Error('Artist name is required');
    }

    // Check for duplicate entries
    if (artistData.spotify && artists.find(a => a.spotify === artistData.spotify))
      throw new Error('Spotify url already exists in database.');
    if (artistData.apple && artists.find(a => a.apple === artistData.apple))
      throw new Error('Apple url already exists in database.');
    if (artistData.amazon && artists.find(a => a.amazon === artistData.amazon))
      throw new Error('Amazon url already exists in database.');
    if (artistData.youtube && artists.find(a => a.youtube === artistData.youtube))
      throw new Error('YouTube url already exists in database.');

    const { fileName, filePath } = createUniqueFilePath(artistData.name);
    artistData.id = fileName.replace(/\.json$/, '');
    artistData.dateAdded = new Date().toISOString();
    artistData.dateUpdated = null;
    if (typeof artistData.tags === 'string') {
      artistData.tags = artistData.tags.split(',').map(s => s.trim()).filter(Boolean);
    } else if (!Array.isArray(artistData.tags)) {
      artistData.tags = [];
    }

    let genres = [];
    let followers = null;
    let popularity = null;
    let shScore = null;

    // if (artistData.spotify) {
    //   try {
    //     const spotify = await createSpotifyClient({
    //       clientId: process.env.SPOTIFY_CLIENT_ID,
    //       clientSecret: process.env.SPOTIFY_CLIENT_SECRET
    //     });

    //     const artist = await spotify.getArtist(artistData.spotify);
    //     genres = artist?.genres || [];
    //     popularity = artist?.popularity ?? null;
    //     followers = artist?.followers?.total ?? null;

    //     try {
    //       const submithub = createSubmitHubClient({ apiKey: process.env.SUBMITHUB_API_KEY });
    //       const topTracksResponse = await spotify.getArtistTopTracks(artistData.spotify);
    //       const tracks = topTracksResponse.tracks || [];

    //       const recentTracks = tracks
    //         .sort((a, b) => new Date(b.album.release_date) - new Date(a.album.release_date))
    //         .slice(0, 3);

    //       if (recentTracks.length > 0) {
    //         const scores = [];

    //         for (const track of recentTracks) {
    //           try {
    //             const result = await submithub.detectTrack(track.id);
    //             scores.push(result.result.probability_ai_generated);
    //           } catch {
    //             // Skip tracks that fail detection
    //           }
    //         }

    //         if (scores.length > 0) {
    //           const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    //           shScore = Math.round(average * 100) / 100;
    //         }
    //       }
    //     } catch (error) {
    //       console.log(`Failed to fetch shScore: ${error.message}`);
    //     }

    //   } catch (error) {
    //     console.log(`Failed to fetch Spotify data: ${error.message}`);
    //   }
    // }

    artistData.genres = genres;
    artistData.popularity = popularity;
    artistData.followers = followers;
    artistData.shScore = shScore;

    if (!validate(artistData)) {
      console.error('Validation errors:', validate.errors);
      throw new Error('Artist data does not match schema');
    }

    const orderedData = transformAndOrder(artistData);
    const branchName = `artist/${orderedData.id}`;

    // Write artist file
    fs.writeFileSync(filePath, JSON.stringify(orderedData, null, 2) + '\n');
    console.log(`Artist file created: src/${fileName}`);

    // Set outputs for subsequent workflow steps
    setOutput('filename', fileName);
    setOutput('artist_name', orderedData.name);
    setOutput('branch_name', branchName);

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

main();
