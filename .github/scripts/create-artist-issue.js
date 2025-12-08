import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const payload = JSON.parse(process.env.PAYLOAD);

const issueBody = [
  `{name}: ${payload.name}`,
  `{comments}: ${payload.comments}`,
  `{tags}: ${payload.tags}`,
  `{spotify}: ${payload.spotify}`,
  `{apple}: ${payload.apple}`,
  `{amazon}: ${payload.amazon}`,
  `{youtube}: ${payload.youtube}`,
  `{instagram}: ${payload.instagram}`,
  `{tiktok}: ${payload.tiktok}`,
  `{urls}: ${payload.urls}`,
].join('\n');

octokit.issues.create({
  owner,
  repo,
  title: `Artist Submission: ${payload.name}`,
  body: issueBody,
  labels: ['artist-submission']
});