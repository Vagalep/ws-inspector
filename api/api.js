export const ExtAPI = {
    getState(callback) {
        chrome.runtime.sendMessage({ type: "GET_STATE" }, callback);
    },

    updateSocketDraft(socketId, payload) {
        chrome.runtime.sendMessage({ type: "UPDATE_SOCKET_DRAFT", socketId, payload });
    },

    setInterceptConfig(socketId, config, callback) {
        chrome.runtime.sendMessage({ type: "SET_INTERCEPT_CONFIG", socketId, config }, callback);
    },

    popQueueElement(id, action, modifiedData, callback) {
        chrome.runtime.sendMessage({ type: "POP_QUEUE_ELEMENT", id, action, modifiedData }, callback);
    },

    clearLogs(socketId, callback) {
        chrome.runtime.sendMessage({ type: "CLEAR_LOGS", socketId }, callback);
    },

    sendDirectMessage(socketId, payload) {
        chrome.runtime.sendMessage({
            type: "WS_DIRECT_SEND",
            socketId: socketId,
            payload: payload
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Error:", chrome.runtime.lastError);
            } else {
            }
        });
    }
};