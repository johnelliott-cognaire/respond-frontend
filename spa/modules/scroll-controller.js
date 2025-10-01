// modules/scroll-controller.js
// Purpose: Left/right scrolling of a horizontally scrollable container

export class ScrollController {
  constructor(scrollerSelector, scrollLeftButtonSelector, scrollRightButtonSelector, scrollAmount = 150) {
    this.scrollerSelector = scrollerSelector;
    this.scrollLeftButtonSelector = scrollLeftButtonSelector;
    this.scrollRightButtonSelector = scrollRightButtonSelector;
    this.scrollAmount = scrollAmount;
    this.scrollerEl = null;
    this.scrollLeftBtn = null;
    this.scrollRightBtn = null;
    this.observer = null;
  }

  init() {
    if (this.initScrollerIfFound()) {
      return;
    }
    // If not found, observe DOM changes until it appears
    this.observer = new MutationObserver(() => {
      if (this.initScrollerIfFound()) {
        if (this.observer) {
          this.observer.disconnect();
          this.observer = null;
        }
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  initScrollerIfFound() {
    this.scrollerEl = document.querySelector(this.scrollerSelector);
    if (!this.scrollerEl) return false;

    this.scrollLeftBtn = document.querySelector(this.scrollLeftButtonSelector);
    this.scrollRightBtn = document.querySelector(this.scrollRightButtonSelector);
    if (!this.scrollLeftBtn || !this.scrollRightBtn) return false;

    // Attach events
    this.scrollLeftBtn.addEventListener("click", () => {
      console.log("Left arrow clicked");
      this.handleScroll("left");
    });
    
    this.scrollRightBtn.addEventListener("click", () => {
      console.log("Right arrow clicked");
      this.handleScroll("right");
    });

    return true;
  }

  handleScroll(direction) {
    if (!this.scrollerEl) return;
    const current = this.scrollerEl.scrollLeft;
    const maxScroll = this.scrollerEl.scrollWidth - this.scrollerEl.clientWidth;
    const newPos = (direction === "left")
      ? Math.max(0, current - this.scrollAmount)
      : Math.min(maxScroll, current + this.scrollAmount);
    this.scrollerEl.scrollLeft = newPos;
  }
}
