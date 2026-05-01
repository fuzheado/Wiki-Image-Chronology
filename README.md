# Wiki Image Chronos (WikiVision)

Analyze and visualize the visual evolution of Wikipedia article infobox images over time.

## 🌟 Overview

**Wiki Image Chronos** is a historical analysis tool that digs into the revision history of Wikipedia articles to identify when the primary biographical or identifying image in the "infobox" was changed. It provides a visual timeline of these "image eras," allowing researchers and history enthusiasts to see how the public face of an article has evolved over years of community editing.

## ✨ Features

- **Dynamic Search**: Search for any Wikipedia article title across the English Wikipedia database.
- **Revision Deep-Scan**: Automatically analyzes hundreds of historical revisions to find significant image transitions.
- **Visual Timeline**: A beautifully crafted vertical timeline displaying each image era with:
  - High-quality image thumbnails.
  - Precise timestamp of introduction.
  - Contributor attribution (Wikipedia username).
  - Revision comments/summaries for context.
- **Comparison Tools**: Quick links to Wikipedia's native "diff" view to see the exact wikitext changes.
- **Professional Polish**: A high-fidelity "technical dashboard" aesthetic inspired by modern historical archives.

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

The application uses the MediaWiki `action=query` API to fetch revision content. It employs a custom parsing logic to identify standard infobox templates (like `Infobox person`) and extract the `image` parameter. By comparing these values across the revision timeline, the app identifies "significant changes" where a new file was introduced, then fetches the corresponding image metadata (URLs and thumbnails) from Wikimedia Commons.

## 📝 License
This project is licensed under the Apache-2.0 License.
