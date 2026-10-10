# Photo Selection

A modern, streamlined photo selection platform for professional photography studios.

---

## Overview

A wedding or event photographer often captures 1,000–2,000 high-resolution camera photos (~15 MB each), but the customer only needs a subset (e.g., exactly 300 photos) for their final album.

Instead of requiring customers to visit the studio in person and click through files manually on the photographer's workstation:

1. **Photographer selects local event folder** (e.g., `D:\Events\Shyam Wedding` containing 1,000 photos).
2. **Photographer specifies the customer selection limit** (e.g., `300`).
3. **Local processing**: The application creates lightweight WebP previews (~100–180 KB) on the photographer's PC. Original camera files remain safely on the local PC and are never uploaded.
4. **Cloud proofing**: Only WebP previews are staged to Cloudflare R2 ($0 egress fees).
5. **Customer selection**: The customer receives a gallery link, views previews, and selects **EXACTLY the configured number** (e.g. `300 / 300`). They cannot select 301 and cannot submit with 299.
6. **Local original retrieval**: Upon submission, the photographer's local desktop component matches selected IDs with the original camera files and copies them into a new folder (e.g., `Selected Shyam Wedding`).
7. **Verified cleanup**: Only after the originals are verified copied locally are the temporary cloud previews deleted from R2.

---

## Current Workflow (Phase 1)

The current UI provides the clean initial folder-selection flow:

1. **Initial Screen**:
   - Title: **Photo Selection**
   - Subtitle: **Select an event folder to create a customer photo selection gallery.**
   - Action: **[ Add Folder ]**
2. **OS Folder Picker**:
   - Opens the native operating system folder selection dialog (via the File System Access API with fallback).
3. **Photo Detection**:
   - Scans the selected folder and displays:
     - Folder Name (e.g., **Shyam Wedding**)
     - Detected count (e.g., **1000 photos found**)
4. **Customer Selection Limit**:
   - Photographer manually enters: **How many photos should the customer select?** `[ 300 ]`
5. **Continue**:
   - Validates the manual selection limit and prepares the event for proofing gallery generation.

---

## Visual Design Reference

Styled using the dark navy / blue accent aesthetic of ZeeBook Studio:
- Dark background (`#07090e`)
- Dark navy cards (`#101625`)
- Blue primary button (`#2563eb`)
- Subtle borders (`rgba(255, 255, 255, 0.08)`)
- Rounded corners (`16px`)
- Clean typography (Plus Jakarta Sans)
- Minimal single-page interface
