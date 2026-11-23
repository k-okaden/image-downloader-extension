// ページ本体(MAIN world)で動くスクリプト。
// 連続ダウンロードで「←/→キーを押した」ことにするために使う。
// content.js(isolated world)から作ったイベントでは keyCode / which がページ側に見えず、
// それらで判定しているサイトが反応しないため、ページ側でイベントを作って送る。
(function () {
  const KEY_CODES = { ArrowLeft: 37, ArrowRight: 39 };

  window.addEventListener("__img_dl_press_key__", (e) => {
    const key = e.detail;
    const keyCode = KEY_CODES[key];
    if (!keyCode) return;

    const active = document.activeElement;
    const typing =
      active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
    const target = active && active !== document.documentElement && !typing ? active : document.body;

    for (const type of ["keydown", "keyup"]) {
      const ev = new KeyboardEvent(type, { key, code: key, bubbles: true, cancelable: true, composed: true });
      Object.defineProperty(ev, "keyCode", { get: () => keyCode });
      Object.defineProperty(ev, "which", { get: () => keyCode });
      target.dispatchEvent(ev);
    }
  });
})();
