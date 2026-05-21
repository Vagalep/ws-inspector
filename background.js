let globalState = {
  sockets: {},
  logs: [],
  queue: []
};
let isGlobalEnabled = false;

function shutdownAndWipe() {
  isGlobalEnabled = false;

  Object.keys(globalState.sockets).forEach(socketId => {
    const sock = globalState.sockets[socketId];
    if (sock && sock.tabId) {
      chrome.tabs.sendMessage(sock.tabId, {
        type: "WS_UPDATE_INTERCEPT_CONFIG",
        socketId: socketId,
        config: { enabled: false, out: false, in: false }
      }, { frameId: sock.frameId || 0 }).catch(() => {});
    }
  });

  globalState.sockets = {};
  globalState.queue = [];
  globalState.logs = [];

  chrome.runtime.sendMessage({ type: "GLOBAL_STATE_CHANGED", isEnabled: false }).catch(() => {});
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "side-panel-channel") {
    port.onDisconnect.addListener(() => {
      shutdownAndWipe();
    });
  }
});

if (chrome.sidePanel && chrome.sidePanel.onStateChanged) {
  chrome.sidePanel.onStateChanged.addListener((state) => {
    if (state && state.open === false) {
      shutdownAndWipe();
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "GET_GLOBAL_APP_STATE") {
    sendResponse({ isEnabled: isGlobalEnabled });
    return;
  }

  if (message.type === "RESET_BACKGROUND_STATE") {
    shutdownAndWipe();
    sendResponse({ success: true });
    return;
  }

  if (message.type === "SET_GLOBAL_APP_STATE") {
    isGlobalEnabled = message.isEnabled;
    if (!isGlobalEnabled) {
      shutdownAndWipe();
    } else {
      chrome.runtime.sendMessage({ type: "GLOBAL_STATE_CHANGED", isEnabled: true }).catch(() => {});
    }
    sendResponse({ success: true });
    return;
  }

  if (message.type === "WS_EVENT") {
    if (!isGlobalEnabled) return;

    const tabId = sender.tab?.id;
    if (!tabId) return;

    if (message.event === "open") {
      globalState.sockets[message.socketId] = {
        id: message.socketId,
        url: message.url,
        tabId: tabId,
        frameId: sender.frameId,
        openedAt: message.timestamp,
        draftPayload: "",
        interceptConfig: { enabled: false, out: false, in: false }
      };
    }

    if (message.event === "intercept") {
      globalState.queue.push({
        id: message.msgId,
        socketId: message.socketId,
        direction: message.direction,
        data: message.data,
        timestamp: message.timestamp
      });
    }

    if (message.event !== "intercept") {
      globalState.logs.push({
        socketId: message.socketId,
        event: message.event,
        direction: message.direction || null,
        data: message.data || null,
        url: message.url || null,
        timestamp: message.timestamp
      });
    }

    chrome.runtime.sendMessage({ type: "UI_UPDATE", data: { ...message, tabId } }).catch(() => {});
    return;
  }

  if (message.type === "GET_STATE") {
    sendResponse(globalState);
    return;
  }

  if (message.type === "UPDATE_SOCKET_DRAFT") {
    if (globalState.sockets[message.socketId]) {
      globalState.sockets[message.socketId].draftPayload = message.payload;
    }
    return;
  }

  if (message.type === "WS_DIRECT_SEND") {
    const sock = globalState.sockets[message.socketId];
    if (sock) {
      chrome.tabs.sendMessage(sock.tabId, {
        type: "WS_DIRECT_SEND",
        socketId: message.socketId,
        payload: message.payload
      }, { frameId: sock.frameId || 0 }).catch(() => {});
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, reason: "Socket not tracked" });
    }
    return;
  }

  if (message.type === "SET_INTERCEPT_CONFIG") {
    const sock = globalState.sockets[message.socketId];
    if (sock) {
      sock.interceptConfig = message.config;
      chrome.tabs.sendMessage(sock.tabId, {
        type: "WS_UPDATE_INTERCEPT_CONFIG",
        socketId: message.socketId,
        config: message.config
      }, { frameId: sock.frameId || 0 }).catch(() => {});
    }
    sendResponse({ success: true });
    return;
  }

  if (message.type === "POP_QUEUE_ELEMENT") {
    const idx = globalState.queue.findIndex(q => q.id === message.id);
    if (idx !== -1) {
      const item = globalState.queue[idx];
      globalState.queue.splice(idx, 1);

      const sock = globalState.sockets[item.socketId];
      if (sock) {
        const tabId = sock.tabId;
        if (message.action === "FORWARD") {
          chrome.tabs.sendMessage(tabId, {
            type: "WS_RELEASE_FORWARD",
            id: item.id,
            socketId: item.socketId,
            direction: item.direction,
            payload: message.modifiedData
          }, { frameId: sock.frameId || 0 }).catch(() => {});
        } else if (message.action === "DROP") {
          chrome.tabs.sendMessage(tabId, {
            type: "WS_RELEASE_DROP",
            id: item.id,
            socketId: item.socketId,
            direction: item.direction
          }, { frameId: sock.frameId || 0 }).catch(() => {});

          globalState.logs.push({
            socketId: item.socketId,
            event: "dropped",
            direction: item.direction,
            data: item.data,
            timestamp: Date.now()
          });
        }
      }
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false });
    }
    return;
  }

  if (message.type === "CLEAR_LOGS") {
    globalState.logs = globalState.logs.filter(log => log.socketId !== message.socketId);
    sendResponse({ success: true });
    return;
  }

  if (message.type === "CHECK_DEAD_IFRAMES") {
    const tabId = sender.tab?.id;
    if (!tabId) return;

    setTimeout(() => {
      chrome.scripting.executeScript({
        target: { tabId: tabId, allFrames: true },
        func: () => { return window.location.href; }
      }, (results) => {
        if (chrome.runtime.lastError || !results) return;

        const activeFrames = new Set(results.map(r => r.frameId));

        Object.keys(globalState.sockets).forEach(socketId => {
          const sock = globalState.sockets[socketId];

          if (sock.tabId === tabId && sock.frameId && !activeFrames.has(sock.frameId)) {
            globalState.logs.push({
              socketId: socketId,
              event: "close",
              timestamp: Date.now()
            });
            delete globalState.sockets[socketId];
            globalState.queue = globalState.queue.filter(q => q.socketId !== socketId);
          }
        });
        chrome.runtime.sendMessage({ type: "TAB_CLEANUP" }).catch(() => {});
      });
    }, 150);
    return;
  }
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId === 0) {
    Object.keys(globalState.sockets).forEach(id => {
      if (globalState.sockets[id].tabId === details.tabId) {
        delete globalState.sockets[id];
      }
    });
    globalState.queue = globalState.queue.filter(q => {
      const sock = globalState.sockets[q.socketId];
      return sock && sock.tabId !== details.tabId;
    });
    globalState.logs = globalState.logs.filter(l => {
      const sock = globalState.sockets[l.socketId];
      return sock && sock.tabId !== details.tabId;
    });
    chrome.runtime.sendMessage({ type: "TAB_CLEANUP" }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  Object.keys(globalState.sockets).forEach(id => {
    if (globalState.sockets[id].tabId === tabId) {
      delete globalState.sockets[id];
    }
  });

  globalState.queue = globalState.queue.filter(q => {
    const sock = globalState.sockets[q.socketId];
    return sock && sock.tabId !== tabId;
  });

  globalState.logs = globalState.logs.filter(l => {
    const sock = globalState.sockets[l.socketId];
    return sock && sock.tabId !== tabId;
  });

  chrome.runtime.sendMessage({ type: "TAB_CLEANUP" }).catch(() => {});
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});