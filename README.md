# Wiki Image Chronos (WikiVision)

Analyze and visualize the visual evolution of Wikipedia article infobox images over time.

## 🌟 Overview

**Wiki Image Chronos** is a historical analysis tool that digs into the revision history of Wikipedia articles to identify when the primary biographical or identifying image in the "infobox" was changed. It provides a time-accurate, linear timeline of these "image eras," allowing researchers and history enthusiasts to see how the public face of an article has evolved over years of community editing.

## ✨ Features

- **Dynamic Search**: Search for any Wikipedia article title across the English Wikipedia database.
- **Revision Deep-Scan**: Analyzes up to 3000 historical revisions to find significant image transitions, "revert" states, and "undo" actions.
- **Time-Accurate Linear Timeline**: A horizontal timeline where items are spaced proportionally to the time between edits, with persistent custom scrollbars for reliable navigation.
- **Visual Intelligence**:
  - Color-coded entries: Red for Reverts, **Orange for Undos**.
  - Advanced parsing identifies image aliases (`landscape`, `image_skyline`, etc.) and handles complex wikitext nesting.
- **Zoom & Navigation**: 
  - Zoom in/out to see density or detail (20% to 500% zoom).
  - Navigation Overview (Minimap) to pan quickly through decades of history.
- **Data-Rich Display**:
  - High-quality image thumbnails.
  - Precise timestamp and timeline range indicators.
  - "Active Since" duration for the current image (e.g., "400 days ago").
  - Contributor attribution and revision comments.
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

The application uses the MediaWiki `action=query` API to fetch revision content. It employs custom parsing logic to identify common image parameters in Infobox templates (handling aliases like `image`, `photo`, `image_name`, `landscape`, `image1`, etc.). By comparing these values chronologically, the app identifies transitions. It then fetches high-resolution metadata and thumbnails from Wikimedia Commons to populate the timeline.

## 📝 License
This project is licensed under the Apache-2.0 License.
