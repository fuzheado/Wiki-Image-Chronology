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
  source?: 'Wikipedia' | 'Wikidata';
  sizeDiff?: number;
}

export interface ImageHistoryEntry extends RevisionChange {
  thumbnailUrl: string;
  originalUrl: string;
}

const WIKI_API_BASE = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_API_BASE = 'https://www.wikidata.org/w/api.php';

async function fetchWiki(params: Record<string, string>, base = WIKI_API_BASE) {
  const url = new URL(base);
  params.origin = '*';
  params.format = 'json';
  Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
  
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Wiki API error: ${response.statusText}`);
  return response.json();
}

/**
 * Simple concurrency-limited queue for heavy API calls
 */
class ConcurrencyQueue {
  private running = 0;
  private queue: (() => void)[] = [];
  constructor(private limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.queue.shift()?.();
    }
  }
}

const parseQueue = new ConcurrencyQueue(5);

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

  async getArticleRevisions(
    title: string, 
    limit = 500,
    onProgress?: (progress: { phase: string; count: number; total?: number }) => void,
    startToken?: string
  ): Promise<{ events: RevisionChange[]; continueToken?: string; totalFetched: number }> {
    let candidateEvents: RevisionChange[] = [];
    let continueToken: string | undefined = startToken;
    let fetchedCount = 0;
    let qid: string | null = null;
    
    // For batch-to-batch comparison
    let lastProcessedRevRaw: string | null = null;

    onProgress?.({ phase: 'Synchronizing History', count: 0, total: limit });
    
    // Phase 1 (The Sweep): Fetch revision history in batches of 50 with content
    let lastRevisionInBatch: any = null;

    while (fetchedCount < limit) {
      const params: Record<string, string> = {
        action: 'query',
        prop: 'revisions|pageprops',
        titles: title,
        rvprop: 'ids|timestamp|user|comment|size|content',
        rvlimit: '50', 
      };
      if (continueToken) params.rvcontinue = continueToken;

      const data = await fetchWiki(params);
      if (!data.query?.pages) break;

      const pageId = Object.keys(data.query.pages)[0];
      const page = data.query.pages[pageId];
      
      if (!page || page.missing === "") break;
      if (!qid && page.pageprops?.wikibase_item) qid = page.pageprops.wikibase_item;
      if (!page.revisions) break;

      const revisions = page.revisions;

      // Handle the gap between the last batch and this one
      if (lastRevisionInBatch) {
        const newerRaw = this.extractRawImageParam(lastRevisionInBatch['*'] || '');
        const olderRaw = this.extractRawImageParam(revisions[0]['*'] || '');
        if (newerRaw !== olderRaw) {
          await this.processCandidate(lastRevisionInBatch, newerRaw, olderRaw, candidateEvents);
        }
      }
      
      for (let i = 0; i < revisions.length; i++) {
        const currentRev = revisions[i];
        const nextOlderRev = revisions[i + 1]; 
        
        const isInitial = !startToken && fetchedCount === 0 && i === 0;
        const currentRaw = this.extractRawImageParam(currentRev['*'] || '');
        
        if (isInitial) {
          const olderRaw = nextOlderRev ? this.extractRawImageParam(nextOlderRev['*'] || '') : null;
          await this.processCandidate(currentRev, currentRaw, olderRaw, candidateEvents);
        } else if (nextOlderRev) {
          const olderRaw = this.extractRawImageParam(nextOlderRev['*'] || '');
          if (currentRaw !== olderRaw) {
            await this.processCandidate(currentRev, currentRaw, olderRaw, candidateEvents);
          }
        }
      }

      lastRevisionInBatch = revisions[revisions.length - 1];
      
      fetchedCount += revisions.length;
      onProgress?.({ phase: 'Sweeping Revisions', count: fetchedCount, total: limit });
      
      continueToken = data.continue?.rvcontinue;
      if (!continueToken) break;
    }

    // Phase 3: Wikidata "Ghost" Check (Only on initial load)
    let wikidataEvents: RevisionChange[] = [];
    if (qid && !startToken) {
      onProgress?.({ phase: 'Checking Wikidata', count: 0, total: 1 });
      wikidataEvents = await this.getWikidataHistory(qid);
      onProgress?.({ phase: 'Checking Wikidata', count: 1, total: 1 });
    }

    // Merge and Sort
    const allEvents = [...candidateEvents, ...wikidataEvents].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Final deduplication (collapse identical consecutive states)
    const finalEvents: RevisionChange[] = [];
    let lastEffectiveImage = '';

    for (const event of allEvents) {
      const normalized = event.imageName.trim().toLowerCase().replace(/[\s_]+/g, '_');
      if (normalized !== lastEffectiveImage) {
        finalEvents.push(event);
        lastEffectiveImage = normalized;
      }
    }

    return {
      events: finalEvents,
      continueToken: continueToken,
      totalFetched: fetchedCount
    };
  },

  async getWikidataHistory(qid: string): Promise<RevisionChange[]> {
    try {
      // First, get the current P18 value to see if it even has one
      const data = await fetchWiki({
        action: 'wbgetentities',
        ids: qid,
        props: 'claims'
      }, WIKIDATA_API_BASE);

      if (!data.entities?.[qid]?.claims?.P18) return [];

      // Now query the revision history of the QID
      // This is a bit limited in the wb API, so we use standard revisions and look for P18 changes
      const revData = await fetchWiki({
        action: 'query',
        prop: 'revisions',
        titles: qid,
        rvprop: 'ids|timestamp|user|comment|content',
        rvlimit: '500' // Wikidata edits are often bots, but important property changes are fewer
      }, WIKIDATA_API_BASE);

      const pageId = Object.keys(revData.query.pages)[0];
      const revisions = revData.query.pages[pageId].revisions || [];
      const events: RevisionChange[] = [];

      for (const rev of revisions) {
        const comment = (rev.comment || '').toLowerCase();
        // Look for P18 added or changed in the comment (standard Wikidata edit summary format)
        if (comment.includes('p18') || comment.includes('image')) {
          // We need the actual image value at this revision
          // This requires parsing the content which is a JSON blob on Wikidata
          try {
            const content = JSON.parse(rev['*'] || '{}');
            const imageValue = content.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
            if (imageValue && typeof imageValue === 'string') {
              events.push({
                revid: rev.revid,
                timestamp: rev.timestamp,
                user: rev.user,
                comment: rev.comment || 'Wikidata Image Update',
                imageName: imageValue,
                source: 'Wikidata'
              });
            }
          } catch (e) {
            continue;
          }
        }
      }
      return events;
    } catch (e) {
      console.error('Failed to fetch Wikidata history', e);
      return [];
    }
  },

  async processCandidate(rev: any, currentRaw: string | null, olderRaw: string | null, events: RevisionChange[]) {
    // Phase 4 (The Clean-up): Handle templates (e.g., {{P18|...}})
    let resolvedImage = '';
    const isTemplate = currentRaw && (currentRaw.includes('{{') || currentRaw.includes('}}'));

    if (isTemplate) {
      resolvedImage = await parseQueue.run(async () => {
        try {
          const parseData = await fetchWiki({
            action: 'parse',
            oldid: rev.revid.toString(),
            prop: 'images'
          });
          return parseData.parse?.images?.find((img: string) => 
            !/Ambox|Commons-logo|Edit-clear|Question_mark|Gnome-/.test(img) &&
            /\.(jpg|jpeg|png|svg|webp|gif)$/i.test(img) &&
            !/Stub|Icon|Logo_of_Wikipedia/i.test(img)
          ) || '';
        } catch { return ''; }
      });
    } else {
      // Better resolution for [[File:Name.jpg|thumb]] or just Name.jpg
      resolvedImage = currentRaw ? currentRaw.trim() : '';
      if (resolvedImage) {
        // Remove [[ and ]] if they wrap the whole thing or part of it
        resolvedImage = resolvedImage.replace(/^\[\[/, '').replace(/\]\]$/, '');
        // Split by | to handle [[File:Img.jpg|thumb]]
        resolvedImage = resolvedImage.split('|')[0].trim();
        // Remove File: prefix
        resolvedImage = resolvedImage.replace(/^(?:File|Image|Media):/i, '').trim();
      }
    }

    if (resolvedImage) {
      events.push({
        revid: rev.revid,
        timestamp: rev.timestamp,
        user: rev.user,
        comment: rev.comment || '',
        imageName: resolvedImage,
        isRevert: /revert|rvv|m-|undo/i.test(rev.comment || ''),
        isUndo: (rev.comment || '').startsWith('Undid revision'),
        source: 'Wikipedia',
        sizeDiff: 0 // Approximate or calculated elsewhere
      });
    }
  },

  extractRawImageParam(wikitext: string): string | null {
    if (!wikitext) return null;
    const cleanText = wikitext.replace(/<!--[\s\S]*?-->/g, '');
    const imageParamRegex = /\|\s*(?:image|photo|portrait|main_image|infobox_image|image_name|image_file|image_skyline|landscape|image1|image2)\s*=\s*([^|\n}]+)/i;
    const match = cleanText.match(imageParamRegex);
    return match ? match[1].trim() : null;
  },

  extractInfoboxImage(wikitext: string): string | null {
    if (!wikitext) return null;
    
    // 0. Preliminary cleanup: strip comments to avoid capturing them in parameters
    const cleanText = wikitext.replace(/<!--[\s\S]*?-->/g, '');

    // 1. Check for infobox image parameter
    // Handles aliases like image, photo, font_image, etc.
    // Handles parameters like |image1, |image_skyline, etc.
    const imageParamRegex = /\|\s*(?:image|photo|portrait|main_image|infobox_image|image_name|image_file|image_skyline|landscape|image1|image2)\s*=\s*([^|\n}]+)/i;
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
    
    // MediaWiki allows querying multiple files at once. Limit to 50 per request to avoid URL length issues.
    const CHUNK_SIZE = 40;
    for (let i = 0; i < fileNames.length; i += CHUNK_SIZE) {
      const chunk = fileNames.slice(i, i + CHUNK_SIZE);
      const prefixed = chunk.map(f => f.startsWith('File:') || f.startsWith('Image:') ? f : `File:${f}`);
      
      try {
        const data = await fetchWiki({
          action: 'query',
          titles: prefixed.join('|'),
          prop: 'imageinfo',
          iiprop: 'url|thumbmsize',
          iiurlwidth: '400',
        });

        if (data.query?.pages) {
          Object.values(data.query.pages).forEach((page: any) => {
            if (page.imageinfo?.[0]) {
              const info = page.imageinfo[0];
              const title = page.title.replace(/^(File|Image):/i, '');
              results.set(title, {
                thumb: info.thumburl,
                original: info.url
              });
            }
          });
        }
      } catch (err) {
        console.error("Failed to fetch image details chunk", err);
      }
    }

    return results;
  }
};
