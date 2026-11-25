// Apply the saved color mode before the first paint, including offline launches.
(() => {
  let preference = "system";
  try {
    preference = localStorage.getItem("little-day:theme") || "system";
  } catch {}
  if (!["system", "light", "dark"].includes(preference)) preference = "system";
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
