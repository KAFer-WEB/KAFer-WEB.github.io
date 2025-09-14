# KAFer PWA - File Structure

This document outlines the file and directory structure for the KAFer Progressive Web Application.

## 🗂️ Project Directory Tree

The project is organized by function, separating public-facing pages, admin pages, and static assets into distinct directories for clarity and maintainability.

```text
/ (Project Root)
|
├── README.md              # Project overview and file structure (this file)
|
├── index.html             # Login and registration landing page
|
├── app/                   # General user-facing pages
|   ├── menu.html          # Main user dashboard/menu
|   └── meet.html          # Page for exclusive content and payment info
|
├── admin/                 # Administrator-only pages
|   ├── dashboard.html     # Admin dashboard with stats and quick actions
|   ├── members.html       # Member management (CRUD)
|   ├── money.html         # KAFer Money management (issuing, voiding)
|   └── settings.html      # Site-wide settings and activity logs
|
├── assets/                # All static resources (CSS, JavaScript, icons)
|   ├── css/
|   |   ├── global.css     # Base styles for all pages
|   |   ├── auth.css       # Styles for index.html
|   |   ├── app.css        # Styles for /app/ pages
|   |   └── admin.css      # Styles for /admin/ pages
|   |
|   ├── js/
|   |   ├── global.js      # Core functions (API, auth, helpers)
|   |   ├── index.js       # Logic for index.html
|   |   ├── app/
|   |   |   └── menu.js    # Logic for /app/ pages
|   |   └── admin/
|   |       ├── dashboard.js
|   |       ├── members.js
|   |       ├── money.js
|   |       └── settings.js
|   |
|   └── icons/
|       ├── icon.png       # 192x192 icon for manifest
|       └── icon-512.png   # 512x512 icon for manifest
|
├── service-worker.js      # PWA service worker for caching and offline capabilities
└── manifest.webmanifest   # PWA configuration file