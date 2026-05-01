# Wiki Image Chronos - Requirements & Technical Specification

## Project Overview
An application that analyzes the revision history of a Wikipedia article to identify and visualize changes to the primary "headshot" image (usually found in the infobox).

## Core Requirements

### 1. Article Search & Discovery
- Users can search for a Wikipedia article by title.
- Support for multiple languages (defaulting to English).
- Auto-complete or search results listing to ensure accurate selection.

### 2. Historical Revision Analysis
- Fetch revision history for a selected article.
- Parse the wikitext of each revision to extract the `image` or `file` parameter from the primary template (e.g., `Infobox person`, `Infobox athlete`, etc.).
- Identify specific revisions where the image filename changed.
- **Performance Strategy**: Since articles can have thousands of revisions, implement a sampling or bisection algorithm to find changes efficiently without fetching every single revision's content.

### 3. Visual Timeline
- Display a horizontal or vertical timeline of "image eras."
- Each entry in the timeline should show:
    - A thumbnail of the image.
    - The date it was added.
    - The username of the editor who added it.
    - The revision comment/edit summary.
    - Total duration the image served as the main headshot.
- Interactive elements to view the full resolution image or jump to that specific Wikipedia revision.

### 4. Technical Stack
- **Framework**: React 18+ with Vite.
- **Styling**: Tailwind CSS for a refined "Technical Dashboard" aesthetic.
- **Icons**: Lucide-React.
- **Animations**: Framer Motion for smooth timeline transitions.
- **API**: MediaWiki API (via JSONP or CORS with `origin=*`).

## API Endpoints & Logic
- `action=query&list=search`: Search for articles.
- `action=query&prop=revisions&rvprop=content|timestamp|user|ids`: Fetch revision content.
- `action=query&prop=imageinfo&iiprop=url|thumbmsize`: Get image thumbnails and metadata.

## UX/UI Design Goals
- **Mood**: Precise, historical, scholarly.
- **Typography**: Inter for UI, matching the Wikipedia aesthetic but with more modern spacing.
- **Interactivity**: Staggered animation of the timeline as data loads.

## Future Considerations
- Compare two specific versions side-by-side.
- Export timeline as an image or PDF.
- Analyze multiple languages to see how headshots differ across cultures (e.g., the Japanese Wikipedia vs. English Wikipedia for the same person).
