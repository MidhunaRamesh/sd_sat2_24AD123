"use strict";

// Set this before script.js when the API is hosted on another origin.
// Example: window.FRESH_MART_API_URL = "http://localhost:3000";
const API_BASE_URL = window.FRESH_MART_API_URL || "";
const STORAGE_KEYS = {
  cart: "freshMartCart",
  orders: "freshMartOrders"
};

const sampleProducts = [
  { id: "milk", name: "Milk", price: 2.49, availability: true, description: "Fresh dairy milk, 1 litre." },
  { id: "bread", name: "Bread", price: 1.99, availability: true, description: "Soft whole wheat bread loaf." },
  { id: "rice", name: "Rice", price: 8.99, availability: true, description: "Long-grain rice, 5 kg bag." },
  { id: "eggs", name: "Eggs", price: 3.49, availability: true, description: "Farm-fresh eggs, pack of 12." },
  { id: "apples", name: "Apples", price: 4.25, availability: true, description: "Crisp red apples, sold per kg." },
  { id: "vegetables", name: "Vegetables", price: 5.5, availability: true, description: "Seasonal mixed vegetables, 1 kg." }
];

const elements = {
  modeBanner: document.getElementById("mode-banner"),
  modeLabel: document.getElementById("mode-label"),
  message: document.getElementById("message"),
  searchForm: document.getElementById("search-form"),
  searchInput: document.getElementById("product-search"),
  productList: document.getElementById("product-list"),
  productCount: document.getElementById("product-result-count"),
  noProducts: document.getElementById("no-products"),
  detailsSection: document.getElementById("product-details"),
  detailsContent: document.getElementById("details-content"),
  closeDetails: document.getElementById("close-details"),
  cartContent: document.getElementById("cart-content"),
  cartCount: document.getElementById("cart-count"),
  cartTotal: document.getElementById("cart-total"),
  checkoutForm: document.getElementById("checkout-form"),
  placeOrder: document.getElementById("place-order"),
  orderConfirmation: document.getElementById("order-confirmation"),
  trackingForm: document.getElementById("tracking-form"),
  trackingId: document.getElementById("tracking-id"),
  trackingResult: document.getElementById("tracking-result")
};

let mode = "checking";
let products = sampleProducts.slice();
let cart = readStorage(STORAGE_KEYS.cart, []);
let demoOrders = readStorage(STORAGE_KEYS.orders, []);

