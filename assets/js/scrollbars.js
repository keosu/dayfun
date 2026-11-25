// A transparent track with a short lived thumb, only while scrolling.
export function initScrollbars() {
  const timers = new WeakMap();
  document.addEventListener(
    "scroll",
    (event) => {
      const element =
        event.target === document ? document.documentElement : event.target;
      if (!(element instanceof Element)) return;
      element.classList.add("is-scrolling");
      clearTimeout(timers.get(element));
      timers.set(
        element,
        setTimeout(() => element.classList.remove("is-scrolling"), 850),
      );
    },
    { capture: true, passive: true },
  );
}
