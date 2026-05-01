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

  async getArticleRevisions(title: string, limit = 500): Promise<RevisionChange[]> {
    // We fetch revisions in batches. 
    // To find image changes, we need the wikitext content.
    // NOTE: For very large articles, this might be partial history.
    let allChanges: RevisionChange[] = [];
    let continueToken: string | undefined = undefined;
    let fetchedCount = 0;

    // We fetch a maximum of "limit" revisions to balance performance
    while (fetchedCount < limit) {
      const params: Record<string, string> = {
        action: 'query',
        prop: 'revisions',
        titles: title,
        rvprop: 'ids|timestamp|user|comment|content',
        rvlimit: 'max', // max is usually 50 for content
      };
      if (continueToken) params.rvcontinue = continueToken;

      const data = await fetchWiki(params);
      const pageId = Object.keys(data.query.pages)[0];
      const page = data.query.pages[pageId];
      
      if (!page.revisions) break;

      for (const rev of page.revisions) {
        const wikitext = rev['*'] || '';
        const imageName = this.extractInfoboxImage(wikitext);
        
        // We only care about revisions where an image was found
        if (imageName) {
          allChanges.push({
            revid: rev.revid,
            timestamp: rev.timestamp,
            user: rev.user,
            comment: rev.comment || '',
            imageName: imageName,
          });
        }
      }

      fetchedCount += page.revisions.length;
      continueToken = data.continue?.rvcontinue;
      if (!continueToken) break;
    }

    // Now filter only for when the image name actually changed relative to the previous revision in history
    // (Wikipedia history is returned newest first by default)
    const significantChanges: RevisionChange[] = [];
    let currentImage = '';
    
    // Reverse to process chronologically
    const chronological = [...allChanges].reverse();
    
    for (const change of chronological) {
      if (change.imageName !== currentImage) {
        significantChanges.push(change);
        currentImage = change.imageName;
      }
    }

    return significantChanges;
  },

  extractInfoboxImage(wikitext: string): string | null {
    // Look for common image parameters in Infobox templates
    // Standard formats: | image = Example.jpg or |image=Example.jpg
    // Also handles [[File:Example.jpg|thumb|...]]
    
    // 1. Check for infobox image parameter
    const imageParamRegex = /\|\s*(?:image|photo|main_image|image_name)\s*=\s*([^|\n}]+)/i;
    const match = wikitext.match(imageParamRegex);
    if (match && match[1]) {
      let name = match[1].trim();
      // Remove [[File: prefix if present in the value
      name = name.replace(/^\[\[(?:File|Image):/i, '').replace(/\]\]$/, '');
      // Strip other parameters if it's like Example.jpg|thumb
      name = name.split('|')[0].trim();
      return name || null;
    }

    // 2. Fallback: looking for any File/Image link at the top of the article
    // This is less reliable for "infobox" but helps catch articles without standard templates
    const fileLinkRegex = /\[\[(?:File|Image):([^|\]]+)/i;
    const fileMatch = wikitext.substr(0, 2000).match(fileLinkRegex);
    if (fileMatch && fileMatch[1]) {
      return fileMatch[1].trim();
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
