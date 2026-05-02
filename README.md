# Wiki Image Chronos (WikiVision)

Analyze and visualize the visual evolution of Wikipedia article infobox images over time.

## 🌟 Overview

**Wiki Image Chronos** is a historical analysis tool that digs into the revision history of Wikipedia articles to identify when the primary biographical or identifying image in the "infobox" was changed. It provides a time-accurate, linear timeline of these "image eras," allowing researchers and history enthusiasts to see how the public face of an article has evolved over years of community editing.

## ✨ Features

- **Dynamic Search**: Search for any Wikipedia article title across the English Wikipedia database.
- **Batch Retrieval Pipeline**: 
    - **Phase 1 (The Sweep)**: Fetches revision history in batches of 50 with full wikitext for efficient scanning.
    - **Phase 2 (The Matcher)**: Extracts raw image parameters (e.g., `image`, `photo`, `portrait`, `infobox_image`) from Infobox templates using pre-cleaned wikitext filters.
    - **Phase 3 (The Filter)**: Identifies candidate changes by comparing parameter strings between revisions.
    - **Phase 4 (The Clean-up)**: Targeted use of the Wikipedia `action=parse` API specifically for complex templates (like `{{P18|...}}`) to resolve final rendered images.
    - **Wikidata "Ghost" Detection**: Synchronously tracks `P18` property changes on Wikidata to capture updates that don't trigger Wikipedia edits.
- **Time-Accurate Linear Timeline**: A horizontal timeline spaced proportionally by time, with persistent multi-axis scrollbars.
- **Visual Intelligence**:
    - Color-coded entries: Red (Reverts), Orange (Undos), Purple (Wikidata).
- **Zoom & Navigation**: 
    - Zoom (20% to 500%) with a navigational minimap.
- **Refresh & Navigation**: 
    - **Refresh History**: Instantly reset and refetch the latest data for any article.
    - **Load More Revisions**: Extend the analysis by fetching deeper into the edit history in blocks of 500.
- **Deep Links & Integration**:
    - **Direct Access**: Click article titles to visit Wikipedia or click images to jump to the record on Wikimedia Commons.
- **Real-Time Progress Metrics**: Detailed visual feedback during the analysis pipeline (Sweeping → Wikidata) with per-phase progress bars and revision counters.
- **Data-Rich Display**:
    - High-quality thumbnails, "Active Since" day-counters, and revision diffs.
    - Comprehensive metadata: Shows total image variations relative to the volume of revisions processed.
- **Professional Analytics UI**: A high-fidelity "technical dashboard" aesthetic with a dedicated space for the "Current Infobox Image".

## 🛠️ Tech Stack

- **Framework**: React 18+ with TypeScript
- **Bundler**: Vite
- **Styling**: Tailwind CSS 4.0
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Data Source**: MediaWiki API (via CORS-enabled JSON requests)

## 🚀 Getting Started

### Prerequisites
- Node.js (Latest LTS recommended)
- npm or yarn

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open `http://localhost:3000` in your browser.

## 📖 How it Works

The application employs a sophisticated four-stage validation pipeline:
1. **The Sweep**: Fetching revision history in batches of 50 with content to identify candidate changes.
2. **The Matcher**: Extracting specific image parameters from Infobox wikitext.
3. **The Filter**: Comparing revisions to isolate meaningful transitions.
4. **The Clean-up**: Using the Parse API only when necessary to resolve template-based images (like Wikidata pulls).
5. **Wikidata Sync**: Injecting Wikidata property changes to catch "ghost" updates.

## 📝 License
This project is licensed under the Apache-2.0 License.
