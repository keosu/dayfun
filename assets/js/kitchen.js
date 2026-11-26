import {
  $,
  $$,
  modal,
  toast,
  escapeHTML as esc,
  dateLabel,
  safeImage,
  emptyState,
  asset,
  toolbar,
} from "./ui.js";
import { icon } from "./icons.js";
import { recipes, cuisines } from "./recipes.js";
import { list, get, put, remove, changeEvent } from "./storage.js";
import { compressPhoto } from "./photos.js";

const tabs = [
  { id: "public", text: "菜谱" },
  { id: "own", text: "我的菜" },
  { id: "favorites", text: "收藏" },
  { id: "orders", text: "点菜" },
  { id: "records", text: "记录" },
];
let tab = "public";
let cuisine = "全部";
let search = "";
let own = [],
  favorites = new Set(),
  reviews = [],
  orders = [],
  cart = { items: [] };

const template = () =>
  /* HTML */ `<div class="kt">
    ${toolbar(
      "🍳 今天吃什么",
      /* HTML */ `<button class="tb-pill primary" id="add-recipe">
        ${icon("plus")} 添加
      </button>`,
    )}
    <nav class="kt-tabs" aria-label="厨房分类">
      ${tabs.map((item) => /* HTML */ `<button data-tab="${item.id}" class="kt-tab">${item.text}${item.id === "orders" ? '<span id="cart-count" class="count-badge">0</span>' : ""}</button>`).join("")}
    </nav>
    <div class="kt-filters" id="catalog-toolbar">
      <label class="kt-search"
        >${icon("search")}<input
          type="search"
          id="recipe-search"
          placeholder="搜菜名、食材…"
          aria-label="搜索菜谱"
      /></label>
      <select id="cuisine-select" aria-label="按菜系筛选">
        ${cuisines.map((item) => /* HTML */ `<option value="${item}">${item === "全部" ? "全部菜系" : item}</option>`).join("")}
      </select>
    </div>
    <section
      class="kt-scroll"
      id="kitchen-content"
      aria-live="polite"
    ></section>
  </div>`;

