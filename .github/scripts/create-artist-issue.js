import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const payload = JSON.parse(process.env.PAYLOAD);
const data = payload.data;

const issueBody = [
  `{name}: ${data.name}`,
  `{comments}: ${data.comments}`,
  `{tags}: ${data.tags}`,
  `{spotify}: ${data.spotify}`,
  `{apple}: ${data.apple}`,
  `{amazon}: ${data.amazon}`,
  `{youtube}: ${data.youtube}`,
  `{instagram}: ${data.instagram}`,
  `{tiktok}: ${data.tiktok}`,
  `{urls}: ${data.urls}`,
].join('\n');

octokit.issues.create({
  owner,
  repo,
  title: `Artist Submission: ${data.name}`,
  body: issueBody,
  labels: [data.confidenceScore >= 3 ? 'artist-submission:high' : 'artist-submission:low'],
});