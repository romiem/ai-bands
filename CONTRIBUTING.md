# Contributing  

### New contribution instructions:

If you want to contribute by adding new bands, please create a pull request (PR) with a new JSON file inside the `src/` folder. The filename should be based on the artist name converted to **kebab case** (lowercase, spaces replaced by hyphens, and non-alphanumeric characters removed or replaced appropriately).

Each JSON file should follow this schema:

```javascript
{
  "name": "Artist name goes here",
  "comments": "Self-declared as an AI project.", // Set to null if there are no comments
  "tags": [], // String tags (this is a new feature coming shortly)
  "spotify": "https://open.spotify.com/artist/1s7brFQBWfA9z2YR7bl9nh", // Spotify link (ensure to use a clean link)
  "apple": "https://music.apple.com/us/artist/bad-apples/1840951325", // Apple Music link (use a US link if possible) - use null if it doesn't exist
  "youtube": "https://www.youtube.com/@BABandOfficial", // Use null if nothing exists
  "instagram": null, // URL or null
  "tiktok": null, // URL or null
  "urls": [] // Supporting evidence (reddit links, blog post etc)
}
```

### Non Git users

Feel free to send me a direct message on X or Reddit with the artist details, but please try to include Spotify, Apple Music and social links so I don't have to do the research myself.

**_Specifically, please cite in your message why you suspect the band is AI generated along with links to the band's Spotify/Apple Music/YouTube page and additional social media accounts. Also, if you have supporting evidence from Reddit etc., please send that too._**