async function loadData() {
  const results = await Promise.all([
    list("recipe"),
    list("favorite"),
    list("review"),
    list("order"),
    get("order:cart"),
  ]);
  own = results[0].map((record) => ({
    ...record.payload,
    recordId: record.id,
    source: "own",
  }));
  favorites = new Set(results[1].map((record) => record.payload.recipeId));
  reviews = results[2];
  orders = results[3].filter((record) => record.payload.status === "completed");
  cart = results[4] || { items: [] };
}
function collection() {
  return [...own, ...recipes];
}
function findRecipe(id) {
  return collection().find((recipe) => recipe.id === id);
}
function rating(id) {
  const ratings = reviews.filter((record) => record.payload.recipeId === id);
  return {
    count: ratings.length,
    average: ratings.length
      ? (
          ratings.reduce((sum, record) => sum + record.payload.rating, 0) /
          ratings.length
        ).toFixed(1)
      : null,
  };
}
function card(recipe) {
  const score = rating(recipe.id);
  const inCart = cart.items.some((item) => item.recipeId === recipe.id);
  const meta = [
    recipe.cuisine,
    recipe.minutes ? `${recipe.minutes} 分钟` : "",
  ].filter(Boolean);
  return /* HTML */ `<article class="kt-card">
    <button
      class="kt-photo"
      data-open="${esc(recipe.id)}"
      aria-label="查看${esc(recipe.name)}"
    >
      <img
        src="${safeImage(recipe.image)}"
        alt="${esc(recipe.name)}"
        loading="lazy"
      />
    </button>
    <button
      class="kt-fav ${favorites.has(recipe.id) ? "on" : ""}"
      data-favorite="${esc(recipe.id)}"
      aria-label="${favorites.has(recipe.id) ? "取消收藏" : "收藏"}${esc(recipe.name)}"
      aria-pressed="${favorites.has(recipe.id)}"
    >
      ${icon("heart")}
    </button>
    <div class="kt-info">
      <button class="kt-name" data-open="${esc(recipe.id)}">
        ${esc(recipe.name)}
      </button>
      <span class="kt-meta"
        >${esc(meta.join(" · "))}${score.average ? /* HTML */ ` <em class="recipe-rating">★ ${score.average}</em>` : ""}</span
      >
    </div>
    <button
      class="kt-add ${inCart ? "added" : ""}"
      data-cart="${esc(recipe.id)}"
      aria-label="${inCart ? "从清单移除" : "点菜"}${esc(recipe.name)}"
    >
      ${icon(inCart ? "check" : "plus")}${inCart ? "已点" : "点菜"}
    </button>
  </article>`;
}
function render() {
  $$(".kt-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
    button.setAttribute(
      "aria-current",
      button.dataset.tab === tab ? "page" : "false",
    );
  });
  const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  $("#cart-count").textContent = count;
  $("#cart-count").hidden = !count;
  $("#catalog-toolbar").hidden = ["orders", "records"].includes(tab);
  $("#cuisine-select").value = cuisine;
  if (tab === "orders") {
    renderOrders();
    return;
  }
  if (tab === "records") {
    renderRecords();
    return;
  }
  let filtered =
    tab === "own"
      ? own
      : tab === "favorites"
        ? collection().filter((recipe) => favorites.has(recipe.id))
        : recipes;
  if (cuisine !== "全部")
    filtered = filtered.filter((recipe) => recipe.cuisine === cuisine);
  if (search)
    filtered = filtered.filter((recipe) =>
      `${recipe.name} ${recipe.cuisine} ${recipe.region} ${(recipe.ingredients || []).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  $("#kitchen-content").innerHTML = filtered.length
    ? /* HTML */ `<div class="kt-grid">${filtered.map(card).join("")}</div>
        ${
          tab === "public"
            ? '<button class="text-button kt-credits" id="photo-credits">图片来源</button>'
            : ""
        }`
    : emptyState({
        symbol: tab === "own" ? "📷" : tab === "favorites" ? "💛" : "🥕",
        title:
          search || cuisine !== "全部"
            ? "还没找到这道味道"
            : tab === "own"
              ? "你的拿手菜，值得被记住"
              : "把喜欢的菜，收藏起来",
        text:
          search || cuisine !== "全部"
            ? "换个关键词或菜系，再试试看。"
            : tab === "own"
              ? "拍张照、写个名字就能记下一道菜。"
              : "点击菜谱上的爱心，下一次想吃就能找到。",
        action:
          tab === "own"
            ? /* HTML */ `<button class="button primary" id="empty-add">
                ${icon("camera")} 记录第一道菜
              </button>`
            : "",
      });
  $("#empty-add")?.addEventListener("click", () => recipeForm());
}

function selectTab(id) {
  tab = id;
  cuisine = "全部";
  search = "";
  $("#recipe-search").value = "";
  history.replaceState(
    null,
    "",
    id === "public" ? "#/kitchen" : `#/kitchen?tab=${id}`,
  );
  render();
  $("#kitchen-content").scrollTop = 0;
}
function bindEvents() {
  $$(".kt-tab").forEach(
    (button) => (button.onclick = () => selectTab(button.dataset.tab)),
  );
  $("#cuisine-select").onchange = (event) => {
    cuisine = event.target.value;
    render();
  };
  $("#recipe-search").oninput = (event) => {
    search = event.target.value.trim();
    render();
  };
  $("#add-recipe").onclick = () => recipeForm();
  $("#kitchen-content").addEventListener("click", async (event) => {
    if (event.target.closest("#photo-credits")) return showCredits();
    const open = event.target.closest("[data-open]");
    if (open) {
      showRecipe(open.dataset.open);
      return;
    }
    const favorite = event.target.closest("[data-favorite]");
    if (favorite) {
      await toggleFavorite(favorite.dataset.favorite);
      return;
    }
    const add = event.target.closest("[data-cart]");
    if (add) {
      await toggleCart(add.dataset.cart);
      return;
    }
  });
}
async function toggleFavorite(id) {
  if (favorites.has(id)) {
    await remove(`favorite:${id}`);
    favorites.delete(id);
    toast("已取消收藏");
  } else {
    await put("favorite", { recipeId: id }, `favorite:${id}`);
    favorites.add(id);
    toast("已收藏这道好味道");
  }
  render();
}
async function toggleCart(id) {
  const recipe = findRecipe(id);
  if (!recipe) return;
  if (cart.items.some((item) => item.recipeId === id)) {
    cart.items = cart.items.filter((item) => item.recipeId !== id);
    toast("已从点菜清单移除");
  } else {
    cart.items.push({
      recipeId: id,
      name: recipe.name,
      image: recipe.image,
      quantity: 1,
    });
    toast(`「${recipe.name}」已加入点菜清单`);
  }
  await put("order", cart, "order:cart");
  render();
}

