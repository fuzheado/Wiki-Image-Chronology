# Wiki Image Chronos - Requirements & Technical Specification

## Project Overview
An application that analyzes the revision history of a Wikipedia article to identify and visualize changes to the primary "headshot" image (usually found in the infobox).

## Core Requirements

### 1. Article Search & Discovery
- Users can search for a Wikipedia article by title.
- Support for selecting accurate matches from search results.

### 2. Historical Revision Analysis
- Fetch revision history for a selected article (up to 3000 revisions).
- Parse the wikitext of each revision to extract image parameters from templates (e.g., `Infobox person`, `landscape`, `photo`, `image1`).
- Normalize and deduplicate image filenames to identify "image eras".
- **Extraction Strategy**: Handle common aliases and cleaning steps (like removing HTML comments and template-nesting artifacts) to ensure accuracy.

### 3. Visual Linear Timeline
- Display a horizontal, time-accurate linear timeline.
- Proportional spacing between entries based on actual calendar days.
- **Interactivity**: 
    - **Zoom**: Scalable view (20% - 500%) to handle both short-term and multi-decade histories.
    - **Minimap Overview**: A navigational "scrubber" at the bottom to jump to specific points in time.
    - **Scroll Control**: Persistent custom **horizontal and vertical** scrollbars visible at all times.
    - **Auto-fitting**: Intelligently fits the timeline to the screen on initial load.
- Each entry displays:
    - High-res thumbnail via Wikimedia Commons.
    - Introduction date and editor attribution.
    - Edit summary/comment.
    - **Status Badges**: Specialized color-coding for "Reverts" (Red) and "Undos" (Orange).
- **Current State Sidebar**: A persistent right-side panel showing the active infobox image and its duration history (e.g., "Active for 400 days").

### 4. Technical Stack
- **Framework**: React 18+ with Vite.
- **Styling**: Tailwind CSS for a refined "Historical Archive" aesthetic.
- **Persistent Scrollbars**: Custom CSS layer for universal visibility across browsers.
- **Icons**: Lucide-React.
- **Animations**: Framer Motion for zoom transitions and UI entrances.
- **API**: MediaWiki API.

## API Endpoints & Logic
- `action=query&list=search`: Search for articles.
- `action=query&prop=revisions&rvprop=ids|timestamp|user|comment|content`: Fetch revision history and wikitext.
- `action=query&prop=imageinfo&iiprop=url|thumbmsize`: Resolve Commons metadata.

## UX/UI Design Goals
- **Mood**: Scholarly, precise, data-driven.
- **Density**: Use horizontal space efficiently; stack items that would overlap in time at high zoom levels.
- **Clarity**: Subtle year markers and Present Day indicators to provide temporal context.

## Completed Enhancements
- [x] Zoom in/out functionality.
- [x] Navigation minimap/overview.
- [x] Live search with auto-suggest.
- [x] Time-accurate linear scaling.
- [x] "Active since" duration counter.
- [x] Robust handling of common Infobox image parameter aliases.
