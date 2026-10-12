#!/usr/bin/env node
/**
 * Fetch theme and language extensions from Open VSX and prepare them as built-in extensions.
 * Run via npm prebuild / predev scripts.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const extensionsDir = path.join(projectRoot, 'public', 'extensions');
const extensionsListPath = path.join(projectRoot, 'extensions.json');

// Ensure extensions directory exists
if (!fs.existsSync(extensionsDir)) {
  fs.mkdirSync(extensionsDir, { recursive: true });
}

// Read the extensions list
let extensionIds = [];
try {
  const content = fs.readFileSync(extensionsListPath, 'utf-8');
  extensionIds = JSON.parse(content);
} catch (err) {
  console.error(`❌ Failed to read extensions.json: ${err.message}`);
  process.exit(1);
}

const manifest = {
  builtinExtensions: [],
};

async function fetchExtension(extensionId) {
  const [publisher, name] = extensionId.split('.');
  if (!publisher || !name) {
    console.warn(`⚠️  Invalid extension ID: ${extensionId}`);
    return;
  }

  const apiUrl = `https://open-vsx.org/api/${publisher}/${name}`;
  const targetDir = path.join(extensionsDir, `${publisher}.${name}`);

  return new Promise((resolve) => {
    https
      .get(apiUrl, { timeout: 10000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', async () => {
          try {
            const metadata = JSON.parse(data);
            if (!metadata.files || !metadata.files.download) {
              console.warn(
                `⚠️  No download URL for ${extensionId} from Open VSX`
              );
              resolve();
              return;
            }

            const downloadUrl = metadata.files.download;
            const vsixPath = path.join(
              projectRoot,
              `.temp-${publisher}-${name}.vsix`
            );

            // Download VSIX
            await downloadFile(downloadUrl, vsixPath);

            // Extract VSIX
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }

            try {
              execSync(`unzip -q "${vsixPath}" -d "${targetDir}"`, {
                stdio: 'pipe',
              });
            } catch (err) {
              // Fallback: try with Node.js built-in if unzip fails
              console.warn(
                `⚠️  Could not unzip with system unzip for ${extensionId}, attempting fallback`
              );
              // Could use a npm package like 'unzipper' but keeping minimal deps
              // For now, we'll skip if unzip fails
              if (fs.existsSync(vsixPath)) {
                fs.unlinkSync(vsixPath);
              }
              resolve();
              return;
            }

            // Clean up temp VSIX file
            if (fs.existsSync(vsixPath)) {
              fs.unlinkSync(vsixPath);
            }

            manifest.builtinExtensions.push({
              id: extensionId,
              path: `./extensions/${publisher}.${name}`,
            });

            console.log(`✅ Fetched and extracted: ${extensionId}`);
            resolve();
          } catch (err) {
            console.warn(
              `⚠️  Failed to process ${extensionId}: ${err.message}`
            );
            resolve();
          }
        });
      })
      .on('error', (err) => {
        console.warn(`⚠️  Network error fetching ${extensionId}: ${err.message}`);
        resolve();
      });
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, { timeout: 30000 }, (res) => {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      })
      .on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

async function main() {
  console.log(`📦 Fetching ${extensionIds.length} extensions from Open VSX...`);

  // Process extensions sequentially to avoid rate limits
  for (const extensionId of extensionIds) {
    await fetchExtension(extensionId);
  }

  // Write manifest
  const manifestPath = path.join(extensionsDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(
    `✅ Manifest written to ${manifestPath} (${manifest.builtinExtensions.length} extensions)`
  );
}

main().catch((err) => {
  console.error(`❌ Fatal error: ${err.message}`);
  process.exit(1);
});
