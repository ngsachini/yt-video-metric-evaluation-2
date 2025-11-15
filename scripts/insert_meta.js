// Insert API base meta tag into public/index.html during build.
// Reads process.env.API_BASE (set in Amplify Console) and injects
// <meta name="api-base" content="..."> inside the <head> section.

import fs from 'fs/promises';
import path from 'path';

async function run() {
  try {
    const apiBase = process.env.API_BASE || '';
    const indexPath = path.join(process.cwd(), 'public', 'index.html');
    let html = await fs.readFile(indexPath, 'utf8');
    const metaTag = `<meta name="api-base" content="${apiBase}">`;

    if (html.includes('<meta name="api-base"')) {
      html = html.replace(/<meta name="api-base"[^>]*>/, metaTag);
    } else {
      html = html.replace(/<head(\s|>)/i, `<head$1\n    ${metaTag}`);
    }

    await fs.writeFile(indexPath, html, 'utf8');
    console.log('Inserted API_BASE meta tag into public/index.html');
  } catch (err) {
    console.warn('Could not insert API_BASE meta tag:', err.message || err);
    // Don't fail the build for this step; continue
  }
}

run();
