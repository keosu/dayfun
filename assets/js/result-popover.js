// A short, non-blocking confirmation, shown only after the model has revealed the answer.
export function createResultPopover(playground) {
  const popover = document.createElement("div");
  popover.className = "result-popover";
  popover.hidden = true;
  popover.setAttribute("aria-hidden", "true");
  const caption = document.createElement("span");
  caption.textContent = "这次，就选它";
  const value = document.createElement("strong");
  popover.append(caption, value);
  playground.append(popover);
  let showTimer, hideTimer;
  function hide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    popover.classList.remove("show");
    popover.hidden = true;
  }
  return {
    hide,
    reveal(result) {
      hide();
      value.textContent = result;
      showTimer = setTimeout(() => {
        const stage = playground.querySelector("#picker-scene");
        if (
          stage?.dataset.phase !== "result" ||
          stage.dataset.visualResult !== "visible"
        )
          return;
        popover.hidden = false;
        requestAnimationFrame(() => popover.classList.add("show"));
        hideTimer = setTimeout(() => {
          popover.classList.remove("show");
          hideTimer = setTimeout(() => {
            popover.hidden = true;
          }, 300);
        }, 2300);
      }, 650);
    },
  };
}
