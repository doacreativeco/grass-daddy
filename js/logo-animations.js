(function () {
  "use strict";

  function hasAnimation(el) {
    var name = getComputedStyle(el).animationName;
    return name && name !== "none";
  }

  function restart(card) {
    var stage = card.querySelector(".card__stage");
    if (!stage) return;
    var els = [stage].concat(Array.prototype.slice.call(stage.querySelectorAll("*")));
    els.forEach(function (el) {
      if (hasAnimation(el)) {
        var prev = el.style.animation;
        el.style.animation = "none";
        // eslint-disable-next-line no-unused-expressions
        el.offsetHeight; // force reflow so the animation restarts cleanly
        el.style.animation = prev || "";
      }
    });
  }

  function sweep(card) {
    var light = card.querySelector(".sweep-light");
    if (!light) return;
    light.classList.remove("is-sweeping");
    // eslint-disable-next-line no-unused-expressions
    light.offsetHeight;
    light.classList.add("is-sweeping");
  }

  function toggleLoop(card, btn) {
    var stage = card.querySelector(".card__stage");
    if (!stage) return;
    var paused = btn.getAttribute("data-paused") === "true";
    var els = [stage].concat(Array.prototype.slice.call(stage.querySelectorAll("*")));
    els.forEach(function (el) {
      if (hasAnimation(el)) {
        el.style.animationPlayState = paused ? "running" : "paused";
      }
    });
    btn.setAttribute("data-paused", paused ? "false" : "true");
    btn.textContent = paused ? "Pause" : "Play";
  }

  document.querySelectorAll(".btn[data-action]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var card = btn.closest(".card");
      if (!card) return;
      var action = btn.getAttribute("data-action");
      if (action === "replay") restart(card);
      else if (action === "sweep") sweep(card);
      else if (action === "toggle-loop") toggleLoop(card, btn);
    });
  });

  var sweepCard = document.querySelector('[data-card="sweep"]');
  if (sweepCard) {
    var plate = sweepCard.querySelector(".plate--hover");
    if (plate) {
      plate.addEventListener("mouseenter", function () {
        sweep(sweepCard);
      });
    }
  }
})();
