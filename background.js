chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "download-image" && msg.url) {
    const filename = guessFilename(msg.url);
    chrome.downloads.download(
      {
        url: msg.url,
        filename: filename,
        saveAs: false
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("ダウンロード失敗:", chrome.runtime.lastError.message);
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true });
        }
      }
    );
    return true; // 非同期でsendResponseを使うため
  }
});

function guessFilename(url) {
  const timestamp = Date.now();

  if (url.startsWith("data:")) {
    const match = /^data:image\/([a-zA-Z0-9.+-]+);/.exec(url);
    const ext = match ? match[1].split("+")[0] : "png";
    return `downloaded-images/image_${timestamp}.${ext}`;
  }

  try {
    const u = new URL(url);
    let name = decodeURIComponent(u.pathname.split("/").pop() || "");
    name = name.replace(/[\\/:*?"<>|]/g, "_").trim();

    if (!name) name = `image_${timestamp}`;
    if (!/\.[a-zA-Z0-9]{2,5}$/.test(name)) {
      name += ".jpg";
    }
    return `downloaded-images/${name}`;
  } catch (e) {
    return `downloaded-images/image_${timestamp}.jpg`;
  }
}
