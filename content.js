// content.js
// Runs on Paraverse course pages. Watches for the module list to render
// (it loads via AJAX after the page loads), scans it for presentation
// PDFs, and shows a panel listing everything found so you can see what's
// available before downloading anything.

let currentEntries = [];

function findPdfEntries() {
  const seen = new Set();
  const entries = [];

  document.querySelectorAll(".module-content").forEach((contentDiv) => {
    const labelTag = contentDiv.querySelector("strong");
    const label = labelTag ? labelTag.textContent.trim() : null;

    contentDiv.querySelectorAll("button[endpoint-url]").forEach((btn) => {
      const endpoint = btn.getAttribute("endpoint-url") || "";
      if (endpoint.toLowerCase().endsWith(".pdf") && !seen.has(endpoint)) {
        seen.add(endpoint);
        entries.push({ path: endpoint, label });
      }
    });
  });

  return entries;
}

function makeFilename(entry, index) {
  const rawName = entry.path.split("/").pop();
  const cleanLabel = entry.label
    ? entry.label.replace(/[\[\]]/g, "").trim()
    : `Document_${index + 1}`;
  return `paraverse-modules/${cleanLabel} - ${rawName}`;
}

// ---------------------------------------------------------------------------
// Panel UI
// ---------------------------------------------------------------------------

function ensurePanel() {
  let panel = document.getElementById("paraverse-pdf-panel");
  if (panel) return panel;

  panel = document.createElement("div");
  panel.id = "paraverse-pdf-panel";
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "999999",
    width: "340px",
    maxHeight: "70vh",
    background: "#fff",
    border: "1px solid #ccc",
    borderRadius: "10px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
    fontFamily: "Arial, sans-serif",
    fontSize: "13px",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  });

  panel.innerHTML = `
    <div style="background:#1a73e8;color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
      <strong>Module PDFs Found</strong>
      <span id="paraverse-pdf-close" style="cursor:pointer;font-size:16px;line-height:1;">&times;</span>
    </div>
    <div id="paraverse-pdf-toolbar" style="display:flex;gap:6px;padding:8px 10px;border-bottom:1px solid #eee;">
      <button id="paraverse-select-all" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:6px;background:#f5f5f5;cursor:pointer;">Select All</button>
      <button id="paraverse-select-none" style="flex:1;padding:6px;border:1px solid #ccc;border-radius:6px;background:#f5f5f5;cursor:pointer;">None</button>
    </div>
    <div id="paraverse-port-row" style="display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid #eee;">
      <label for="paraverse-port-input" style="color:#555;white-space:nowrap;">Local port</label>
      <input id="paraverse-port-input" type="number" min="1" max="65535" placeholder="8000"
        style="width:70px;padding:5px 6px;border:1px solid #ccc;border-radius:6px;">
      <button id="paraverse-port-save" style="padding:6px 10px;border:1px solid #ccc;border-radius:6px;background:#f5f5f5;cursor:pointer;">Save</button>
    </div>
    <div id="paraverse-pdf-list" style="overflow-y:auto;flex:1;padding:6px 10px;"></div>
    <div style="padding:10px;border-top:1px solid #eee;">
      <button id="paraverse-download-btn" style="width:100%;padding:10px;background:#1a73e8;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;">
        Process Selected
      </button>
      <div id="paraverse-pdf-status" style="margin-top:8px;color:#333;"></div>
    </div>
  `;

  document.body.appendChild(panel);

  panel.querySelector("#paraverse-pdf-close").addEventListener("click", () => {
    panel.style.display = "none";
  });
  panel.querySelector("#paraverse-select-all").addEventListener("click", () => {
    panel.querySelectorAll(".paraverse-pdf-checkbox").forEach((cb) => (cb.checked = true));
  });
  panel.querySelector("#paraverse-select-none").addEventListener("click", () => {
    panel.querySelectorAll(".paraverse-pdf-checkbox").forEach((cb) => (cb.checked = false));
  });
  panel.querySelector("#paraverse-download-btn").addEventListener("click", onDownloadClick);
  panel.querySelector("#paraverse-port-save").addEventListener("click", onSavePortClick);

  // Pre-fill the port field with whatever's currently stored (or the default).
  chrome.storage.local.get("uploadPort", ({ uploadPort }) => {
    panel.querySelector("#paraverse-port-input").value = uploadPort || 8000;
  });

  return panel;
}