function showRecipe(id) {
  const recipe = findRecipe(id);
  if (!recipe) return;
  const score = rating(id);
  const ingredients = recipe.ingredients || [];
  const steps = recipe.steps || [];
  const dialog = modal({
    title: recipe.name,
    eyebrow:
      [recipe.cuisine, recipe.region].filter(Boolean).join(" · ") || "我的厨房",
    className: "recipe-detail-modal sheet",
    content: /* HTML */ `<img
        class="detail-photo"
        src="${safeImage(recipe.image)}"
        alt="${esc(recipe.name)}"
      />
      <div class="detail-meta">
        ${recipe.minutes ? /* HTML */ `<span>${icon("clock")} ${esc(recipe.minutes)} 分钟</span>` : ""}
        ${recipe.difficulty ? /* HTML */ `<span>${icon("leaf")} ${esc(recipe.difficulty)}</span>` : ""}
        <span
          >${icon("star")}
          ${score.average ? `${score.average} · ${score.count} 次记录` : "等你来评分"}</span
        >
      </div>
      ${recipe.description ? /* HTML */ `<p class="detail-description">${esc(recipe.description)}</p>` : ""}
      <div class="detail-actions">
        <button class="button secondary" id="detail-favorite">
          ${icon("heart")} ${favorites.has(id) ? "已收藏" : "收藏这道菜"}</button
        ><button class="button primary" id="detail-order">
          ${icon("bag")}
          ${cart.items.some((item) => item.recipeId === id) ? "已加入清单" : "加入点菜清单"}
        </button>
      </div>
      ${
        ingredients.length
          ? /* HTML */ `<section class="detail-section">
              <h3>
                准备食材
                <span
                  >${recipe.source === "own" ? "按你的记录" : "约 2 人份"}</span
                >
              </h3>
              <div class="ingredient-list">
                ${ingredients.map((item) => /* HTML */ `<label><input type="checkbox" /><span>${esc(item)}</span></label>`).join("")}
              </div>
            </section>`
          : ""
      }
      ${
        steps.length
          ? /* HTML */ `<section class="detail-section">
              <h3>一步步，做出好味道</h3>
              <ol class="cooking-steps">
                ${steps
                  .map(
                    (step, i) =>
                      /* HTML */ `<li>
                        <span>${String(i + 1).padStart(2, "0")}</span>
                        <p>${esc(step)}</p>
                      </li>`,
                  )
                  .join("")}
              </ol>
            </section>`
          : recipe.source === "own" && !ingredients.length
            ? '<p class="muted center">还没写材料和做法，点下面的「编辑菜谱」随时补充。</p>'
            : ""
      }
      ${
        recipe.tip
          ? /* HTML */ `<div class="recipe-tip">
              ${icon("sparkle")}
              <p>${esc(recipe.tip)}</p>
            </div>`
          : ""
      }<button class="button dark full-width" id="review-recipe">
        ${icon("star")} 做过这道菜？记下味道</button
      >${recipe.source === "own" ? /* HTML */ `<div class="own-recipe-actions"><button class="text-button" id="edit-recipe">编辑菜谱</button><button class="text-button danger-text" id="delete-recipe">${icon("trash")} 删除这道菜</button></div>` : ""}`,
  });
  $("#detail-favorite", dialog).onclick = async (event) => {
    const button = event.currentTarget;
    await toggleFavorite(id);
    button.innerHTML = `${icon("heart")} ${favorites.has(id) ? "已收藏" : "收藏这道菜"}`;
  };
  $("#detail-order", dialog).onclick = async (event) => {
    const button = event.currentTarget;
    await toggleCart(id);
    button.innerHTML = `${icon("bag")} ${cart.items.some((item) => item.recipeId === id) ? "已加入清单" : "加入点菜清单"}`;
  };
  $("#review-recipe", dialog).onclick = () => reviewForm(recipe);
  $("#edit-recipe", dialog)?.addEventListener("click", () =>
    recipeForm(recipe),
  );
  $("#delete-recipe", dialog)?.addEventListener("click", () => {
    const confirm = modal({
      title: "删除这道拿手菜？",
      content: /* HTML */ `<p>
          「${esc(recipe.name)}」会从你的厨房移除，已经留下的烹饪和点菜记录会保留。
        </p>
        <div class="button-row">
          <button class="button secondary" id="keep-recipe">再想想</button
          ><button class="button danger" id="confirm-delete">删除菜谱</button>
        </div>`,
    });
    $("#keep-recipe", confirm).onclick = () => showRecipe(id);
    $("#confirm-delete", confirm).onclick = async () => {
      await remove(recipe.recordId);
      await remove(`favorite:${id}`);
      cart.items = cart.items.filter((item) => item.recipeId !== id);
      await put("order", cart, "order:cart");
      await loadData();
      render();
      confirm.close();
      toast("菜谱已删除");
    };
  });
}

