# Wiki Image Chronos - Requirements & Technical Specification

## Project Overview
An application that analyzes the revision history of a Wikipedia article to identify and visualize changes to the primary "headshot" image (usually found in the infobox).

## Core Requirements

### 1. Article Search & Discovery
- Users can search for a Wikipedia article by title.
- Support for selecting accurate matches from search results.

### 2. Historical Revision Analysis (Batch Retrieval Pipeline)
- **Phase 1 (The Sweep)**: Fetch revision history (up to 500 revisions) in batches of 50 with `rvprop=content`.
- **Phase 2 (The Matcher)**: For each revision, extract the string following the image parameter in the Infobox.
- **Phase 3 (The Filter)**: Compare the extracted string from Revision $N$ to Revision $N-1$ to identify "Candidate Changes."
- **Phase 4 (The Clean-up)**: If a candidate change involves a template (e.g., `{{P18|...}}`), trigger a single `action=parse` call to resolve the actual rendered image.
- **Wikidata "Ghost" Check**: Synchronize with Wikidata's `P18` (image) property history to detect image updates that occur via Wikidata rather than direct wikitext edits.
- **Deduplication**: Automatically collapse revisions that result in the same rendered image into a single chronological "era."

### 3. Visual Linear Timeline
- Display a horizontal, time-accurate linear timeline with proportional spacing.
- **Interactivity**: 
    - **Zoom**: Scalable view (20% - 500%).
    - **Minimap Overview**: A navigational "scrubber" for rapid temporal navigation.
    - **Scroll Control**: Persistent custom **horizontal and vertical** scrollbars.
- Each entry displays:
    - Thumbnail, attribution, and comment.
    - **Status Badges**: Color-coded for Reverts (Red), Undos (Orange), and Wikidata (Purple).
- **Current State Sidebar**: Displays the active infobox image and its total duration (e.g., "Active for 400 days").

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
