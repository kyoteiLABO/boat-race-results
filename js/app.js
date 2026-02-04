const API_BASE_URL = "https://script.google.com/macros/s/AKfycbwEkhEDAMFvPTHClIJNrijs49xhqRf6RvzyU7oR2ZbfJWy9KySPljH-36OUr7AmXkNsPw/exec";

/**
 * BoatRaceManager
 * Handles data persistence using localStorage and business logic for the application.
 */

function jsonpGet(url) {
    return new Promise((resolve, reject) => {
        const cbName = "__jsonp_cb_" + Math.random().toString(36).slice(2);
        const script = document.createElement("script");
        const sep = url.includes("?") ? "&" : "?";
        script.src = `${url}${sep}callback=${cbName}&t=${Date.now()}`;

        window[cbName] = (data) => {
            delete window[cbName];
            script.remove();
            resolve(data);
        };

        script.onerror = () => {
            delete window[cbName];
            script.remove();
            reject(new Error("JSONP load failed"));
        };

        document.body.appendChild(script);
    });
}

class BoatRaceManager {
    constructor() {
        this.STORAGE_KEY = 'boat_race_results';
        // this.results = this.loadResults();
        this.results = []; // 初期値を空にする
    }

    /**
     * APIからデータを取得して初期化する
     */
    async init() {
        try {
            const json = await jsonpGet(API_BASE_URL);
            this.results = (json && json.ok && Array.isArray(json.items)) ? json.items : [];
        } catch (e) {
            console.error("API読み込み失敗", e);
            this.results = [];
        }
    }

    setWriteToken(token) {
        this.writeToken = token;
    }

    async postAction(action, data) {
        if (!this.writeToken) throw new Error("write token is missing");

        // CORS回避：no-cors + text/plain（preflightを起こしにくい）
        await fetch(API_BASE_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
                token: this.writeToken,
                action,
                data
            })
        });

        // 送信後に再取得して反映確認（JSONP GET）
        await this.init();
        return { ok: true };
    }

    async createResult(data) {
        // idはサーバ側でUUID採番でも良いが、ここで付けてもOK
        return await this.postAction("create", data);
    }

    async updateResultRemote(id, data) {
        return await this.postAction("update", { id, ...data });
    }

    async deleteResultRemote(id) {
        return await this.postAction("delete", { id });
    }

    /**
     * Load results from localStorage
     */
    loadResults() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    }

    /**
     * Save results to localStorage
     */
    saveResults() {
        // localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.results));
        console.log("saveResults は一時的に無効化されています");
    }

    /**
     * Add a new result
     * @param {Object} resultData 
     */
    addResult(resultData) {
        const newResult = {
            id: Date.now().toString(), // Simple unique ID
            ...resultData,
            createdAt: new Date().toISOString()
        };
        this.results.push(newResult);
        // Sort by date descending automatically
        this.results.sort((a, b) => new Date(b.date) - new Date(a.date));
        this.saveResults();
        return newResult;
    }

    /**
     * Update an existing result
     * @param {String} id 
     * @param {Object} updatedData 
     */
    updateResult(id, updatedData) {
        const index = this.results.findIndex(r => r.id === id);
        if (index !== -1) {
            this.results[index] = { ...this.results[index], ...updatedData };
            this.results.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.saveResults();
            return true;
        }
        return false;
    }

    /**
     * Delete a result
     * @param {String} id 
     */
    deleteResult(id) {
        const initialLength = this.results.length;
        this.results = this.results.filter(r => r.id !== id);
        if (this.results.length !== initialLength) {
            this.saveResults();
            return true;
        }
        return false;
    }

    /**
     * Get all results
     */
    getAllResults() {
        return this.results;
    }

    /**
     * Get results for the last N days (default 14)
     * @param {number} days 
     */
    getRecentResults(days = 14) {
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));

        // item.date は "YYYY-MM-DD" 前提
        return (this.results || []).filter(item => {
            if (!item.date) return false;
            const m = String(item.date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!m) return false;
            const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
            return d >= from && d <= now;
        }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }

    /**
     * Get results filtered by Year and Month
     * @param {number} year 
     * @param {number} month (1-12)
     */
    getResultsByMonth(year, month) {
        return this.results.filter(result => {
            const d = new Date(result.date);
            return d.getFullYear() === year && (d.getMonth() + 1) === month;
        });
    }

    calculateRecoveryRate(invest, returnVal) {
        if (!invest || invest === 0) return 0;
        return Math.round((returnVal / invest) * 100);
    }

    /**
     * Get aggregated daily statistics
     * @param {Array} results 
     */
    getDailyStats(results) {
        const stats = {};
        results.forEach(r => {
            if (!stats[r.date]) {
                stats[r.date] = { date: r.date, invest: 0, returnVal: 0 };
            }
            stats[r.date].invest += Number(r.invest);
            stats[r.date].returnVal += Number(r.returnVal);
        });
        // Sort by date ascending for charts
        return Object.values(stats).sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    /**
     * Get average recovery rate by type
     * @param {Array} results 
     */
    getTypeStats(results) {
        const types = { '無料': { invest: 0, returnVal: 0 }, '有料': { invest: 0, returnVal: 0 } };
        results.forEach(r => {
            if (types[r.type]) {
                types[r.type].invest += Number(r.invest);
                types[r.type].returnVal += Number(r.returnVal);
            }
        });
        return {
            '無料': this.calculateRecoveryRate(types['無料'].invest, types['無料'].returnVal),
            '有料': this.calculateRecoveryRate(types['有料'].invest, types['有料'].returnVal)
        };
    }
}

// Export specific instance or class if using modules, 
// but for vanilla JS in browser without build step, we'll attach to window or just let it define global.
window.BoatRaceManager = BoatRaceManager;
