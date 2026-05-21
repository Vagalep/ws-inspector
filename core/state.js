import { ExtAPI } from '../api/api.js';

export class StateManager {
    constructor() {
        this.internalQueue = [];
        this.globalLogsCache = [];
        this.isUpdatePending = false;
    }

    fetchState(currentSocketId, callback) {
        ExtAPI.getState((state) => {
            if (!state) return;
            this.globalLogsCache = state.logs || [];
            this.internalQueue = (state.queue || []).filter(q => q.socketId === currentSocketId);
            callback(state);
        });
    }

    pushLog(logData) {
        this.globalLogsCache.push(logData);
    }

    getFilteredLogs(socketId) {
        return this.globalLogsCache.filter(log => log.socketId === socketId);
    }
}