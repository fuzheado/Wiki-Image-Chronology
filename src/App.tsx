import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Loader2, History, Calendar, User, ExternalLink, ArrowRight, Info, AlertCircle, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { wikipediaService, WikiPage, ImageHistoryEntry, RevisionChange } from './services/wikipediaService';

export default function App() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WikiPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{ phase: string; count: number; total?: number } | null>(null);
  const [history, setHistory] = useState<ImageHistoryEntry[]>([]);
  const [continueToken, setContinueToken] = useState<string | undefined>(undefined);
  const [totalRevisionsProcessed, setTotalRevisionsProcessed] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [history]);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleScrollTo = (ts: number) => {
    if (timelineContainerRef.current && sortedHistory.length > 0) {
      const startTs = new Date(sortedHistory[0].timestamp).getTime();
      const endTs = new Date().getTime();
      const totalDuration = Math.max(1000, endTs - startTs);
      
      const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
      const baseWidthPerYear = 1200 * zoomLevel;
      const totalYears = totalDuration / YEAR_MS;
      const minWidthFromYears = Math.max(0.1, totalYears) * baseWidthPerYear;
      const minWidthFromGroups = sortedHistory.length * (280 * Math.min(1, zoomLevel));
      const totalWidth = Math.max(1000, minWidthFromYears, minWidthFromGroups) + 500;
      
      const pxPerMs = (totalWidth - 400) / totalDuration;
      const leftPos = (ts - startTs) * pxPerMs + 100;
      
      timelineContainerRef.current.scrollTo({
        left: leftPos - (timelineContainerRef.current.clientWidth / 2),
        behavior: 'smooth'
      });
    }
  };

  const timelineContainerRef = useRef<HTMLDivElement>(null);
  const [hasAutoFitted, setHasAutoFitted] = useState(false);

  // Auto-fit to screen when history is first loaded
  useEffect(() => {
    if (history.length > 0 && timelineContainerRef.current && !hasAutoFitted) {
      const containerWidth = timelineContainerRef.current.clientWidth - 200;
      const startTs = new Date(sortedHistory[0].timestamp).getTime();
      const endTs = new Date().getTime();
      const totalDuration = Math.max(1, endTs - startTs);
      const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
      const totalYears = totalDuration / YEAR_MS;
      
      const targetBaseWidthPerYear = containerWidth / Math.max(0.1, totalYears);
      const targetZoom = Math.min(1.5, Math.max(0.15, targetBaseWidthPerYear / 1200));
      
      setZoomLevel(targetZoom);
      setHasAutoFitted(true);
      
      setTimeout(() => {
        if (timelineContainerRef.current) {
          timelineContainerRef.current.scrollTo({ left: 0, behavior: 'instant' });
        }
      }, 50);
    }
  }, [history.length, hasAutoFitted, sortedHistory]);

  // Reset auto-fit flag when page changes
  useEffect(() => {
    if (history.length === 0) setHasAutoFitted(false);
  }, [history.length, selectedPage]);

  // Handle live search
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    
    if (query.trim().length > 2) {
      setIsSearching(true);
      searchTimeout.current = setTimeout(async () => {
        try {
          const results = await wikipediaService.searchPages(query);
          setSearchResults(results);
        } catch (err) {
          console.error(err);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    } else {
      setSearchResults([]);
    }
  }, [query]);

  const loadHistory = async (page: WikiPage) => {
    setSelectedPage(page);
    setSearchResults([]);
    setQuery('');
    setIsLoading(true);
    setProgress({ phase: 'Initializing', count: 0 });
    setError(null);
    setHistory([]);
    setContinueToken(undefined);
    setTotalRevisionsProcessed(0);

    try {
      // 1. Get significant revisions where images changed
      const result = await wikipediaService.getArticleRevisions(page.title, 500, setProgress);
      const changes = result.events;
      setContinueToken(result.continueToken);
      setTotalRevisionsProcessed(result.totalFetched);
      
      if (changes.length === 0) {
        setError("No infobox images found in the history of this article.");
        setIsLoading(false);
        return;
      }

      // 2. Fetch image details (URLs) for unique image names
      setProgress({ phase: 'Resolving image metadata', count: 0, total: changes.length });
      const uniqueNames = Array.from(new Set(changes.map(c => c.imageName)));
      const imageDetails = await wikipediaService.getImageDetails(uniqueNames);
      setProgress({ phase: 'Finalizing', count: uniqueNames.length, total: uniqueNames.length });

      // 3. Combine data
      const enrichedHistory: ImageHistoryEntry[] = changes.map(change => {
        const details = imageDetails.get(change.imageName);
        return {
          ...change,
          thumbnailUrl: details?.thumb || '',
          originalUrl: details?.original || '',
        };
      }).filter(h => h.thumbnailUrl); // Only show ones we could resolve images for

      setHistory(enrichedHistory);
    } catch (err) {
      setError("Failed to fetch article history. Please try again.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshHistory = () => {
    if (selectedPage) {
      loadHistory(selectedPage);
    }
  };

  const loadMoreRevisions = async () => {
    if (!selectedPage || !continueToken || isLoadingMore) return;
    
    setIsLoadingMore(true);
    // Keep a copy of current names to avoid duplicate metadata fetches
    const existingNames = new Set(history.map(h => h.imageName));
    
    try {
      setProgress({ phase: 'Synchronizing History', count: 0, total: 500 });
      const result = await wikipediaService.getArticleRevisions(
        selectedPage.title, 
        500, 
        setProgress, 
        continueToken
      );
      
      const newChanges = result.events;
      setContinueToken(result.continueToken);
      setTotalRevisionsProcessed(prev => prev + result.totalFetched);
      
      if (newChanges.length > 0) {
        // Resolve metadata only for names we don't have yet
        const newNames = Array.from(new Set(newChanges.map(c => c.imageName).filter(name => !existingNames.has(name))));
        const newImageDetails = await wikipediaService.getImageDetails(newNames);
        
        const enrichedNewHistory: ImageHistoryEntry[] = newChanges.map(change => {
          const details = newImageDetails.get(change.imageName);
          const existingEntry = history.find(h => h.imageName === change.imageName);
          
          return {
            ...change,
            thumbnailUrl: details?.thumb || existingEntry?.thumbnailUrl || '',
            originalUrl: details?.original || existingEntry?.originalUrl || '',
          };
        }).filter(h => h.thumbnailUrl);

        setHistory(prev => {
          const combined = [...prev, ...enrichedNewHistory];
          // Final dedup by revid to be safe
          const uniqueMap = new Map();
          combined.forEach(item => uniqueMap.set(item.revid, item));
          return Array.from(uniqueMap.values());
        });
      }
    } catch (err) {
      console.error("Failed to load more history", err);
    } finally {
      setIsLoadingMore(false);
      setProgress(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-100 flex flex-col overflow-hidden">
      {/* Header Navigation */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-30">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-sm">
            W
          </div>
          <h1 className="text-xl font-semibold tracking-tight hidden sm:block">
            Infobox Image History
          </h1>
        </div>

        <div className="flex-1 max-w-xl mx-4 relative">
          <div className="relative group">
            <input
              id="search-input"
              type="text"
              placeholder="Search Wikipedia article..."
              className="w-full bg-slate-100 border border-slate-200 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </div>
          </div>

          <AnimatePresence>
            {searchResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl shadow-black/5 overflow-hidden z-50"
              >
                {searchResults.map((page) => (
                  <button
                    key={page.pageid}
                    onClick={() => loadHistory(page)}
                    className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between group transition-colors border-b border-slate-100 last:border-0"
                  >
                    <span className="text-sm font-medium">{page.title}</span>
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => window.print()}
            className="hidden md:flex px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors items-center gap-2"
          >
            Export
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
            Analyze
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden p-6 gap-6">
        <main className={`flex-1 flex flex-col overflow-hidden relative ${!selectedPage ? 'items-center justify-center' : ''}`}>
          
          {!selectedPage && !isLoading && (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-8">
              <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center">
                <History className="w-10 h-10 text-blue-600" />
              </div>
              <div className="space-y-3">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">Infobox Image History</h2>
                <p className="text-slate-500 max-w-sm mx-auto text-lg leading-relaxed">
                  Enter a Wikipedia article title above to visualize the visual evolution of its primary infobox image.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-4">
                {['Alysa Liu', 'Fernando Mendoza', 'Angela Merkel'].map(term => (
                  <button
                    key={term}
                    onClick={() => setQuery(term)}
                    className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          { (isLoading || isLoadingMore) && (
            <div className="flex flex-col items-center justify-center h-full space-y-8">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-slate-100 rounded-full" />
                <Loader2 className="absolute top-0 left-0 w-20 h-20 animate-spin text-blue-600 border-4 border-transparent border-t-blue-600 rounded-full" />
              </div>
              <div className="text-center space-y-4">
                <div className="space-y-1">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Scanning History</p>
                  <p className="text-xl font-bold text-slate-900 tracking-tight">
                    {progress?.phase || 'Reconstructing Eras...'}
                  </p>
                </div>
                
                {progress && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-blue-600"
                        initial={{ width: 0 }}
                        animate={{ 
                          width: progress.total ? `${(progress.count / progress.total) * 100}%` : '50%' 
                        }}
                      />
                    </div>
                    <p className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                      {progress.count} {progress.total ? `/ ${progress.total}` : ''} Records
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="h-full flex items-center justify-center p-12">
              <div className="max-w-md bg-red-50 border border-red-100 rounded-2xl p-8 flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-red-900 font-semibold">Connection Issue</h3>
                  <p className="text-sm text-red-800 mt-2">{error}</p>
                </div>
                <button 
                  onClick={() => setError(null)}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {selectedPage && history.length > 0 && !isLoading && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Timeline Header */}
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white/50 backdrop-blur-sm z-10">
                <div className="flex flex-col">
                  <a 
                    href={`https://en.wikipedia.org/wiki/${encodeURIComponent(selectedPage.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-2xl font-bold text-slate-900 leading-tight tracking-tight hover:text-blue-600 transition-colors flex items-center gap-2 group/title"
                  >
                    {selectedPage.title}
                    <ExternalLink className="w-4 h-4 opacity-0 group-hover/title:opacity-100 transition-opacity" />
                  </a>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Timeline of {history.length} image variations across {totalRevisionsProcessed} revisions
                    <span className="ml-2 px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-bold text-slate-400">
                      {new Date(sortedHistory[0]?.timestamp || new Date()).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })} — Present
                    </span>
                  </p>
                </div>
                <div className="flex gap-3 items-center">
                  <button
                    onClick={refreshHistory}
                    disabled={isLoading || isLoadingMore}
                    className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-bold uppercase transition-all disabled:opacity-50"
                    title="Refresh and analyze from latest"
                  >
                    <Loader2 className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                  {continueToken && (
                    <button
                      onClick={loadMoreRevisions}
                      disabled={isLoadingMore}
                      className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-blue-100 text-blue-600 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95"
                    >
                      {isLoadingMore ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <History className="w-3.5 h-3.5" />}
                      Load Older Revisions
                    </button>
                  )}
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 mr-4">
                    <button 
                      onClick={() => setZoomLevel(Math.max(0.2, zoomLevel - 0.2))}
                      className="p-1.5 hover:bg-white rounded-md text-slate-500 hover:text-blue-600 transition-all shadow-sm active:scale-95"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] font-bold text-slate-500 px-1 w-10 text-center">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                    <button 
                      onClick={() => setZoomLevel(Math.min(5, zoomLevel + 0.2))}
                      className="p-1.5 hover:bg-white rounded-md text-slate-500 hover:text-blue-600 transition-all shadow-sm active:scale-95"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setZoomLevel(1)}
                      className="p-1.5 hover:bg-white rounded-md text-slate-400 hover:text-slate-600 transition-all"
                      title="Reset Zoom"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest leading-none">Last Scanned</span>
                    <span className="text-xs font-bold text-slate-600 mt-1">{new Date().toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {/* Scrollable Timeline Container */}
              <div 
                ref={timelineContainerRef}
                className="flex-1 overflow-scroll overflow-scrolling-touch bg-slate-50/50 relative custom-scrollbar"
              >
                <TimelineLinear history={sortedHistory} selectedPage={selectedPage} zoomLevel={zoomLevel} />
              </div>

              {/* Timeline Overview / Minimap */}
              <div className="h-20 bg-white border-t border-slate-200 px-8 py-3 shrink-0">
                <TimelineOverview 
                  history={sortedHistory} 
                  zoomLevel={zoomLevel} 
                  setZoomLevel={setZoomLevel} 
                  onScrollTo={handleScrollTo}
                />
              </div>
            </div>
          )}
        </main>

        {selectedPage && !isLoading && history.length > 0 && (
          <aside className="w-72 hidden lg:flex flex-col gap-6 overflow-y-auto animate-in slide-in-from-right duration-500">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Current Infobox Image</h2>
                <a 
                  href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(sortedHistory[sortedHistory.length - 1]?.imageName || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-[3/4] bg-slate-100 rounded-lg border border-slate-200 overflow-hidden mb-4 shadow-inner group/curr relative"
                >
                  {sortedHistory[sortedHistory.length - 1] && (
                    <img 
                      src={sortedHistory[sortedHistory.length - 1].thumbnailUrl} 
                      alt="Current" 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover/curr:scale-110"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover/curr:bg-black/10 transition-colors flex items-center justify-center">
                    <Maximize2 className="w-8 h-8 text-white opacity-0 group-hover/curr:opacity-100 transition-opacity" />
                  </div>
                </a>
                <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-mono tracking-tighter">File Name</p>
                  <p className="text-sm font-medium truncate" title={sortedHistory[sortedHistory.length - 1]?.imageName}>{sortedHistory[sortedHistory.length - 1]?.imageName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-mono tracking-tighter">Active Since</p>
                  <p className="text-sm font-medium">
                    {sortedHistory[sortedHistory.length - 1] ? (
                      <>
                        {new Date(sortedHistory[sortedHistory.length - 1].timestamp).toLocaleDateString()}
                        <span className="ml-2 text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          {Math.max(0, Math.floor((new Date().getTime() - new Date(sortedHistory[sortedHistory.length - 1].timestamp).getTime()) / (1000 * 60 * 60 * 24)))} days
                        </span>
                      </>
                    ) : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-mono tracking-tighter">Eras Tracked</p>
                  <p className="text-sm font-medium">{history.length} Major Transitions</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <Info className="w-4 h-4" /> Usage
              </h3>
              <p className="text-xs text-blue-800 leading-relaxed">
                This timeline tracks revisions where the infobox image parameter changed. Images are sorted from most recent to oldest.
              </p>
            </div>
          </aside>
        )}
      </div>

      {/* Footer Status */}
      <footer className="bg-slate-900 text-white px-6 py-2 flex justify-between items-center text-[10px] uppercase tracking-widest shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> 
            MediaWiki API Status: Online
          </span>
          <span className="opacity-40 hidden sm:inline">Engine: WikiVision v1.0.4</span>
        </div>
        <div className="opacity-40 font-bold">
          © {new Date().getFullYear()} Image Chronology Module
        </div>
      </footer>
    </div>
  );
}

interface TimelineLinearProps {
  history: ImageHistoryEntry[];
  selectedPage: WikiPage;
  zoomLevel: number;
}

function TimelineLinear({ history, selectedPage, zoomLevel }: TimelineLinearProps) {
  if (history.length === 0) return null;

  const startTs = new Date(history[0].timestamp).getTime();
  const endTs = new Date().getTime(); 
  const totalDuration = Math.max(1000, endTs - startTs);
  
  // Scaling logic based on zoomLevel
  const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  const baseWidthPerYear = 1200 * zoomLevel;
  
  const totalYears = totalDuration / YEAR_MS;
  const minWidthFromYears = Math.max(0.1, totalYears) * baseWidthPerYear;
  const minWidthFromGroups = history.length * (280 * Math.min(1, zoomLevel));
  const totalWidth = Math.max(1000, minWidthFromYears, minWidthFromGroups) + 500;
  
  const pxPerMs = (totalWidth - 400) / totalDuration;

  // Stacking logic: group entries that would overlap horizontally
  const groups: ImageHistoryEntry[][] = [];
  const OVERLAP_PX_THRESHOLD = 220 * Math.min(1, zoomLevel);
  const TIME_THRESHOLD_MS = OVERLAP_PX_THRESHOLD / pxPerMs;

  history.forEach(entry => {
    const entryTs = new Date(entry.timestamp).getTime();
    const lastGroup = groups[groups.length - 1];
    
    // Group if the time difference from the FIRST element in the group is less than the threshold
    if (lastGroup && entryTs - new Date(lastGroup[0].timestamp).getTime() < TIME_THRESHOLD_MS) {
      lastGroup.push(entry);
    } else {
      groups.push([entry]);
    }
  });

  return (
    <div className="min-h-full relative pt-24 pb-48" style={{ width: `${totalWidth}px` }}>
      {/* Timeline Rail */}
      <div className="absolute left-0 right-0 top-1/3 -translate-y-1/2 h-1 bg-slate-200 z-0">
        {renderYearMarkers(startTs, endTs, pxPerMs)}
      </div>

      <div className="h-full w-full relative z-10">
        {groups.map((group, groupIdx) => {
          const firstInGroup = group[0];
          const ts = new Date(firstInGroup.timestamp).getTime();
          const leftPos = (ts - startTs) * pxPerMs + 100;

          return (
            <div 
              key={`group-${groupIdx}`} 
              className="absolute top-1/2 flex flex-col items-center"
              style={{ left: `${leftPos}px` }}
            >
              {/* Timeline Node */}
              <div className="w-4 h-4 rounded-full bg-blue-600 border-4 border-white shadow-md -translate-y-1/2 mb-2" />
              
              {/* Stacked Images below rail */}
              <div className="flex flex-col gap-4 mt-8">
                {group.map((entry, idx) => (
                  <TimelineCard key={entry.revid} entry={entry} stackIndex={idx} />
                ))}
              </div>
            </div>
          );
        })}
        
        {/* Present Day Marker */}
        <div 
          className="absolute top-1/3 -translate-y-1/2 flex flex-col items-center"
          style={{ left: `${(endTs - startTs) * pxPerMs + 100}px` }}
        >
          <div className="w-1.5 h-24 bg-blue-600/20 rounded-full" />
          <span className="absolute -top-10 whitespace-nowrap text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em] bg-blue-50 px-2 py-1 rounded border border-blue-100">
            Present Day
          </span>
        </div>
      </div>
    </div>
  );
}

function renderYearMarkers(start: number, end: number, pxPerMs: number) {
  const startYear = new Date(start).getFullYear();
  const endYear = new Date(end).getFullYear();
  const markers = [];

  for (let y = startYear; y <= endYear; y++) {
    const yearTs = new Date(`${y}-01-01`).getTime();
    if (yearTs < start) continue;
    
    const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
    const left = (yearTs - start) * pxPerMs + 100;
    markers.push(
      <div key={y} className="absolute h-6 w-px bg-slate-300 top-1/3 -translate-y-1/2" style={{ left: `${left}px` }}>
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[11px] font-bold text-slate-400 font-mono tracking-widest">{y}</span>
        {/* Subtle Month Markers if zoomed in */}
        {pxPerMs * YEAR_MS > 2000 && Array.from({length: 11}).map((_, i) => (
          <div key={i} className="absolute h-2 w-px bg-slate-200" style={{ left: `${(pxPerMs * YEAR_MS / 12) * (i + 1)}px`, top: '50%', transform: 'translateY(-50%)' }} />
        ))}
      </div>
    );
  }
  return markers;
}

interface TimelineCardProps {
  key?: React.Key;
  entry: ImageHistoryEntry;
  stackIndex: number;
}

function TimelineCard({ entry, stackIndex }: TimelineCardProps) {
  const isRevert = entry.isRevert;
  const isUndo = entry.isUndo;
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric'
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: stackIndex * 0.1, duration: 0.5 }}
      className={`relative bg-white p-2 rounded-xl border-2 transition-all hover:scale-105 z-[1] hover:z-20 shadow-xl shadow-black/5 group w-48 shrink-0
        ${isUndo ? 'border-orange-200' : isRevert ? 'border-red-200' : 'border-slate-100'}`}
    >
      <a 
        href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(entry.imageName)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block aspect-[3/4] rounded-lg overflow-hidden mb-2 bg-slate-50 relative border border-slate-100 shadow-sm group/cardimg"
      >
        <img 
          src={entry.thumbnailUrl} 
          alt="Revision" 
          className="w-full h-full object-cover transition-transform duration-500 group-hover/cardimg:scale-110"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-black/0 group-hover/cardimg:bg-black/5 transition-colors" />
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {entry.source === 'Wikidata' && (
            <div className="bg-purple-600 text-white px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1 ring-2 ring-white">
              Wikidata
            </div>
          )}
        </div>
        {isUndo ? (
          <div className="absolute top-2 right-2 bg-orange-600 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight shadow-lg flex items-center gap-1.5 ring-2 ring-white">
            <History className="w-3 h-3" /> UNDO
          </div>
        ) : isRevert ? (
          <div className="absolute top-2 right-2 bg-red-600 text-white px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight shadow-lg flex items-center gap-1.5 ring-2 ring-white">
            <History className="w-3 h-3" /> REVERT
          </div>
        ) : null}
      </a>

      <div className="space-y-2 px-1">
        <div className="flex justify-between items-start">
          <p className="text-[10px] font-bold text-slate-900 truncate flex-1" title={entry.imageName}>
            {entry.imageName}
          </p>
        </div>
        
        <div className={`rounded-lg p-2 space-y-1.5 ${isUndo ? 'bg-orange-50/50' : isRevert ? 'bg-red-50/50' : 'bg-slate-50'}`}>
          <p className={`text-[10px] font-mono font-black uppercase tracking-tighter ${isUndo ? 'text-orange-600' : isRevert ? 'text-red-600' : 'text-blue-600'}`}>
            {formatDate(entry.timestamp)}
          </p>
          <div className="flex items-center gap-1.5 overflow-hidden">
            <div className={`w-4 h-4 rounded flex items-center justify-center text-[8px] font-bold shrink-0 ${isUndo ? 'bg-orange-200 text-orange-600' : isRevert ? 'bg-red-200 text-red-600' : 'bg-slate-200 text-slate-500'}`}>
              {entry.user[0]}
            </div>
            <span className="text-[9px] font-bold text-slate-600 truncate">{entry.user}</span>
          </div>
          <div className={`pt-1.5 border-t ${isUndo ? 'border-orange-100' : isRevert ? 'border-red-100' : 'border-slate-200'}`}>
            <p className={`text-[9px] leading-tight line-clamp-3 italic ${isUndo ? 'text-orange-700 font-medium' : isRevert ? 'text-red-700 font-medium' : 'text-slate-500'}`}>
              "{entry.comment || 'No summary provided'}"
            </p>
          </div>
        </div>

        <div className="flex gap-1.5 pt-1">
          <a 
            href={entry.source === 'Wikidata' 
              ? `https://www.wikidata.org/w/index.php?oldid=${entry.revid}` 
              : `https://en.wikipedia.org/wiki/?diff=${entry.revid}`
            } 
            target="_blank" 
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all 
              ${isUndo ? 'bg-orange-600 text-white hover:bg-orange-700 shadow-sm shadow-orange-200' : 
                entry.source === 'Wikidata' ? 'bg-purple-600 text-white hover:bg-purple-700' :
                isRevert ? 'bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-200' : 
                'bg-slate-900 text-white hover:bg-blue-600'}`}
          >
            {entry.source === 'Wikidata' ? 'Source' : 'Diff'} <ArrowRight className="w-2.5 h-2.5" />
          </a>
          <a 
            href={entry.originalUrl} 
            target="_blank" 
            className={`flex items-center justify-center w-8 h-8 border-2 rounded-lg transition-all bg-white
              ${isUndo ? 'border-orange-100 text-orange-400 hover:text-orange-600 hover:border-orange-200' : 
                isRevert ? 'border-red-100 text-red-400 hover:text-red-600 hover:border-red-200' : 
                'border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-100'}`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}

function TimelineOverview({ history, zoomLevel, setZoomLevel, onScrollTo }: { history: ImageHistoryEntry[], zoomLevel: number, setZoomLevel: (z: number) => void, onScrollTo: (ts: number) => void }) {
  if (history.length === 0) return null;
  
  const start = new Date(history[0].timestamp).getTime();
  const end = new Date().getTime();
  const duration = Math.max(1, end - start);
  
  return (
    <div className="w-full h-full flex flex-col justify-between">
      <div className="flex justify-between items-center mb-2">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <History className="w-3 h-3" /> Historical Mapping
        </span>
        <div className="flex items-center gap-4">
           <span className="text-[9px] font-mono text-slate-400 font-bold">{new Date(start).getFullYear()}</span>
           <div className="w-32 h-1.5 bg-slate-100 rounded-full relative overflow-hidden">
             <motion.div 
               className="absolute top-0 bottom-0 left-0 bg-blue-500/30 border-r border-blue-500" 
               style={{ width: `${(1/zoomLevel) * 100}%` }} 
               animate={{ width: `${Math.min(100, (1/zoomLevel) * 100)}%` }}
             />
           </div>
           <span className="text-[9px] font-mono text-slate-400 font-bold">{new Date(end).getFullYear()}</span>
        </div>
      </div>
      
      <div className="relative flex-1 bg-slate-50 rounded-lg border border-slate-100 overflow-hidden flex items-center px-4">
        <div className="absolute inset-y-0 left-0 right-0 h-px bg-slate-200 top-1/2 -translate-y-1/2" />
        
        {history.map((entry, idx) => {
          const ts = new Date(entry.timestamp).getTime();
          const pos = ((ts - start) / duration) * 100;
          return (
            <button 
              key={entry.revid}
              onClick={() => onScrollTo(ts)}
              className="absolute w-2 h-8 top-1/2 -translate-y-1/2 bg-blue-600/20 border-x border-blue-600/10 hover:bg-blue-600 hover:w-3 transition-all cursor-pointer z-10"
              style={{ left: `${Math.min(99, pos)}%`, zIndex: idx + 10 }}
              title={`${entry.imageName} (${new Date(entry.timestamp).toLocaleDateString()})`}
            />
          );
        })}
        
        {/* Years in overview */}
        {Array.from({length: new Date(end).getFullYear() - new Date(start).getFullYear() + 1}).map((_, i) => {
          const year = new Date(start).getFullYear() + i;
          const yearTs = new Date(`${year}-01-01`).getTime();
          if (yearTs < start) return null;
          const pos = ((yearTs - start) / duration) * 100;
          return (
            <div key={year} className="absolute top-0 bottom-0 w-px bg-slate-200" style={{ left: `${pos}%` }} />
          );
        })}
      </div>
    </div>
  );
}

