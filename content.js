window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data) return;
  if (event.data.type === "WS_EVENT") {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage(event.data).catch(() => {});
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && [
    "WS_UPDATE_INTERCEPT_CONFIG",
    "WS_RELEASE_FORWARD",
    "WS_RELEASE_DROP",
    "WS_DIRECT_SEND"
  ].includes(message.type)) {
    window.postMessage(message, "*");

    if (typeof sendResponse === "function") {
      sendResponse({ status: "proxied" });
    }
  }
});

if (window.top === window) {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'IFRAME' || node.querySelector('iframe')) {
            chrome.runtime.sendMessage({ type: "CHECK_DEAD_IFRAMES" }).catch(() => {});
          }
        }
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}