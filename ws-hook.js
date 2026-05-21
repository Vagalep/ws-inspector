(function() {
  if (window.WebSocket && window.WebSocket.__isHooked) {
    return;
  }

  const originalWebSocket = window.WebSocket;

  if (!window.__wsSocketsMap) {
    window.__wsSocketsMap = new Map();
  }
  const socketsMap = window.__wsSocketsMap;

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.type === "WS_UPDATE_INTERCEPT_CONFIG") {
      const { socketId, config } = event.data;
      const ws = socketsMap.get(socketId);
      if (ws) ws.interceptConfig = config;
    }

    if (event.data.type === "WS_RELEASE_FORWARD") {
      const { id, direction, socketId, payload } = event.data;
      const ws = socketsMap.get(socketId);
      if (!ws) return;

      if (direction === "OUT") {
        if (ws.readyState === originalWebSocket.OPEN) {
          ws._originalSend(payload);
        }
      } else if (direction === "IN") {
        ws._releaseInboundMessage(id, payload);
      }
    }

    if (event.data.type === "WS_RELEASE_DROP") {
      const { direction, socketId, id } = event.data;
      const ws = socketsMap.get(socketId);
      if (ws && direction === "IN" && ws._pendingInboundCallbacks) {
        ws._pendingInboundCallbacks.delete(id);
      }
    }

    if (event.data.type === "WS_DIRECT_SEND") {
      const { socketId, payload } = event.data;

      let ws = socketsMap.get(socketId);

      if (!ws && socketId) {
        for (const s of socketsMap.values()) {
          if (s.socketId === socketId) {
            ws = s;
            break;
          }
        }
      }

      if (!ws) {
        console.warn(`[WS-Hook] Сокет "${socketId}" не знайдено. Вмикаємо аварійний fallback на перший OPEN сокет.`);
        ws = Array.from(socketsMap.values()).find(s => s.readyState === originalWebSocket.OPEN);
      }

      if (ws && ws.readyState === originalWebSocket.OPEN) {
        ws._originalSend(payload);
        window.postMessage({ type: "WS_EVENT", event: "send", socketId: ws.socketId, data: String(payload), timestamp: Date.now() }, "*");
      } else {
      }
    }
  });

  window.WebSocket = function(url, protocols) {
    const ws = new originalWebSocket(url, protocols);
    const socketId = "ws_" + Math.random().toString(36).substr(2, 9);
    ws.socketId = socketId;
    ws.interceptConfig = { enabled: false, out: false, in: false };
    socketsMap.set(socketId, ws);

    ws._originalSend = ws.send;
    ws._listenersMap = new Map();
    ws._pendingInboundCallbacks = new Map();

    window.postMessage({ type: "WS_EVENT", event: "open", socketId, url, timestamp: Date.now() }, "*");

    ws.addEventListener = function(type, listener, options) {
      if (type === 'message') {
        const hookedListener = function(e) { handleInboundMessage(ws, e, listener); };
        if (!ws._listenersMap.has(listener)) ws._listenersMap.set(listener, hookedListener);
        return originalWebSocket.prototype.addEventListener.call(ws, type, hookedListener, options);
      }
      return originalWebSocket.prototype.addEventListener.call(ws, type, listener, options);
    };

    ws.removeEventListener = function(type, listener, options) {
      if (type === 'message' && ws._listenersMap.has(listener)) {
        const hooked = ws._listenersMap.get(listener);
        ws._listenersMap.delete(listener);
        return originalWebSocket.prototype.removeEventListener.call(ws, type, hooked, options);
      }
      return originalWebSocket.prototype.removeEventListener.call(ws, type, listener, options);
    };

    Object.defineProperty(ws, 'onmessage', {
      set: function(listener) {
        if (listener) {
          ws._customOnMessage = function(e) { handleInboundMessage(ws, e, listener); };
          originalWebSocket.prototype.addEventListener.call(ws, 'message', ws._customOnMessage);
        } else if (ws._customOnMessage) {
          originalWebSocket.prototype.removeEventListener.call(ws, 'message', ws._customOnMessage);
          ws._customOnMessage = null;
        }
      },
      get: function() { return ws._customOnMessage || null; }
    });

    ws.send = function(data) {
      const now = Date.now();
      if (ws.interceptConfig.enabled && ws.interceptConfig.out) {
        const msgId = "msg_" + Math.random().toString(36).substr(2, 9);
        window.postMessage({ type: "WS_EVENT", event: "intercept", direction: "OUT", msgId, socketId, data: String(data), timestamp: now }, "*");
      } else {
        window.postMessage({ type: "WS_EVENT", event: "send", socketId, data: String(data), timestamp: now }, "*");
        ws._originalSend(data);
      }
    };

    originalWebSocket.prototype.addEventListener.call(ws, 'close', () => {
      window.postMessage({ type: "WS_EVENT", event: "close", socketId, timestamp: Date.now() }, "*");
      socketsMap.delete(socketId);
    });

    ws._releaseInboundMessage = function(id, modifiedData) {
      const callbackObj = ws._pendingInboundCallbacks.get(id);
      if (!callbackObj) return;
      const newEvent = new MessageEvent('message', {
        data: modifiedData,
        origin: callbackObj.originalEvent.origin,
        lastEventId: callbackObj.originalEvent.lastEventId,
        source: callbackObj.originalEvent.source,
        ports: callbackObj.originalEvent.ports
      });
      window.postMessage({ type: "WS_EVENT", event: "recv", socketId, data: String(modifiedData), timestamp: Date.now() }, "*");
      callbackObj.listener.call(ws, newEvent);
      ws._pendingInboundCallbacks.delete(id);
    };

    return ws;
  };

  function handleInboundMessage(ws, event, originalListener) {
    const now = Date.now();
    if (ws.interceptConfig.enabled && ws.interceptConfig.in) {
      const msgId = "msg_" + Math.random().toString(36).substr(2, 9);
      ws._pendingInboundCallbacks.set(msgId, { listener: originalListener, originalEvent: event });
      window.postMessage({ type: "WS_EVENT", event: "intercept", direction: "IN", msgId, socketId: ws.socketId, data: String(event.data), timestamp: now }, "*");
    } else {
      window.postMessage({ type: "WS_EVENT", event: "recv", socketId: ws.socketId, data: String(event.data), timestamp: now }, "*");
      originalListener.call(ws, event);
    }
  }

  window.WebSocket.prototype = originalWebSocket.prototype;
  for (let key in originalWebSocket) {
    if (originalWebSocket.hasOwnProperty(key)) window.WebSocket[key] = originalWebSocket[key];
  }
  window.WebSocket.__isHooked = true;
})();