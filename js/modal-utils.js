// Shared focus-trap helper for modal dialogs across the site (service info
// modal, lead add/edit + settings modals, booking + day-detail modals).
// Keeps Tab/Shift+Tab cycling inside the open modal instead of leaking focus
// out to the page behind it.
(function (window) {
  "use strict";

  var FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  var active = null;

  function getFocusable(container) {
    return Array.prototype.slice
      .call(container.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter(function (el) {
        return el.offsetParent !== null || el === document.activeElement;
      });
  }

  function release() {
    if (!active) return;
    active.modalEl.removeEventListener("keydown", active.handler);
    active = null;
  }

  function trap(modalEl) {
    if (!modalEl) return;
    release();

    function onKeydown(e) {
      if (e.key !== "Tab") return;
      var focusable = getFocusable(modalEl);
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    modalEl.addEventListener("keydown", onKeydown);
    active = { modalEl: modalEl, handler: onKeydown };
  }

  window.GDModal = { trap: trap, release: release };
})(window);
