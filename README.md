# Paraverse Module PDF Fetcher (Chrome/Edge extension)

Adds a "Download All Module PDFs" button to your Paraverse course page.
Click it and every presentation PDF for that course downloads at once,
using your browser's own logged-in session -- no cookies to copy, no
separate login step. 

## Why this approach works without a cookie
The extension fetches each PDF using `fetch(url, { credentials: "include" })`
from the background service worker. Since the extension has host permission
for `paraverse.feutech.edu.ph` and you're already logged in there in that
browser, the fetch automatically carries your session cookie -- no cookie
handling, no separate login step. It then forwards the raw PDF bytes to a
local FastAPI server running on your machine (`http://localhost:8000/upload`)
instead of saving them through `chrome.downloads`.

## Run the local server first
```
pip install fastapi uvicorn python-multipart
uvicorn server:app --port 8000
```
This starts a receiver at `http://localhost:8000` that saves incoming PDFs
into `./modules`. Leave it running while you use the extension.

## Install (unpacked, for personal use)

1. Open `chrome://extensions` (or `edge://extensions` in Edge).
2. Enable **Developer mode** (toggle, usually top-right).
3. Click **Load unpacked**.
4. Select the `paraverse-pdf-fetcher` folder.
5. It should appear in your extensions list, enabled.

## Use it

1. Log into Paraverse normally.
2. Go to the course page (the one that lists all the modules --
   `https://paraverse.feutech.edu.ph/network-map/course/...`).
3. If modules are collapsed, click "Expand All" first so the PDF buttons
   are present in the page.
4. A panel appears bottom-right titled **"Module PDFs Found"**, listing
   every presentation PDF detected on the page -- module label, filename,
   and a **Preview** link to open it in the viewer before deciding.
5. There's a **Local port** field near the top of the panel, pre-filled
   with `8000`. Change it and click **Save** if your FastAPI server runs
   on a different port -- it's remembered for next time (via
   `chrome.storage.local`), so you only need to set it once.
6. Everything is checked by default. Uncheck anything you don't want, or
   use **Select All / None**.
7. Click **Send Selected to Local Server**. Files are POSTed straight to
   your running FastAPI server (`http://localhost:<port>/upload`), which
   saves them into `./modules`, named like:
   `M1-PRESENTATION - EDITH-2503-0419-5402-2A12.pdf`

The panel re-scans automatically if you expand more modules while it's open,
so the list stays current. Close it with the × in the corner any time.

From there, point your `module_to_txt.py` watcher at the `./modules` folder
(same one the FastAPI server writes into) and the extraction pipeline picks
the files up as usual -- no manual moving required anymore.

## Notes
- This only works on `paraverse.feutech.edu.ph` course pages (scoped in
  `manifest.json` via `host_permissions` / `matches`) -- it won't run
  anywhere else.
- If the panel says "No PDFs detected yet," the module list likely hasn't
  finished loading (it loads via AJAX after the page renders) or the
  modules are still collapsed -- wait a moment or expand them; the panel
  re-scans automatically as the page updates.
- This is for your own personal use on your own enrolled course content.
  It doesn't bypass authentication in any way -- it only acts within a
  session you're already logged into.
