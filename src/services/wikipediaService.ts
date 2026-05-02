/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface WikiPage {
  pageid: number;
  title: string;
}

export interface RevisionChange {
  revid: number;
  timestamp: string;
  user: string;
  comment: string;
  imageName: string;
  isRevert?: boolean;
  isUndo?: boolean;
}

export interface ImageHistoryEntry extends RevisionChange {
  thumbnailUrl: string;
  originalUrl: string;
}

const WIKI_API_BASE = 'https://en.wikipedia.org/w/api.php';

async function fetchWiki(params: Record<string, string>) {
  const url = new URL(WIKI_API_BASE);
  params.origin = '*';
  params.format = 'json';
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Wiki API error: ${response.statusText}`);
  return response.json();
}

export const wikipediaService = {
  async searchPages(query: string): Promise<WikiPage[]> {
    if (!query) return [];
    const data = await fetchWiki({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: '10',
    });
    return data.query.search.map((s: any) => ({
      pageid: s.pageid,
      title: s.title,
    }));
  },

  async getArticleRevisions(title: string, limit = 3000): Promise<RevisionChange[]> {
    let allChanges: RevisionChange[] = [];
    let continueToken: string | undefined = undefined;
    let fetchedCount = 0;

    // Fetch newest to oldest to ensure we get the current state
    while (fetchedCount < limit) {
      const params: Record<string, string> = {
        action: 'query',
        prop: 'revisions',
        titles: title,
        rvprop: 'ids|timestamp|user|comment|content',
        rvlimit: 'max', 
      };
      if (continueToken) params.rvcontinue = continueToken;

      const data = await fetchWiki(params);
      const pageId = Object.keys(data.query.pages)[0];
      const page = data.query.pages[pageId];
      
      if (!page || !page.revisions) break;

      for (const rev of page.revisions) {
        const wikitext = rev['*'] || '';
        const imageName = this.extractInfoboxImage(wikitext);
        
        if (imageName) {
          const comment = rev.comment || '';
          allChanges.push({
            revid: rev.revid,
            timestamp: rev.timestamp,
            user: rev.user,
            comment: comment,
            imageName: imageName,
            isRevert: comment.toLowerCase().includes('revert') || comment.toLowerCase().includes('rvv') || comment.includes('m-'),
            isUndo: comment.startsWith('Undid revision'),
          });
        }
      }

      fetchedCount += page.revisions.length;
      continueToken = data.continue?.rvcontinue;
      if (!continueToken) break;
    }

    // Filter for significant changes
    const significantChanges: RevisionChange[] = [];
    let lastNormalizedName = '';
    
    // Process chronologically (oldest to newest) to detect changes
    // even though we fetched newest first
    const chronological = [...allChanges].reverse();
    
    for (const change of chronological) {
      const normalized = change.imageName.trim().toLowerCase().replace(/[\s_]+/g, '_');
      if (normalized !== lastNormalizedName) {
        significantChanges.push(change);
        lastNormalizedName = normalized;
      }
    }

    return significantChanges;
  },

  extractInfoboxImage(wikitext: string): string | null {
    if (!wikitext) return null;
    
    // 0. Preliminary cleanup: strip comments to avoid capturing them in parameters
    const cleanText = wikitext.replace(/<!--[\s\S]*?-->/g, '');

    // 1. Check for infobox image parameter
    // Handles aliases like image, photo, font_image, etc.
    // Handles parameters like |image1, |image_skyline, etc.
    const imageParamRegex = /\|\s*(?:image|photo|main_image|image_name|image_skyline|landscape|image1|image2)\s*=\s*([^|\n}]+)/i;
    const match = cleanText.match(imageParamRegex);
    
    if (match && match[1]) {
      let name = match[1].trim();
      
      // If it starts with {{ and ends with }} it might be a template, but check if it's an image template
      // If it contains more templates inside, it's likely complex.
      if (!name || name.length < 3) return null;

      // Remove [[File: prefix if present in the value
      name = name.replace(/^\[\[(?:File|Image|Media):/i, '').replace(/\]\]$/, '');
      
      // Strip other parameters if it's like Example.jpg|thumb|center
      name = name.split('|')[0].trim();
      
      // Basic validation: must NOT be just a template call like {{center|...}} unless the filename is inside
      if (name.includes('{{')) return null;
      
      return name;
    }

    // 2. Fallback: looking for any File/Image link at the top of the article
    const fileLinkRegex = /\[\[(?:File|Image|Media):([^|\]\n#]+)/i;
    const fileMatch = cleanText.substring(0, 4000).match(fileLinkRegex);
    if (fileMatch && fileMatch[1]) {
      const name = fileMatch[1].trim();
      if (name.length > 3) return name;
    }

    return null;
  },

  async getImageDetails(fileNames: string[]): Promise<Map<string, { thumb: string, original: string }>> {
    if (fileNames.length === 0) return new Map();
    
    const results = new Map<string, { thumb: string, original: string }>();
    
    // MediaWiki allows querying multiple files at once (usually max 50)
    // We prefix each with "File:"
    const prefixed = fileNames.map(f => f.startsWith('File:') || f.startsWith('Image:') ? f : `File:${f}`);
    
    const data = await fetchWiki({
      action: 'query',
      titles: prefixed.join('|'),
      prop: 'imageinfo',
      iiprop: 'url|thumbmsize',
      iiurlwidth: '400', // thumbnail width
    });

    if (data.query?.pages) {
      Object.values(data.query.pages).forEach((page: any) => {
        if (page.imageinfo?.[0]) {
          const info = page.imageinfo[0];
          // Use normalized title or strip File: prefix to match back
          const title = page.title.replace(/^(File|Image):/i, '');
          results.set(title, {
            thumb: info.thumburl,
            original: info.url
          });
        }
      });
    }

    return results;
  }
};
