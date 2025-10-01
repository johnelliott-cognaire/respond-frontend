# Cognaire Respond - Frontend

This repository contains the frontend-only code for Cognaire Respond, extracted from the main repository to provide a standalone frontend development environment.

## Getting Started

### 1. Set Up Your Workspace

First, create a dedicated folder for Cognaire projects. We recommend creating a `cognaire` folder in your home directory or Documents folder:

**Option A: Create in Home Directory**
```bash
cd ~
mkdir cognaire
cd cognaire
```

**Option B: Create in Documents Folder**
```bash
cd ~/Documents
mkdir cognaire
cd cognaire
```

### 2. Clone the Repository

Once you're in your `cognaire` folder, clone the repository:

```bash
git clone https://github.com/johnelliott-cognaire/respond-frontend.git
cd respond-frontend
```

### 3. Run the Development Server

This frontend application can be served using Python's built-in HTTP server.

#### Prerequisites

Python 3 comes pre-installed on macOS. Verify your installation:

```bash
python3 --version
```

If Python is not installed, download it from [python.org](https://www.python.org/downloads/) or install via Homebrew:

```bash
brew install python3
```

**Note:** Python's `http.server` module is built-in and does not require separate installation.

#### Start the Server

Navigate to the `spa` folder and start the server:

```bash
cd spa
python3 -m http.server 8080
```

You should see output similar to:
```
Serving HTTP on 0.0.0.0 port 8080 (http://0.0.0.0:8080/) ...
```

#### Access the Application

Open your browser and navigate to:

```
http://localhost:8080/?s=cognaire
```

**Important:** The `?s=cognaire` parameter specifies the organization/subtenant code. The application uses this to set the organization context.

**Environment Selection:**
- In production, the environment (dev1, dev2, etc.) is determined from the subdomain (e.g., `dev2.cognairerespond.com`)
- When running locally on `localhost:8080`, the app defaults to the `default` environment
- To specify a different environment when running locally, add the `tenant` parameter: `http://localhost:8080/?tenant=dev2&s=cognaire`

See `spa/utils/config.js` for environment configuration details.

#### Stop the Server

Press `Ctrl+C` in the terminal where the server is running.

## Project Structure

- `spa/` - Single-page application frontend code
  - `index.html` - Main entry point
  - `api/` - API client modules
  - `ui/` - UI components, views, and modals
  - `styles/` - CSS stylesheets
  - `router/` - Client-side routing
  - `utils/` - Utility functions
  - `config/` - Configuration files

## Development

The application is a vanilla JavaScript single-page application. No build step is required for development - simply edit the files and refresh your browser.
