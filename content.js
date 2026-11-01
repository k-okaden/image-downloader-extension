(function () {
  const MIN_SIZE = 24; // これより小さい要素(アイコン等)は対象外
  const DEBUG = false; // trueにすると、右下に検出件数バッジを表示しConsoleにログを出す
  const FAST_INTERVAL_MS = 1000; // 軽量な再スキャン間隔(常時)
  const FULL_INTERVAL_MS = 4000; // CSSクラス経由の背景画像も拾う重い再スキャン間隔(常時)

  const processed = new WeakSet();
  const elToBtn = new Map(); // 削除検知のため通常のMapを使用
  const elToGetUrl = new Map(); // 集中ダウンロードモードで対象要素のURLを取り出すため
  const FOCUS_KEY = "d"; // 集中ダウンロードモード中にこのキーで一番大きい画像を保存
  const FOCUS_STORAGE_KEY = "focusMode";

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
    elToGetUrl.set(el, getUrl);
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
      elToGetUrl.delete(el);
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

  // ---- 集中ダウンロードモード ----
  // 右上のトグルでON/OFF。ONの間は FOCUS_KEY を押すと、
  // 画面内に見えている面積が一番大きい画像をダウンロードする。
  let focusMode = false;

  function visibleArea(el) {
    const r = el.getBoundingClientRect();
    const w = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
    const h = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    return w > 0 && h > 0 ? w * h : 0;
  }

  function findLargestVisible() {
    let best = null;
    let bestArea = 0;
    elToGetUrl.forEach((getUrl, el) => {
      if (!el.isConnected) return;
      const area = visibleArea(el);
      if (area > bestArea && getUrl()) {
        best = el;
        bestArea = area;
      }
    });
    return best;
  }

  function flashTarget(el, ok) {
    const r = el.getBoundingClientRect();
    const f = document.createElement("div");
    f.className = "img-downloader-flash" + (ok ? "" : " error");
    f.style.top = Math.max(r.top, 0) + "px";
    f.style.left = Math.max(r.left, 0) + "px";
    f.style.width = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0) + "px";
    f.style.height = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0) + "px";
    document.documentElement.appendChild(f);
    setTimeout(() => f.remove(), 500);
  }

  function downloadLargest() {
    const el = findLargestVisible();
    if (!el) {
      log("集中ダウンロード: 対象画像なし");
      return;
    }
    const url = elToGetUrl.get(el)();
    chrome.runtime.sendMessage({ type: "download-image", url }, (response) => {
      const ok = !!(response && response.ok);
      flashTarget(el, ok);
      if (!ok) log("ダウンロード失敗:", response && response.error);
    });
  }

  function isTypingTarget(t) {
    if (!t) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (!focusMode) return;
      if (e.key.toLowerCase() !== FOCUS_KEY) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      downloadLargest();
    },
    true
  );

  // 右上のトグル(ページ内オーバーレイ)
  // 拡張機能のUIとして描画されるので、ページのCSSに影響されないようShadow DOMに入れる
  let toggleInput = null;
  function createToggle() {
    const host = document.createElement("div");
    host.id = "__img_dl_focus_toggle__";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; position: fixed; top: 8px; right: 8px; z-index: 2147483647; }
        label { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 14px;
          background: rgba(0,0,0,.65); color: #fff; font: 12px/1 sans-serif; cursor: pointer;
          user-select: none; box-shadow: 0 1px 4px rgba(0,0,0,.4); opacity: .7; transition: opacity .15s; }
        label:hover, label.on { opacity: 1; }
        input { display: none; }
        .sw { position: relative; width: 26px; height: 14px; border-radius: 7px; background: #888; transition: background .15s; }
        .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 10px; height: 10px;
          border-radius: 50%; background: #fff; transition: transform .15s; }
        input:checked + .sw { background: #2e9e4f; }
        input:checked + .sw::after { transform: translateX(12px); }
      </style>
      <label title="ONの間、${FOCUS_KEY.toUpperCase()}キーで画面内の一番大きい画像を保存">
        <input type="checkbox"><span class="sw"></span><span>集中DL (${FOCUS_KEY.toUpperCase()})</span>
      </label>`;
    toggleInput = shadow.querySelector("input");
    const label = shadow.querySelector("label");
    toggleInput.addEventListener("change", () => {
      chrome.storage.local.set({ [FOCUS_STORAGE_KEY]: toggleInput.checked });
    });
    host.__label = label;
    document.documentElement.appendChild(host);
    return host;
  }

  const toggleHost = createToggle();

  function applyFocusMode(on) {
    focusMode = !!on;
    toggleInput.checked = focusMode;
    toggleHost.__label.classList.toggle("on", focusMode);
  }

  // ON/OFFは全タブ共通で保存し、他タブでの切り替えにも追従する
  chrome.storage.local.get(FOCUS_STORAGE_KEY, (res) => applyFocusMode(res[FOCUS_STORAGE_KEY]));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[FOCUS_STORAGE_KEY]) {
      applyFocusMode(changes[FOCUS_STORAGE_KEY].newValue);
    }
  });
})();
