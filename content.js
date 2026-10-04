(function () {
  const MIN_SIZE = 24; // これより小さい要素(アイコン等)は対象外
  const DEBUG = false; // trueにすると、右下に検出件数バッジを表示しConsoleにログを出す
  const FAST_INTERVAL_MS = 1000; // 軽量な再スキャン間隔(常時)
  const FULL_INTERVAL_MS = 4000; // CSSクラス経由の背景画像も拾う重い再スキャン間隔(常時)

  const processed = new WeakSet();
  const elToBtn = new Map(); // 削除検知のため通常のMapを使用

  let attachedCount = 0;

  function log(...args) {
    if (DEBUG) console.log("[image-downloader]", ...args);
  }

  function extractBgUrl(bgImageValue) {
    if (!bgImageValue || bgImageValue === "none") return null;
    const match = /url\(["']?([^"')]+)["']?\)/.exec(bgImageValue);
    return match ? match[1] : null;
  }

  function isLikelyPhoto(url) {
    if (!url) return false;
    const lower = url.split("?")[0].toLowerCase();
    return !lower.endsWith(".svg");
  }

  function getBgUrlOfEl(el) {
    const val = el.style.backgroundImage || getComputedStyle(el).backgroundImage;
    return extractBgUrl(val);
  }

  function ensureBadge() {
    if (!DEBUG) return null;
    let b = document.getElementById("__img_dl_badge__");
    if (!b) {
      b = document.createElement("div");
      b.id = "__img_dl_badge__";
      b.style.cssText =
        "position:fixed;bottom:8px;right:8px;z-index:2147483647;background:rgba(0,0,0,.75);" +
        "color:#fff;font-size:11px;padding:4px 8px;border-radius:4px;font-family:sans-serif;pointer-events:none;";
      document.documentElement.appendChild(b);
    }
    return b;
  }

  function updateBadge() {
    const b = ensureBadge();
    if (b) b.textContent = `[画像DL] 検出 ${attachedCount} 件`;
  }

  function positionBtn(el, btn) {
    // position: fixed のビューポート座標をそのまま使う。
    // モーダル(position: fixed)・通常の一覧(スクロールで流れる要素)の
    // どちらでも、スクロール時にrepositionAll()で追従させれば正しい位置になる。
    const rect = el.getBoundingClientRect();
    btn.style.top = rect.top + 4 + "px";
    btn.style.left = rect.right - 30 + "px";
  }

  function onDownloadClick(e, getUrl, btn) {
    e.preventDefault();
    e.stopPropagation();
    const url = getUrl();
    if (!url) return;

    btn.classList.add("downloading");
    chrome.runtime.sendMessage({ type: "download-image", url }, (response) => {
      btn.classList.remove("downloading");
      if (!response || !response.ok) {
        btn.classList.add("error");
        setTimeout(() => btn.classList.remove("error"), 1200);
        log("ダウンロード失敗:", response && response.error);
      }
    });
  }

  function createBtn(getUrl) {
    const b = document.createElement("div");
    b.textContent = "⬇️";
    b.className = "img-downloader-btn";
    b.title = "画像をダウンロード";
    b.style.display = "flex"; // 見つけ次第すぐ表示する
    b.addEventListener("click", (e) => onDownloadClick(e, getUrl, b));
    document.documentElement.appendChild(b);
    return b;
  }

  // el: 対象要素(imgまたは背景画像を持つ要素)
  // getUrl: クリック時に最新のダウンロードURLを返す関数
  // (同じ要素が使い回されて中の画像だけ差し替わるSPAでも、
  //  getUrlはクリック時に毎回最新のURLを読みに行くので自動的に追従する)
  function attach(el, getUrl) {
    if (!el || processed.has(el)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) {
      if (el.tagName === "IMG") {
        el.addEventListener("load", () => attach(el, getUrl), { once: true });
      }
      // 背景画像要素はここで諦めず、常時走っている再スキャンで後から拾う
      return;
    }
    processed.add(el);
    const btn = createBtn(getUrl);
    elToBtn.set(el, btn);
    attachedCount++;
    positionBtn(el, btn);
    updateBadge();
  }

  // DOMから消えた要素のボタンを片付ける
  function removeIfTracked(el) {
    const btn = elToBtn.get(el);
    if (btn) {
      btn.remove();
      elToBtn.delete(el);
      processed.delete(el);
      attachedCount--;
      updateBadge();
    }
  }
  function cleanupRemovedNode(node) {
    if (node.nodeType !== 1) return;
    removeIfTracked(node);
    if (node.querySelectorAll) {
      node.querySelectorAll("*").forEach(removeIfTracked);
    }
  }

  function scanImages(root) {
    const imgs = root.querySelectorAll("img");
    imgs.forEach((img) => attach(img, () => img.currentSrc || img.src));
    return imgs.length;
  }

  function scanBackgroundImages(root, opts) {
    opts = opts || {};
    const candidates = new Set();

    root.querySelectorAll('[style*="background-image"]').forEach((el) => candidates.add(el));

    if (opts.full) {
      document.querySelectorAll("*").forEach((el) => {
        if (candidates.has(el) || processed.has(el)) return;
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg !== "none") candidates.add(el);
      });
    }

    let count = 0;
    candidates.forEach((el) => {
      const url = getBgUrlOfEl(el);
      if (!url || !isLikelyPhoto(url)) return;
      count++;
      attach(el, () => getBgUrlOfEl(el));
    });
    return count;
  }

  // 全ボタンの位置を再計算
  let repositionTicking = false;
  function repositionAll() {
    if (repositionTicking) return;
    repositionTicking = true;
    requestAnimationFrame(() => {
      elToBtn.forEach((btn, el) => {
        if (el.isConnected) positionBtn(el, btn);
        else removeIfTracked(el); // 念のためここでも掃除
      });
      repositionTicking = false;
    });
  }

  // 初回スキャン
  const initialImgCount = scanImages(document);
  const initialBgCount = scanBackgroundImages(document, { full: true });
  log(
    `初回スキャン: img要素${initialImgCount}個 / 背景画像候補${initialBgCount}個 / ボタン設置合計${attachedCount}個`
  );
  updateBadge();

  // 動的な変化(モーダル表示・ページ送り・フィルタ切り替え等)に即座に反応
  const mo = new MutationObserver((mutations) => {
    let dirty = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "IMG") {
          attach(node, () => node.currentSrc || node.src);
        } else if (node.querySelectorAll) {
          node.querySelectorAll("img").forEach((img) => attach(img, () => img.currentSrc || img.src));
        }
        dirty = true;
      }
      for (const node of m.removedNodes) {
        cleanupRemovedNode(node);
      }
      if (m.type === "attributes") dirty = true;
    }
    if (dirty) {
      scanBackgroundImages(document, { full: false });
      repositionAll();
    }
  });
  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"]
  });

  // 常時バックグラウンドで動く軽量な再スキャン(モーダル表示直後など、
  // MutationObserverのタイミングだけでは拾いきれないケースの保険)
  setInterval(() => {
    scanImages(document);
    scanBackgroundImages(document, { full: false });
    repositionAll();
  }, FAST_INTERVAL_MS);

  // CSSクラス経由の背景画像も拾うための、やや重い再スキャン(低頻度で常時)
  setInterval(() => {
    scanBackgroundImages(document, { full: true });
  }, FULL_INTERVAL_MS);

  window.addEventListener("scroll", repositionAll, true);
  window.addEventListener("resize", repositionAll);
})();