function recipeForm(existing) {
  let image = existing?.image || "";
  let processingPhoto = false;
  const hasExtra = Boolean(
    existing &&
    (existing.description ||
      existing.tip ||
      existing.minutes ||
      existing.difficulty ||
      existing.ingredients?.length ||
      existing.steps?.length ||
      (existing.region && existing.region !== "我的厨房")),
  );
  const dialog = modal({
    title: existing ? "编辑这道菜" : "添加一道菜",
    className: "recipe-form-modal sheet",
    content: /* HTML */ `<form id="recipe-form">
      <label class="photo-upload ${image ? "has-photo" : ""}"
        ><img
          id="photo-preview"
          src="${image ? safeImage(image) : ""}"
          alt="菜品照片预览"
          ${image ? "" : "hidden"} /><span id="photo-placeholder"
          >${icon("camera")}<strong
            >${image ? "点击更换照片" : "拍张照片"}</strong
          ><small>拍照或选择图片，自动压缩</small></span
        ><input
          name="photo"
          type="file"
          accept="image/*"
          capture="environment"
          hidden /></label
      ><label class="field"
        >菜名 <span class="required">*</span
        ><input
          name="name"
          required
          maxlength="40"
          placeholder="例如：妈妈的红烧排骨"
          value="${esc(existing?.name || "")}"
      /></label>
      <details class="kt-more" ${hasExtra ? "open" : ""}>
        <summary>更多信息（选填）</summary>
        <div class="form-two-columns">
          <label class="field"
            >菜系<select name="cuisine">
              ${["家常菜", ...cuisines.slice(2), "我的独创"].map((item) => /* HTML */ `<option ${item === existing?.cuisine ? "selected" : ""}>${item}</option>`).join("")}
            </select></label
          ><label class="field"
            >用时（分钟）<input
              name="minutes"
              type="number"
              min="0"
              max="1440"
              placeholder="不填"
              value="${existing?.minutes || ""}"
          /></label>
        </div>
        <div class="form-two-columns">
          <label class="field"
            >难度<select name="difficulty">
              <option value="">不填</option>
              ${["简单", "适中", "进阶"].map((item) => /* HTML */ `<option ${item === existing?.difficulty ? "selected" : ""}>${item}</option>`).join("")}
            </select></label
          ><label class="field"
            >地方 / 记忆<input
              name="region"
              maxlength="40"
              placeholder="例如：家乡的味道"
              value="${esc(existing?.region === "我的厨房" ? "" : existing?.region || "")}"
          /></label>
        </div>
        <label class="field"
          >这道菜的小故事<textarea
            name="description"
            rows="2"
            maxlength="300"
            placeholder="为什么喜欢它，或是谁教你做的…"
          >
${esc(existing?.description || "")}</textarea></label
        ><label class="field"
          >材料<textarea
            name="ingredients"
            rows="3"
            maxlength="6000"
            placeholder="每行一项，例如：&#10;排骨 500 克&#10;冰糖 20 克"
          >
${esc((existing?.ingredients || []).join("\n"))}</textarea></label
        ><label class="field"
          >做法<textarea
            name="steps"
            rows="3"
            maxlength="12000"
            placeholder="每行一个步骤"
          >
${esc((existing?.steps || []).join("\n"))}</textarea></label
        ><label class="field"
          >小窍门<input
            name="tip"
            maxlength="300"
            placeholder="下次做的时候，记得…"
            value="${esc(existing?.tip || "")}"
        /></label>
      </details>
      <p id="recipe-form-status" class="form-status" role="status"></p>
      <button type="submit" class="button primary full-width">
        ${icon("check")} ${existing ? "保存修改" : "保存"}
      </button>
    </form>`,
  });
  const form = $("#recipe-form", dialog);
  form.elements.photo.onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    processingPhoto = true;
    $("#recipe-form-status", dialog).textContent = "正在压缩照片…";
    try {
      image = await compressPhoto(file);
      $("#photo-preview", dialog).src = image;
      $("#photo-preview", dialog).hidden = false;
      $(".photo-upload", dialog).classList.add("has-photo");
      $("#photo-placeholder strong", dialog).textContent = "点击更换照片";
      $("#recipe-form-status", dialog).textContent =
        "照片已准备好，保存菜谱后会一起保存。";
    } catch (error) {
      $("#recipe-form-status", dialog).textContent = error.message;
    } finally {
      processingPhoto = false;
    }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (processingPhoto) {
      toast("照片还在处理中，请稍等");
      return;
    }
    const data = new FormData(form);
    const lines = (key) =>
      String(data.get(key) || "")
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
    const ingredients = lines("ingredients");
    const steps = lines("steps");
    const name = data.get("name").trim();
    if (!name) {
      $("#recipe-form-status", dialog).textContent = "给这道菜起个名字吧。";
      return;
    }
    if (
      ingredients.length > 100 ||
      steps.length > 100 ||
      ingredients.some((item) => item.length > 1000) ||
      steps.some((item) => item.length > 2000)
    ) {
      $("#recipe-form-status", dialog).textContent =
        "材料和步骤各最多 100 行；每项材料最多 1000 字，每个步骤最多 2000 字。";
      return;
    }
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    try {
      const id = existing?.id || `custom-${crypto.randomUUID()}`;
      await put(
        "recipe",
        {
          id,
          name,
          cuisine: data.get("cuisine"),
          region: data.get("region").trim() || "我的厨房",
          minutes: Number(data.get("minutes")) || 0,
          difficulty: data.get("difficulty") || "",
          emoji: "🍳",
          description: data.get("description").trim(),
          ingredients,
          steps,
          tip: data.get("tip").trim(),
          tags: [],
          image: image || "/images/home-food.jpg",
        },
        `recipe:${id}`,
      );
      await loadData();
      tab = "own";
      cuisine = "全部";
      search = "";
      $("#recipe-search").value = "";
      render();
      dialog.close();
      toast(existing ? "拿手菜已更新" : "一道好味道，已经记住啦");
    } catch (error) {
      $("#recipe-form-status", dialog).textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
}

function reviewForm(recipe) {
  let selectedRating = 5;
  const dialog = modal({
    title: "把这次的好味道记下来",
    eyebrow: recipe.name,
    content: /* HTML */ `<form id="review-form">
      <p class="center muted">这次做得怎么样？</p>
      <div class="star-picker" aria-label="选择评分">
        ${[1, 2, 3, 4, 5].map((value) => /* HTML */ `<button type="button" data-rating="${value}" class="selected" aria-label="${value} 星" aria-pressed="${value === 5}">${icon("star")}</button>`).join("")}
      </div>
      <p class="rating-label center" id="rating-label">
        5 星 · 太好吃了，下次还做！
      </p>
      <label class="field"
        >做菜日期<input
          type="date"
          name="date"
          required
          value="${localDate()}" /></label
      ><label class="field"
        >想记住些什么？<textarea
          name="note"
          rows="4"
          maxlength="2000"
          placeholder="味道如何？下次想改进哪里？一起吃饭的人喜欢吗？"
        ></textarea></label
      ><button class="button primary full-width" type="submit">
        ${icon("check")} 保存美味记录
      </button>
    </form>`,
  });
  $$(".star-picker button", dialog).forEach(
    (button) =>
      (button.onclick = () => {
        selectedRating = Number(button.dataset.rating);
        $$(".star-picker button", dialog).forEach((item) => {
          item.classList.toggle(
            "selected",
            Number(item.dataset.rating) <= selectedRating,
          );
          item.setAttribute(
            "aria-pressed",
            Number(item.dataset.rating) === selectedRating,
          );
        });
        $("#rating-label", dialog).textContent =
          `${selectedRating} 星 · ${["还需要练习一下", "下次继续加油", "不错，有进步", "很好吃，值得再做", "太好吃了，下次还做！"][selectedRating - 1]}`;
      }),
  );
  $("#review-form", dialog).onsubmit = async (event) => {
    event.preventDefault();
    const button = $('button[type="submit"]', event.target);
    button.disabled = true;
    try {
      await put("review", {
        recipeId: recipe.id,
        recipeName: recipe.name,
        image: recipe.image,
        rating: selectedRating,
        date: event.target.elements.date.value,
        note: event.target.elements.note.value.trim(),
        at: Date.now(),
      });
      await loadData();
      render();
      dialog.close();
      toast("这次的味道，记住了");
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
    }
  };
}
function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function renderOrders() {
  $("#kitchen-content").innerHTML = /* HTML */ `<div class="orders-layout">
    <section class="panel cart-panel">
      <div class="panel-title">
        <h2>${icon("bag")} 这一餐，想吃这些</h2>
        <span class="tag peach">${cart.items.length} 道菜</span>
      </div>
      ${
        cart.items.length
          ? /* HTML */ `<div class="cart-items">
                ${cart.items
                  .map(
                    (item) =>
                      /* HTML */ `<div class="cart-item">
                        <img
                          src="${safeImage(item.image)}"
                          alt="${esc(item.name)}"
                        /><button
                          class="cart-item-name"
                          data-open="${esc(item.recipeId)}"
                        >
                          ${esc(item.name)}
                        </button>
                        <div class="quantity-control">
                          <button
                            data-quantity="-1"
                            data-id="${esc(item.recipeId)}"
                            aria-label="减少${esc(item.name)}份数"
                          >
                            −</button
                          ><span>${item.quantity}</span
                          ><button
                            data-quantity="1"
                            data-id="${esc(item.recipeId)}"
                            aria-label="增加${esc(item.name)}份数"
                          >
                            +
                          </button>
                        </div>
                        <button
                          class="icon-button"
                          data-remove-cart="${esc(item.recipeId)}"
                          aria-label="移除${esc(item.name)}"
                        >
                          ${icon("close")}
                        </button>
                      </div>`,
                  )
                  .join("")}
              </div>
              <form id="complete-meal">
                <label class="field"
                  >用餐日期<input
                    type="date"
                    name="date"
                    value="${localDate()}"
                    required /></label
                ><label class="field"
                  >给这一餐留句话<textarea
                    name="note"
                    rows="2"
                    maxlength="1000"
                    placeholder="例如：周末和家人一起吃，刚刚好。"
                  ></textarea></label
                ><button class="button primary full-width" type="submit">
                  ${icon("check")} 吃好了，记录这一餐
                </button>
              </form>`
          : emptyState({
              symbol: "🍽️",
              title: "这一餐，你想吃什么？",
              text: "在菜谱中点击「点菜」，把喜欢的好味道放进清单。",
              action:
                '<button class="button primary" id="browse-recipes">去挑几道菜</button>',
            })
      }
    </section>
    <aside class="meal-history">
      <div class="section-heading">
        <h2>吃过的好日子</h2>
        <span>${orders.length} 餐</span>
      </div>
      ${
        orders.length
          ? orders
              .map(
                (record) =>
                  /* HTML */ `<article class="meal-card">
                    <div>
                      <span class="meal-date">${esc(record.payload.date)}</span
                      ><span class="tag neutral"
                        >${record.payload.items.length} 道菜</span
                      ><button
                        class="icon-button delete-order"
                        data-id="${esc(record.id)}"
                        aria-label="删除这餐记录"
                      >
                        ${icon("trash")}
                      </button>
                    </div>
                    <h3>
                      ${record.payload.items.map((item) => esc(item.name)).join(" · ")}
                    </h3>
                    ${record.payload.note ? /* HTML */ `<p>${esc(record.payload.note)}</p>` : "<p>好好吃饭的一天。</p>"}
                    <div class="meal-thumbnails">
                      ${record.payload.items
                        .slice(0, 5)
                        .map(
                          (item) =>
                            /* HTML */ `<img
                              src="${safeImage(item.image)}"
                              alt="${esc(item.name)}"
                            />`,
                        )
                        .join("")}
                    </div>
                  </article>`,
              )
              .join("")
          : '<div class="meal-history-empty">每一顿认真吃的饭，<br>都会成为日子里的小幸福。<span>♡</span></div>'
      }
    </aside>
  </div>`;
  $("#browse-recipes")?.addEventListener("click", () => selectTab("public"));
  $$("[data-quantity]").forEach(
    (button) =>
      (button.onclick = async () => {
        const item = cart.items.find(
          (item) => item.recipeId === button.dataset.id,
        );
        item.quantity = Math.max(
          1,
          Math.min(20, item.quantity + Number(button.dataset.quantity)),
        );
        await put("order", cart, "order:cart");
        render();
      }),
  );
  $$("[data-remove-cart]").forEach(
    (button) => (button.onclick = () => toggleCart(button.dataset.removeCart)),
  );
  $("#complete-meal")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $('button[type="submit"]', event.target);
    button.disabled = true;
    try {
      await put("order", {
        items: structuredClone(cart.items),
        status: "completed",
        date: event.target.elements.date.value,
        note: event.target.elements.note.value.trim(),
        at: Date.now(),
      });
      cart = { items: [] };
      await put("order", cart, "order:cart");
      await loadData();
      render();
      toast("这一餐，已记入好日子");
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  });
  $$(".delete-order").forEach(
    (button) =>
      (button.onclick = async () => {
        await remove(button.dataset.id);
        await loadData();
        render();
        toast("用餐记录已删除");
      }),
  );
}
function renderRecords() {
  const average = reviews.length
    ? (
        reviews.reduce((sum, record) => sum + record.payload.rating, 0) /
        reviews.length
      ).toFixed(1)
    : "—";
  $("#kitchen-content").innerHTML = /* HTML */ `<div class="records-stats">
      <div>
        <span class="stat-icon peach">${icon("bowl")}</span>
        <div>
          <strong>${reviews.length}<small> 次</small></strong
          ><span>亲手做的好味道</span>
        </div>
      </div>
      <div>
        <span class="stat-icon purple">${icon("star")}</span>
        <div>
          <strong>${average}<small> / 5</small></strong
          ><span>我的平均满意度</span>
        </div>
      </div>
      <div>
        <span class="stat-icon mint">${icon("camera")}</span>
        <div>
          <strong>${own.length}<small> 道</small></strong
          ><span>记住的拿手菜</span>
        </div>
      </div>
    </div>
    ${
      reviews.length
        ? /* HTML */ `<div class="review-grid">
            ${reviews
              .map(
                (record) =>
                  /* HTML */ `<article class="review-card">
                    <img
                      src="${safeImage(record.payload.image)}"
                      alt="${esc(record.payload.recipeName)}"
                    />
                    <div class="review-body">
                      <span class="review-date"
                        >${esc(record.payload.date)} ·
                        ${dateLabel(record.updatedAt)}</span
                      ><button
                        class="recipe-title-button"
                        data-open="${esc(record.payload.recipeId)}"
                      >
                        <h3>${esc(record.payload.recipeName)}</h3>
                        ${icon("chevron")}
                      </button>
                      <div
                        class="review-stars"
                        aria-label="${record.payload.rating} 星"
                      >
                        ${[1, 2, 3, 4, 5].map((value) => icon("star", value <= record.payload.rating ? "filled" : "")).join("")}
                      </div>
                      <p>
                        ${esc(record.payload.note || "认真做饭，好好吃饭。")}
                      </p>
                      <button
                        class="text-button delete-review"
                        data-id="${esc(record.id)}"
                      >
                        ${icon("trash")} 删除记录
                      </button>
                    </div>
                  </article>`,
              )
              .join("")}
          </div>`
        : emptyState({
            symbol: "🍳",
            title: "美味值得被记住",
            text: "打开一道菜谱，点击「做过这道菜」，记下评分和做菜心得。",
            action:
              '<button class="button primary" id="record-browse">选一道菜，开始做饭</button>',
          })
    }`;
  $("#record-browse")?.addEventListener("click", () => selectTab("public"));
  $$(".delete-review").forEach(
    (button) =>
      (button.onclick = async () => {
        await remove(button.dataset.id);
        await loadData();
        render();
        toast("烹饪记录已删除");
      }),
  );
}
async function showCredits() {
  try {
    const credits = await (await fetch(asset("/images/credits.json"))).json();
    modal({
      title: "好味道背后的镜头",
      content: /* HTML */ `<p class="muted">
          公共菜谱图片来自 Wikimedia
          Commons。以下为原作者、来源与授权；自建菜谱照片属于你。
        </p>
        <div class="credits-list">
          ${credits
            .filter((item) => item.source)
            .map(
              (item) =>
                /* HTML */ `<div>
                  <strong>${esc(item.dish)}</strong>
                  <p>${esc(item.author)} · ${esc(item.license)}</p>
                  <a
                    href="${esc(item.source)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    >查看原图与授权 ${icon("arrow")}</a
                  >
                </div>`,
            )
            .join("")}
        </div>`,
    });
  } catch {
    toast("图片来源暂时无法读取，请稍后再试。");
  }
}

export async function mount(root) {
  root.innerHTML = template();
  bindEvents();
  await loadData();
  render();
  window.addEventListener(changeEvent, async (event) => {
    if (event.detail.type === "merge") {
      await loadData();
      render();
    }
  });
  return {
    show(params) {
      const requested = params.get("tab");
      if (tabs.some((item) => item.id === requested) && requested !== tab) {
        tab = requested;
        cuisine = "全部";
        search = "";
        $("#recipe-search").value = "";
        render();
      }
      const recipe = params.get("recipe");
      if (recipe) {
        history.replaceState(
          null,
          "",
          tab === "public" ? "#/kitchen" : `#/kitchen?tab=${tab}`,
        );
        showRecipe(recipe);
      }
    },
  };
}