function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (error) {
    console.error(`Unable to read ${key} from localStorage.`, error);
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Unable to save ${key} to localStorage.`, error);
    showMessage("Your browser could not save this change. Check that local storage is enabled.");
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatPrice(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "$0.00";
}

function normalizeProduct(product) {
  const availableValue = product.availability ?? product.available ?? product.inStock;
  const isAvailable = typeof availableValue === "string"
    ? !["false", "no", "unavailable", "out of stock"].includes(availableValue.toLowerCase())
    : availableValue !== false;

  return {
    id: String(product.id ?? product._id ?? ""),
    name: String(product.name ?? product.title ?? "Unnamed product"),
    price: Number(product.price ?? 0),
    availability: isAvailable,
    description: String(product.description ?? product.details ?? "No additional information available.")
  };
}

function showMessage(text) {
  elements.message.textContent = text;
  elements.message.hidden = false;
}

function clearMessage() {
  elements.message.textContent = "";
  elements.message.hidden = true;
}

function setMode(nextMode, detail) {
  mode = nextMode;
  elements.modeBanner.dataset.mode = nextMode;
  elements.modeLabel.textContent = nextMode === "demo"
    ? `Demo Mode — ${detail || "sample products and browser storage are active."}`
    : nextMode === "api"
      ? `API Mode — connected to the grocery service${detail ? ` (${detail})` : ""}.`
      : "Checking connection...";
}

async function requestApi(path, options) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options && options.body ? { "Content-Type": "application/json" } : {}),
        ...(options && options.headers ? options.headers : {})
      }
    });
  } catch (error) {
    throw new Error("Could not reach the grocery API. Check that the backend is running and try again.");
  }

  let payload = null;
  const responseType = response.headers.get("content-type") || "";
  if (responseType.includes("application/json")) {
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error("The API returned an unreadable response. Please try again.");
    }
  }

  if (!response.ok) {
    const apiMessage = payload && (payload.message || payload.error);
    throw new Error(apiMessage || `The API request failed (${response.status}). Please try again.`);
  }

  return payload;
}

function unwrapProducts(payload) {
  const list = Array.isArray(payload) ? payload : payload && (payload.products || payload.data);
  if (!Array.isArray(list)) {
    throw new Error("The products API returned an unexpected response.");
  }
  return list.map(normalizeProduct);
}

function renderProducts(list) {
  elements.productCount.textContent = `${list.length} ${list.length === 1 ? "product" : "products"}`;
  elements.noProducts.hidden = list.length > 0;
  elements.productList.innerHTML = list.map((product) => {
    const available = product.availability;
    return `
      <article class="product-card">
        <h3>${escapeHtml(product.name)}</h3>
        <p class="product-description">${escapeHtml(product.description)}</p>
        <p class="product-price">${formatPrice(product.price)}</p>
        <p class="availability${available ? "" : " unavailable"}">${available ? "Available" : "Currently unavailable"}</p>
        <div class="product-actions">
          <button class="button button-primary" type="button" data-action="add" data-id="${escapeHtml(product.id)}"${available ? "" : " disabled"}>Add to Cart</button>
          <button class="button button-secondary" type="button" data-action="details" data-id="${escapeHtml(product.id)}">View Details</button>
        </div>
      </article>`;
  }).join("");
}

function renderCart() {
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  elements.cartCount.textContent = String(itemCount);
  elements.cartTotal.textContent = formatPrice(total);

  if (cart.length === 0) {
    elements.cartContent.innerHTML = '<p class="empty-state">Your cart is empty. Add a product to get started.</p>';
    return;
  }

  elements.cartContent.innerHTML = `
    <div class="cart-table-wrap">
      <table class="cart-table">
        <thead>
          <tr><th scope="col">Product</th><th scope="col">Price</th><th scope="col">Quantity</th><th scope="col">Subtotal</th><th scope="col">Action</th></tr>
        </thead>
        <tbody>
          ${cart.map((item) => `
            <tr>
              <td>${escapeHtml(item.name)}</td>
              <td>${formatPrice(item.price)}</td>
              <td>
                <div class="quantity-control" aria-label="${escapeHtml(item.name)} quantity">
                  <button type="button" data-action="decrease" data-id="${escapeHtml(item.id)}" aria-label="Decrease ${escapeHtml(item.name)} quantity">-</button>
                  <span>${item.quantity}</span>
                  <button type="button" data-action="increase" data-id="${escapeHtml(item.id)}" aria-label="Increase ${escapeHtml(item.name)} quantity">+</button>
                </div>
              </td>
              <td>${formatPrice(item.price * item.quantity)}</td>
              <td><button class="remove-button" type="button" data-action="remove" data-id="${escapeHtml(item.id)}">Remove</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function persistCart() {
  saveStorage(STORAGE_KEYS.cart, cart);
  renderCart();
}

function findProduct(productId) {
  return products.find((product) => product.id === productId)
    || sampleProducts.find((product) => product.id === productId);
}

async function addToCart(productId) {
  const product = findProduct(productId);
  if (!product || !product.availability) {
    showMessage("This product is currently unavailable.");
    return;
  }

  clearMessage();
  const current = cart.find((item) => item.id === productId);
  const quantity = current ? current.quantity + 1 : 1;

  if (mode === "api") {
    try {
      await requestApi("/api/cart/items", {
        method: "POST",
        body: JSON.stringify({ productId, quantity: 1 })
      });
    } catch (error) {
      showMessage(error.message);
      return;
    }
  }

  if (current) {
    current.quantity = quantity;
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, quantity: 1 });
  }
  persistCart();
}

async function removeFromCart(productId) {
  clearMessage();
  if (mode === "api") {
    try {
      await requestApi(`/api/cart/items/${encodeURIComponent(productId)}`, { method: "DELETE" });
    } catch (error) {
      showMessage(error.message);
      return;
    }
  }
  cart = cart.filter((item) => item.id !== productId);
  persistCart();
}

function changeQuantity(productId, difference) {
  const item = cart.find((cartItem) => cartItem.id === productId);
  if (!item) return;

  const nextQuantity = item.quantity + difference;
  if (nextQuantity <= 0) {
    void removeFromCart(productId);
    return;
  }

  item.quantity = nextQuantity;
  persistCart();
}

async function searchProducts(searchTerm) {
  clearMessage();
  if (mode !== "api") {
    const query = searchTerm.trim().toLowerCase();
    products = sampleProducts.filter((product) => product.name.toLowerCase().includes(query));
    renderProducts(products);
    return;
  }

  try {
    const payload = await requestApi(`/api/products?search=${encodeURIComponent(searchTerm.trim())}`);
    products = unwrapProducts(payload);
    renderProducts(products);
  } catch (error) {
    showMessage(error.message);
  }
}

async function showProductDetails(productId) {
  clearMessage();
  let product = findProduct(productId);
  if (mode === "api") {
    try {
      const payload = await requestApi(`/api/products/${encodeURIComponent(productId)}`);
      product = normalizeProduct(payload && (payload.product || payload.data || payload));
    } catch (error) {
      showMessage(error.message);
      return;
    }
  }

  if (!product) {
    showMessage("Product details are not available.");
    return;
  }
  elements.detailsContent.innerHTML = `
    <div class="detail-card">
      <h3>${escapeHtml(product.name)}</h3>
      <p>${escapeHtml(product.description)}</p>
      <p><strong>Price:</strong> ${formatPrice(product.price)}</p>
      <p><strong>Availability:</strong> ${product.availability ? "Available" : "Currently unavailable"}</p>
    </div>`;
  elements.detailsSection.hidden = false;
  elements.detailsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function makeDemoOrder(customer) {
  const order = {
    id: `FM-${Date.now().toString(36).toUpperCase()}`,
    status: "Confirmed",
    customer,
    items: cart.map((item) => ({ ...item })),
    total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    createdAt: new Date().toISOString()
  };
  demoOrders.unshift(order);
  saveStorage(STORAGE_KEYS.orders, demoOrders);
  return order;
}

function getOrderFromResponse(payload) {
  const order = payload && (payload.order || payload.data || payload);
  if (!order || !(order.id || order.orderId || order._id)) {
    throw new Error("The order API did not return an order ID.");
  }
  return { ...order, id: String(order.id || order.orderId || order._id) };
}

function showOrderConfirmation(order) {
  elements.orderConfirmation.innerHTML = `
    <h3>Order placed successfully</h3>
    <p>Your order is confirmed. Your order ID is <strong>${escapeHtml(order.id)}</strong>.</p>
    <p>Use this ID in Order Tracking to check delivery progress.</p>`;
  elements.orderConfirmation.hidden = false;
  elements.trackingId.value = order.id;
}

async function placeOrder(event) {
  event.preventDefault();
  clearMessage();

  if (cart.length === 0) {
    showMessage("Your cart is empty. Add a product before placing an order.");
    return;
  }
  if (!elements.checkoutForm.reportValidity()) return;

  const formData = new FormData(elements.checkoutForm);
  const customer = {
    name: String(formData.get("name")).trim(),
    phone: String(formData.get("phone")).trim(),
    address: String(formData.get("address")).trim()
  };
  if (!customer.name || !customer.phone || !customer.address) {
    showMessage("Please enter your name, phone number, and delivery address.");
    return;
  }

  elements.placeOrder.disabled = true;
  try {
    let order;
    if (mode === "api") {
      const payload = await requestApi("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customer,
          items: cart.map((item) => ({ productId: item.id, quantity: item.quantity }))
        })
      });
      order = getOrderFromResponse(payload);
    } else {
      order = makeDemoOrder(customer);
    }

    showOrderConfirmation(order);
    cart = [];
    persistCart();
    elements.checkoutForm.reset();
  } catch (error) {
    showMessage(error.message);
  } finally {
    elements.placeOrder.disabled = false;
  }
}

function renderTracking(order) {
  const statuses = ["Confirmed", "Packed", "Out for Delivery"];
  const statusIndex = statuses.indexOf(order.status);
  const currentStatus = statusIndex >= 0 ? order.status : String(order.status || "Confirmed");
  const visibleStatusIndex = statuses.indexOf(currentStatus);
  elements.trackingResult.innerHTML = `
    <h3>Order ${escapeHtml(order.id || order.orderId || order._id)}</h3>
    <p>Current status: <strong>${escapeHtml(currentStatus)}</strong></p>
    <ol class="tracking-statuses">
      ${statuses.map((status, index) => `<li class="${index <= visibleStatusIndex ? "complete" : ""}">${escapeHtml(status)}</li>`).join("")}
    </ol>`;
  elements.trackingResult.hidden = false;
}

async function trackOrder(event) {
  event.preventDefault();
  clearMessage();
  const orderId = elements.trackingId.value.trim();
  if (!orderId) {
    showMessage("Enter an order ID to track your delivery.");
    return;
  }

  if (mode === "api") {
    try {
      const payload = await requestApi(`/api/orders/${encodeURIComponent(orderId)}/tracking`);
      renderTracking(payload && (payload.order || payload.data || payload));
    } catch (error) {
      showMessage(error.message);
    }
    return;
  }

  const order = demoOrders.find((savedOrder) => savedOrder.id.toLowerCase() === orderId.toLowerCase());
  if (!order) {
    showMessage("We could not find that order ID in Demo Mode. Place a demo order first and use its ID.");
    elements.trackingResult.hidden = true;
    return;
  }
  renderTracking(order);
}

async function initialize() {
  renderCart();
  if (window.location.protocol === "file:") {
    products = sampleProducts.slice();
    setMode("demo", "local file mode is active; sample data and browser storage are in use.");
    renderProducts(products);
    return;
  }

  try {
    const payload = await requestApi("/api/products");
    products = unwrapProducts(payload);
    setMode("api");
  } catch (error) {
    products = sampleProducts.slice();
    setMode("demo", "the API could not provide products; sample data and browser storage are active.");
    showMessage(`Could not load products from the API: ${error.message} Demo Mode is active.`);
  }
  renderProducts(products);
}

elements.searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void searchProducts(elements.searchInput.value);
});

elements.productList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "add") void addToCart(button.dataset.id);
  if (button.dataset.action === "details") void showProductDetails(button.dataset.id);
});

elements.cartContent.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "decrease") changeQuantity(button.dataset.id, -1);
  if (button.dataset.action === "increase") changeQuantity(button.dataset.id, 1);
  if (button.dataset.action === "remove") void removeFromCart(button.dataset.id);
});

elements.closeDetails.addEventListener("click", () => {
  elements.detailsSection.hidden = true;
});

elements.checkoutForm.addEventListener("submit", (event) => {
  void placeOrder(event);
});

elements.trackingForm.addEventListener("submit", (event) => {
  void trackOrder(event);
});

void initialize();
