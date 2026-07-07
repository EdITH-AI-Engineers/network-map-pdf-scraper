// background.js
// Fetches each PDF using the browser's normal, already-authenticated
// session for paraverse.feutech.edu.ph (no cookie handling needed since
// the extension has host permission for that origin), then sends all of
// them in a single multipart POST to the local FastAPI server's
// /process endpoint, which runs the slide-extraction pipeline and
// returns per-file results.

const DEFAULT_PORT = 8000;

async function getBaseUrl() {
  const { uploadPort } = await chrome.storage.local.get("uploadPort");
  const port = uploadPort || DEFAULT_PORT;
  return `http://localhost:${port}`;
}

async function fetchPdfBlob(url) {
  // credentials: "include" so the paraverse session cookie is sent, same
  // as a normal logged-in page load would.
  const pdfResponse = await fetch(url, { credentials: "include" });
  if (!pdfResponse.ok) {
    throw new Error(`Fetch failed (${pdfResponse.status}) for ${url}`);
  }
  return pdfResponse.blob();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "downloadPdfs") return;

  (async () => {
    const baseUrl = await getBaseUrl();
    const processUrl = `${baseUrl}/process`;

    const form = new FormData();
    const fetchErrors = [];

    // Fetch every selected PDF first and add each as a "files" field --
    // the server's /process endpoint accepts multiple files in one
    // request (files: list[UploadFile]) and processes them as a batch.
    for (const { url, filename } of message.downloads) {
      // Keep just the leaf filename (drop the "paraverse-modules/" prefix
      // -- that was only meaningful for chrome.downloads' folder
      // structure; the server just wants a plain "Name.pdf").
      const leafName = filename.split("/").pop();
      try {
        const blob = await fetchPdfBlob(url);
        form.append("files", blob, leafName);
      } catch (e) {
        console.error("Fetch failed:", url, e);
        fetchErrors.push({ pdf: leafName, error: String(e) });
      }
    }

    let outputs = [];
    let errors = [...fetchErrors];

    // Only hit the server if at least one file was successfully fetched.
    const hasFiles = Array.from(form.keys()).includes("files");
    if (hasFiles) {
      try {
        const response = await fetch(processUrl, {
          method: "POST",
          body: form,
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(`Server error ${response.status}: ${detail}`);
        }
        const result = await response.json();
        outputs = result.outputs || [];
        errors = errors.concat(result.errors || []);
      } catch (e) {
        console.error("Processing request failed:", e);
        errors.push({ pdf: "(batch)", error: String(e) });
      }
    }

    sendResponse({
      succeeded: outputs.length,
      failed: errors.length,
      errors,
      processUrl,
    });
  })();

  return true; // keep the message channel open for the async response
});
