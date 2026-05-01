import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, History, Calendar, User, ExternalLink, ArrowRight, Info, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { wikipediaService, WikiPage, ImageHistoryEntry, RevisionChange } from './services/wikipediaService';

export default function App() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WikiPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<ImageHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

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
    setError(null);
    setHistory([]);

    try {
      // 1. Get significant revisions where images changed
      const changes = await wikipediaService.getArticleRevisions(page.title);
      
      if (changes.length === 0) {
        setError("No infobox images found in the history of this article.");
        setIsLoading(false);
        return;
      }

      // 2. Fetch image details (URLs) for unique image names
      const uniqueNames = Array.from(new Set(changes.map(c => c.imageName)));
      const imageDetails = await wikipediaService.getImageDetails(uniqueNames);

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-100 flex flex-col overflow-hidden">
      {/* Header Navigation */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-30">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-sm">
            W
          </div>
          <h1 className="text-xl font-semibold tracking-tight hidden sm:block">
            WikiVision <span className="text-slate-400 font-normal">| Image Chronology</span>
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
        {selectedPage && !isLoading && history.length > 0 && (
          <aside className="w-72 hidden lg:flex flex-col gap-6 overflow-y-auto animate-in slide-in-from-left duration-500">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Current Infobox Image</h2>
              <div className="aspect-[3/4] bg-slate-100 rounded-lg border border-slate-200 overflow-hidden mb-4 shadow-inner">
                {history[0] && (
                  <img 
                    src={history[0].thumbnailUrl} 
                    alt="Current" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-mono tracking-tighter">File Name</p>
                  <p className="text-sm font-medium truncate" title={history[0]?.imageName}>{history[0]?.imageName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-mono tracking-tighter">Active Since</p>
                  <p className="text-sm font-medium">
                    {history[0] ? new Date(history[0].timestamp).toLocaleDateString() : 'N/A'}
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

        <main className={`flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden relative ${!selectedPage ? 'items-center justify-center' : ''}`}>
          
          {!selectedPage && !isLoading && (
            <div className="flex flex-col items-center justify-center p-12 text-center space-y-8">
              <div className="w-20 h-20 rounded-2xl bg-blue-50 flex items-center justify-center">
                <History className="w-10 h-10 text-blue-600" />
              </div>
              <div className="space-y-3">
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">Historical Perspective</h2>
                <p className="text-slate-500 max-w-sm mx-auto text-lg leading-relaxed">
                  Enter a Wikipedia article title above to visualize the visual evolution of its primary infobox image.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-4">
                {['Steve Jobs', 'Barack Obama', 'Angela Merkel', 'The Beatles', 'Rome'].map(term => (
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

          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full space-y-6">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-slate-100 rounded-full" />
                <Loader2 className="absolute top-0 left-0 w-16 h-16 animate-spin text-blue-600 border-4 border-transparent border-t-blue-600 rounded-full" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">Reconstructing Eras</p>
                <p className="text-xs text-slate-400 mt-1">Scanning Wikipedia revision database...</p>
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
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 leading-tight tracking-tight">{selectedPage.title}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Found {history.length} distinct image evolutions</p>
                </div>
                <div className="flex gap-3">
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest leading-none">Last Updated</span>
                    <span className="text-xs font-bold text-slate-600 mt-1">{new Date().toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {/* Scrollable Timeline */}
              <div className="flex-1 overflow-y-auto px-8 py-10">
                <div className="max-w-4xl mx-auto relative">
                  {/* Timeline Rail */}
                  <div className="absolute left-6 md:left-[50%] top-0 bottom-0 w-1 bg-slate-100 rounded-full -translate-x-1/2" />
                  
                  <div className="space-y-32 relative">
                    {history.map((entry: ImageHistoryEntry, index: number) => (
                      <TimelineItem 
                        key={entry.revid} 
                        entry={entry} 
                        index={index} 
                        isLast={index === history.length - 1} 
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-40 mb-10 text-center space-y-6">
                  <div className="w-px h-16 bg-slate-200 mx-auto" />
                  <p className="text-xs font-mono text-slate-400 uppercase tracking-[0.3em]">Historical Horizon Reached</p>
                  <div className="flex justify-center gap-4">
                    <a 
                      href={`https://en.wikipedia.org/wiki/${selectedPage.title}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 uppercase"
                    >
                      Article <ExternalLink className="w-3 h-3" />
                    </a>
                    <a 
                      href={`https://en.wikipedia.org/wiki/${selectedPage.title}?action=history`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 uppercase"
                    >
                      Full History <History className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
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

interface TimelineItemProps {
  key?: React.Key;
  entry: ImageHistoryEntry;
  index: number;
  isLast: boolean;
}

function TimelineItem({ entry, index, isLast }: TimelineItemProps) {
  const isEven = index % 2 === 0;
  
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className={`relative flex flex-col md:flex-row items-center gap-12 ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'}`}
    >
      {/* Connector Node */}
      <div className="absolute left-6 md:left-[50%] top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-blue-600 z-10 border-4 border-white shadow-lg" />
      
      {/* Card Content */}
      <div className="w-full md:w-1/2 flex justify-center">
        <div className="group relative w-full max-w-[340px] perspective-1000">
          <div className="bg-white p-3 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 transition-all group-hover:-rotate-1 group-hover:-translate-y-2 duration-500 overflow-hidden">
            <div className="aspect-square bg-slate-50 rounded-xl overflow-hidden flex items-center justify-center relative mb-4 ring-1 ring-slate-100">
              <img 
                src={entry.thumbnailUrl} 
                alt={entry.imageName} 
                className="w-full h-full object-cover transition-all duration-700"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/5 transition-all" />
              
              {/* Overlay Badge */}
              <div className="absolute top-3 left-3 bg-white/90 backdrop-blur px-2 py-1 rounded-md text-[10px] font-bold text-slate-600 shadow-sm">
                ERA #{index + 1}
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Contributor</p>
                  <p className="text-sm font-bold text-slate-900 truncate">{entry.user}</p>
                </div>
              </div>
              
              <div className="p-3 bg-slate-50 rounded-xl">
                 <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 italic">
                   "{entry.comment || 'No revision summary provided'}"
                 </p>
              </div>

              <div className="flex gap-2">
                <a 
                  href={`https://en.wikipedia.org/wiki/?diff=${entry.revid}`} 
                  target="_blank" 
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-colors"
                >
                  Diff <ArrowRight className="w-3 h-3" />
                </a>
                <a 
                  href={entry.originalUrl} 
                  target="_blank" 
                  className="flex items-center justify-center w-10 h-10 border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 rounded-lg transition-all"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
          
          {/* Timeline Label */}
          <div className="md:hidden absolute -top-4 left-10 bg-blue-600 text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-lg">
             {formatDate(entry.timestamp)}
          </div>
        </div>
      </div>

      {/* Date Information Side */}
      <div className={`hidden md:block w-full md:w-1/2 ${isEven ? 'pl-8' : 'pr-8 text-right'}`}>
        <div className="space-y-2">
          <div className={`flex items-center gap-2 text-blue-600 ${isEven ? '' : 'flex-row-reverse'}`}>
            <Calendar className="w-4 h-4" />
            <span className="text-sm font-bold uppercase tracking-[0.2em]">{formatDate(entry.timestamp).split(',')[1].trim()}</span>
          </div>
          <h3 className="text-3xl font-bold text-slate-900 tracking-tight">
            {formatDate(entry.timestamp).split(',')[0]}
          </h3>
          <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">
            Revision ID: {entry.revid}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

