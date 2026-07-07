// background.js
// Fetches each PDF using the browser's normal, already-authenticated
// session for paraverse.feutech.edu.ph (no cookie handling needed since
// the extension has host permission for that origin), then forwards the
// raw bytes to a local FastAPI server for processing -- instead of
// saving them through chrome.downloads.

const DEFAULT_PORT = 8000;

async function getUploadEndpoint() {
  const { uploadPort } = await chrome.storage.local.get("uploadPort");
  const port = uploadPort || DEFAULT_PORT;
  return `http://localhost:${port}/upload`;
}

async function fetchAndUpload(url, filename, uploadEndpoint) {
  // credentials: "include" so the paraverse session cookie is sent, same
  // as a normal logged-in page load would.
  const pdfResponse = await fetch(url, { credentials: "include" });
  if (!pdfResponse.ok) {
    throw new Error(`Fetch failed (${pdfResponse.status}) for ${url}`);
  }
  const blob = await pdfResponse.blob();

  const form = new FormData();
  // Keep just the leaf filename (drop the "paraverse-modules/" prefix --
  // that was only meaningful for chrome.downloads' folder structure).
  const leafName = filename.split("/").pop();
  form.append("file", blob, leafName);
  form.append("filename", leafName);
  form.append("source_url", url);

  const uploadResponse = await fetch(uploadEndpoint, {
    method: "POST",
    body: form,
  });

  if (!uploadResponse.ok) {
    throw new Error(
      `Upload failed (${uploadResponse.status}) for ${leafName}`
    );
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "downloadPdfs") return;

  (async () => {
    const uploadEndpoint = await getUploadEndpoint();
    let succeeded = 0;
    let failed = 0;

    for (const { url, filename } of message.downloads) {
      try {
        await fetchAndUpload(url, filename, uploadEndpoint);
        succeeded++;
      } catch (e) {
        console.error("Upload failed:", url, e);
        failed++;
      }
      // Small stagger so the local server (and Paraverse) aren't hit with
      // dozens of simultaneous requests at once.
      await new Promise((r) => setTimeout(r, 300));
    }

    sendResponse({ succeeded, failed, uploadEndpoint });
  })();

  return true; // keep the message channel open for the async response
});
