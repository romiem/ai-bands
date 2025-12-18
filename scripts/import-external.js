import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { getTemplate } from './get-template.js';

async function getExternalArtists() {
    // ======================================================================
    // #region IMPORT CODE - Add import code here, then run the script
    // The code should set `externalArtists` to an array of artist objects.
    // Example:
    //   const externalArtists = [
    //     { name: "Artist Name", spotify: "https://open.spotify.com/artist/..." },
    //   ];
    // ======================================================================

    const externalArtists = [];
    
    const re = await fetch('https://raw.githubusercontent.com/CennoxX/spotify-ai-blocker/refs/heads/main/SpotifyAiArtists.csv');
    const data = await re.text();
    const csv = data.split('\n').map(line => line.split(','));
    const header = csv.shift();

    csv.forEach(row => {
        const artistName = row[0];
        const artistId = row[1];

        const entry = getTemplate();
        entry.name = artistName;
        entry.spotify = `https://open.spotify.com/artist/${artistId}`;

        externalArtists.push(entry);
    });

    // #endregion IMPORT CODE
    // ======================================================================  
    return externalArtists;
}

// Example functions from previous imports:
// async function getExternalArtists() {
//     // ======================================================================
//     // #region IMPORT CODE - Add import code here, then run the script
//     // The code should set `externalArtists` to an array of artist objects.
//     // Example:
//     //   const externalArtists = [
//     //     { name: "Artist Name", spotify: "https://open.spotify.com/artist/..." },
//     //   ];
//     // ======================================================================

//     const externalArtists = [];


//     // #endregion IMPORT CODE
//     // ======================================================================  
//     return externalArtists;
// }

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');
const SCHEMA_PATH = path.join(ROOT_DIR, 'artist.schema.json');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const schemaRaw = fs.readFileSync(SCHEMA_PATH, 'utf8');
const schema = JSON.parse(schemaRaw);
const validate = ajv.compile(schema);

// Helper functions
const isEmpty = (value) => value === null || value === undefined || value === '';
const generateRandomSuffix = () => crypto.randomBytes(6).toString('hex');
const getCurrentDate = () => new Date().toISOString().split('T')[0];
const slugify = (name) => {
    if (!name) return '';

    // First pass: ASCII-friendly slug
    const asciiSlug = name
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/--+/g, '-');
    if (asciiSlug) return asciiSlug;

    // Fallback: hex codepoints for non-ASCII names (e.g., Chinese)
    const hexSlug = [...name]
        .map(c => `u${(c.codePointAt(0) || 0).toString(16)}`)
        .join('-')
        .replace(/--+/g, '-');

    return hexSlug || 'imported-artist';
};

const buildIdFromName = (name) => {
    const base = slugify(name);
    return base || 'imported-artist';
};
const makeUniqueId = (baseId, existingIds) => {
    let candidate = baseId;
    while (existingIds.has(candidate)) {
        candidate = `${baseId}-${generateRandomSuffix()}`;
    }
    return candidate;
};

// Get URI fields from schema
const uriFields = Object.keys(schema.properties).filter(
    key => schema.properties[key]?.format === 'uri'
);

// Load all existing artist files
const loadExistingArtists = () => {
    const fileNames = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.json'));
    return fileNames.map(filename => {
        try {
            const filePath = path.join(SRC_DIR, filename);
            const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return { filename, data: json, filePath };
        } catch {
            return null;
        }
    }).filter(Boolean);
};

// Build a map of URIs to existing artist files
const buildUriMap = (existingArtists) => {
    const uriMap = new Map();
    for (const artist of existingArtists) {
        for (const field of uriFields) {
            const uri = artist.data[field];
            if (!isEmpty(uri)) {
                uriMap.set(uri, artist);
            }
        }
    }
    return uriMap;
};

// Merge two artists, preferring non-empty values from the second; track whether anything new was added
const mergeArtists = (existing, incoming) => {
    const merged = { ...existing };
    let changed = false;

    for (const [key, value] of Object.entries(incoming)) {
        if (key === 'tags') {
            const existingTags = Array.isArray(merged.tags) ? merged.tags : [];
            const incomingTags = Array.isArray(value) ? value : [];
            const mergedTags = [...new Set([...existingTags, ...incomingTags])];
            if (mergedTags.length !== existingTags.length) {
                changed = true;
            }
            merged.tags = mergedTags;
        } else if (isEmpty(merged[key]) && !isEmpty(value)) {
            merged[key] = value;
            changed = true;
        }
    }

    return { merged, changed };
};

