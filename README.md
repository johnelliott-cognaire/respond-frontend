# Cognaire Respond - Frontend

This repository contains the frontend-only code for Cognaire Respond, extracted from the main repository to provide a standalone frontend development environment.

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/johnelliott-cognaire/respond-frontend.git
cd respond-frontend
```

### 2. Run the Development Server

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

#### Start the Server

From the root of the repository, run:

```bash
python3 -m http.server 8080
```

You should see output similar to:
```
Serving HTTP on 0.0.0.0 port 8080 (http://0.0.0.0:8080/) ...
```

#### Access the Application

Open your browser and navigate to:

```
http://localhost:8080/spa/
```

**Note:** Make sure to include the trailing `/spa/` path to access the single-page application.

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
