## Fix client logos strip

**File:** `src/components/ClientLogos.tsx`

### 1. Stop logos from "popping in" while scrolling
Currently each `<img>` uses `loading="lazy"`, so logos load only when scrolled into view, causing the visible flicker as the marquee animates.
- Change `loading="lazy"` → `loading="eager"` (and `fetchPriority="high"` for first 8 entries) so the whole strip is ready before it appears.
- Remove the `transition: opacity 0.3s` + `opacity: 0.92` jitter; render at full opacity immediately.

### 2. Revert Salesforge logo to previous (SVG)
- Import switches back from `@/assets/logos/salesforge.png` → `@/assets/logos/salesforge.svg` (file already exists).

### 3. Revert Underground Ecom logo to previous (SVG)
- Import switches back from `@/assets/logos/underground_ecom.png` → `@/assets/logos/underground_ecom.svg` (file already exists).
- Keep current `scale: 1.25`.

### 4. Bump Plural Sales size
- Change Plural Sales `scale: 1.0` → `scale: 1.4` so it visually matches neighbouring wordmarks like Cleon1 and Sophias.

No other client entries, sizes, or animation logic change.