function renderList(entries) {
  const panel = ensurePanel();
  panel.style.display = "flex";

  const listEl = panel.querySelector("#paraverse-pdf-list");
  const statusEl = panel.querySelector("#paraverse-pdf-status");

  if (entries.length === 0) {
    listEl.innerHTML = `<div style="color:#888;padding:8px 0;">No PDFs detected yet -- try expanding all modules.</div>`;
    statusEl.textContent = "";
    return;
  }

  listEl.innerHTML = entries
    .map((entry, i) => {
      const filename = entry.path.split("/").pop();
      const title = entry.label ? entry.label.replace(/[\[\]]/g, "") : filename;
      const viewUrl = new URL(
        `/assets/library/pdfjs/web/viewer.html?file=${entry.path}`,
        window.location.origin
      ).href;
      return `
        <label style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;cursor:pointer;">
          <input type="checkbox" class="paraverse-pdf-checkbox" data-index="${i}" checked style="margin-top:3px;">
          <span style="flex:1;">
            <div style="font-weight:600;color:#222;">${title}</div>
            <div style="color:#888;font-size:11px;">${filename}</div>
            <a href="${viewUrl}" target="_blank" style="font-size:11px;color:#1a73e8;">Preview</a>
          </span>
        </label>
      `;
    })
    .join("");

  statusEl.textContent = `${entries.length} PDF(s) found. Uncheck any you don't want, then download.`;
}

function onSavePortClick() {
  const panel = document.getElementById("paraverse-pdf-panel");
  const input = panel.querySelector("#paraverse-port-input");
  const statusEl = panel.querySelector("#paraverse-pdf-status");

  const port = parseInt(input.value, 10);
  if (!port || port < 1 || port > 65535) {
    statusEl.textContent = "Enter a valid port number (1-65535).";
    return;
  }

  chrome.storage.local.set({ uploadPort: port }, () => {
    statusEl.textContent = `Local server port set to ${port}.`;
  });
}

function onDownloadClick() {
  const panel = document.getElementById("paraverse-pdf-panel");
  const statusEl = panel.querySelector("#paraverse-pdf-status");
  const checked = Array.from(panel.querySelectorAll(".paraverse-pdf-checkbox:checked")).map(
    (cb) => currentEntries[parseInt(cb.dataset.index, 10)]
  );

  if (checked.length === 0) {
    statusEl.textContent = "Nothing selected.";
    return;
  }

  const downloads = checked.map((entry, i) => ({
    url: new URL(entry.path, window.location.origin).href,
    filename: makeFilename(entry, i),
  }));

  statusEl.textContent = `Sending ${downloads.length} file(s) for processing...`;

  chrome.runtime.sendMessage({ type: "downloadPdfs", downloads }, (response) => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = `Error: ${chrome.runtime.lastError.message}`;
      return;
    }
    let msg = `Done: ${response.succeeded} processed, ${response.failed} failed (${response.processUrl}).`;
    if (response.errors && response.errors.length > 0) {
      const firstError = response.errors[0];
      msg += ` First error -- ${firstError.pdf}: ${firstError.error}`;
    }
    statusEl.textContent = msg;
  });
}

// ---------------------------------------------------------------------------
// Watch for the module list rendering (it loads via AJAX) and keep the
// panel's list in sync whenever it changes (e.g. more modules expanded).
// ---------------------------------------------------------------------------

function scanAndRender() {
  const entries = findPdfEntries();
  currentEntries = entries;
  renderList(entries);
}

let scanDebounceTimer = null;

const observer = new MutationObserver((mutations) => {
  // Ignore mutations that originated from our own panel (e.g. re-rendering
  // the list, checkbox changes, status text updates) so we don't trigger
  // an infinite scan -> render -> mutation -> scan loop.
  const panel = document.getElementById("paraverse-pdf-panel");
  const isOwnMutation =
    panel && mutations.every((m) => panel.contains(m.target));
  if (isOwnMutation) return;

  // Debounce: the page fires bursts of AJAX-driven DOM updates, so wait
  // for things to settle before re-scanning instead of doing it on every
  // single mutation record.
  clearTimeout(scanDebounceTimer);
  scanDebounceTimer = setTimeout(() => {
    if (document.querySelector(".module-content")) {
      scanAndRender();
    }
  }, 300);
});
observer.observe(document.body, { childList: true, subtree: true });

if (document.querySelector(".module-content")) {
  scanAndRender();
}
