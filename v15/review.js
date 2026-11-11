const filesRoot = new URL(".", document.currentScript.src);
const params = new URLSearchParams(location.hash.slice(1));
const status = document.getElementById("status");

async function fetchFile(path) {
  const response = await fetch(new URL(path, filesRoot));
  if (!response.ok) throw new Error("Review file unavailable");
  return response;
}

function parseKey(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

async function decrypt(key, buffer) {
  const bytes = new Uint8Array(buffer);
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.subarray(0, 12) },
    key,
    bytes.subarray(12),
  );
}

async function fetchParts(name, count) {
  if (!Number.isInteger(count) || count < 1 || count > 32) throw new Error("Invalid part count");
  const paths = Array.from({ length: count }, (_, index) =>
    name + "-" + String(index + 1).padStart(2, "0") + ".bin");
  const parts = await Promise.all(paths.map(async path => (await fetchFile(path)).arrayBuffer()));
  return new Blob(parts).arrayBuffer();
}

function addHandoffDownload(key, count) {
  const row = document.createElement("div");
  row.className = "handoff-download";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Download tech handoff";
  const feedback = document.createElement("span");
  feedback.role = "status";
  row.append(button, feedback);
  document.querySelector("#ryc-paired-catalog .head").append(row);

  button.addEventListener("click", async () => {
    button.disabled = true;
    feedback.textContent = "Preparing download…";
    try {
      const archive = await decrypt(key, await fetchParts("handoff", count));
      const href = URL.createObjectURL(new Blob([archive], { type: "application/zip" }));
      const download = document.createElement("a");
      download.href = href;
      download.download = "RYC-Merch-Nov11-Noah-Handoff.zip";
      download.click();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
      feedback.textContent = "Download started.";
    } catch {
      feedback.textContent = "The download couldn’t open. Try again.";
    } finally {
      button.disabled = false;
    }
  });
}

async function openReview() {
  const accessKey = params.get("k");
  if (!accessKey || !/^[A-Za-z0-9_-]{43}$/.test(accessKey)) {
    status.textContent = "Open the full link you received to view the review.";
    return;
  }

  try {
    const key = await crypto.subtle.importKey("raw", parseKey(accessKey), "AES-GCM", false, ["decrypt"]);
    const manifest = await (await fetchFile("manifest.json")).json();
    const plaintext = await decrypt(key, await fetchParts("review", manifest.previewParts));
    const stream = new Blob([plaintext]).stream().pipeThrough(new DecompressionStream("gzip"));
    const html = await new Response(stream).text();
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const review = parsed.getElementById("ryc-paired-catalog");
    const reviewScript = review.querySelector("script");
    reviewScript.remove();
    document.getElementById("access").replaceWith(review);
    document.title = "Run Your City merch review";

    const script = document.createElement("script");
    script.textContent = reviewScript.textContent;
    document.body.append(script);

    review.querySelector("nav").addEventListener("click", event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const targetId = link.getAttribute("href").slice(1);
      const target = document.getElementById(targetId);
      if (!target) return;
      event.preventDefault();
      params.set("view", targetId);
      history.replaceState(null, "", "#" + params);
      target.scrollIntoView();
    });
    const selectedView = params.get("view");
    if (selectedView) document.getElementById(selectedView)?.scrollIntoView();

    addHandoffDownload(key, manifest.handoffParts);
  } catch {
    status.textContent = "This review couldn’t open. Check that you copied the full link and try again.";
  }
}

openReview();