// Merge duplicate artists within an import list based on shared URIs
const mergeDuplicatesInList = (artists) => {
    const merged = [];
    const processedIndices = new Set();

    for (let i = 0; i < artists.length; i++) {
        if (processedIndices.has(i)) continue;

        let mergedArtist = { ...artists[i] };
        const currentURIs = uriFields
            .map(field => artists[i][field])
            .filter(uri => !isEmpty(uri));

        for (let j = i + 1; j < artists.length; j++) {
            if (processedIndices.has(j)) continue;

            const otherURIs = uriFields
                .map(field => artists[j][field])
                .filter(uri => !isEmpty(uri));

            const hasSharedURI = currentURIs.some(uri => otherURIs.includes(uri));

            if (hasSharedURI) {
                mergedArtist = mergeArtists(mergedArtist, artists[j]);
                processedIndices.add(j);

                // Update current URIs to include newly merged URIs
                uriFields.forEach(field => {
                    const uri = mergedArtist[field];
                    if (!isEmpty(uri) && !currentURIs.includes(uri)) {
                        currentURIs.push(uri);
                    }
                });
            }
        }
        merged.push(mergedArtist);
        processedIndices.add(i);
    }

    return merged;
};

// Main import function
const importExternalArtists = async () => {
    console.log('Loading existing artists...');
    const existingArtists = loadExistingArtists();
    const uriMap = buildUriMap(existingArtists);
    const existingIds = new Set(existingArtists.map(a => a.data.id).filter(Boolean));
    console.log(`Found ${existingArtists.length} existing artists.`);
    
    const externalArtists = await getExternalArtists();

    if (externalArtists.length === 0) {
        console.log('No external artists to import. Add import code to the region block.');
        return;
    }

    console.log(`Processing ${externalArtists.length} external artists...`);

    // Merge duplicates within the import list
    const mergedExternalArtists = mergeDuplicatesInList(externalArtists);
    console.log(`After merging duplicates: ${mergedExternalArtists.length} artists.`);

    const template = getTemplate();
    const currentDate = getCurrentDate();

    let imported = 0;
    let modified = 0;
    let skipped = 0;

    for (const artist of mergedExternalArtists) {
        // Check if any URI matches an existing artist
        let matchingExisting = null;
        for (const field of uriFields) {
            const uri = artist[field];
            if (!isEmpty(uri) && uriMap.has(uri)) {
                matchingExisting = uriMap.get(uri);
                break;
            }
        }

        if (matchingExisting) {
            // Merge with existing artist and mark as external-modified only if something new was added
            const { merged, changed } = mergeArtists(matchingExisting.data, artist);

            if (!changed) {
                // No new data added; skip tagging or writing
                continue;
            }

            const tags = Array.isArray(merged.tags) ? merged.tags : [];
            if (!tags.includes('external')) {
                if (!tags.includes('external-modified')) {
                    tags.push('external-modified');
                }
            }
            merged.tags = tags;
            merged.dateUpdated = currentDate;

            fs.writeFileSync(matchingExisting.filePath, JSON.stringify(merged, null, 2) + '\n');
            console.log(`  Modified: ${merged.name} (${matchingExisting.filename})`);
            modified++;
        } else {
            // Create new artist entry
            const newArtist = { ...template, ...artist };

            // Set required fields
            newArtist.name = artist.name || '[Unknown Name]';
            const baseId = buildIdFromName(newArtist.name);
            newArtist.id = makeUniqueId(baseId, existingIds);
            newArtist.dateAdded = currentDate;
            newArtist.dateUpdated = null;

            // Add external tag
            const tags = Array.isArray(newArtist.tags) ? newArtist.tags : [];
            // Remove any source-specific tags, keep only standard tags
            const TAG_ENUM = schema.properties.tags.items?.enum || [];
            newArtist.tags = tags.filter(tag => TAG_ENUM.includes(tag) || tag === 'external' || tag === 'external-modified');
            if (!newArtist.tags.includes('external')) {
                newArtist.tags.push('external');
            }

            // Validate before saving
            const valid = validate(newArtist);
            if (!valid) {
                console.error(`  ❌ Validation failed for "${newArtist.name}":`);
                for (const e of validate.errors) {
                    console.error(`    ${e.instancePath} ${e.message}`);
                }
                skipped++;
                continue;
            }

            // Generate filename, append suffixes if needed to avoid collisions
            const baseFilename = slugify(newArtist.name) || 'imported-artist';
            let filename = `${baseFilename}.json`;
            let filePath = path.join(SRC_DIR, filename);
            while (fs.existsSync(filePath)) {
                filename = `${baseFilename}-${generateRandomSuffix()}.json`;
                filePath = path.join(SRC_DIR, filename);
            }

            // Write new file
            fs.writeFileSync(filePath, JSON.stringify(newArtist, null, 2) + '\n');
            console.log(`  Imported: ${newArtist.name} (${filename})`);

            // Track the new id to avoid clashes within the same run
            existingIds.add(newArtist.id);

            // Add to URI map to avoid duplicates in this run
            for (const field of uriFields) {
                const uri = newArtist[field];
                if (!isEmpty(uri)) {
                    uriMap.set(uri, { filename, data: newArtist, filePath });
                }
            }

            imported++;
        }
    }

    console.log('\n=== Import Summary ===');
    console.log(`  New artists imported: ${imported}`);
    console.log(`  Existing artists modified: ${modified}`);
    console.log(`  Skipped (validation/collision): ${skipped}`);
    console.log('======================\n');
};

importExternalArtists().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
});
