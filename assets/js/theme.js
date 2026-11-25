export const themeEvent = "little-day:theme";
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
let preference = "system";
try {
  preference = localStorage.getItem("little-day:theme") || "system";
} catch {}
if (!["system", "light", "dark"].includes(preference)) preference = "system";

export function getThemePreference() {
  return preference;
}
export function isDarkTheme() {
  return document.documentElement.dataset.theme === "dark";
}
function applyTheme() {
  const theme =
    preference === "system"
      ? systemTheme.matches
        ? "dark"
        : "light"
      : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#171a22" : "#f7f6f2");
  window.dispatchEvent(
    new CustomEvent(themeEvent, { detail: { theme, preference } }),
  );
}
export function setThemePreference(value) {
  if (!["system", "light", "dark"].includes(value)) return;
  preference = value;
  try {
    localStorage.setItem("little-day:theme", value);
  } catch {}
  applyTheme();
}
applyTheme();
systemTheme.addEventListener("change", () => {
  if (preference === "system") applyTheme();
});
window.addEventListener("storage", (event) => {
  if (event.key !== "little-day:theme") return;
  preference = ["light", "dark"].includes(event.newValue)
    ? event.newValue
    : "system";
  applyTheme();
});
