(() => {
    'use strict';
    // SlotTrackerのIndexedDBとは完全に分離する。
    const DB_NAME = 'pachinkotracker-db';
    const DB_VERSION = 2;
    const STORES = ['visits', 'plays', 'favorites', 'shopSettings', 'storedBallTransactions', 'logs'];
    let openPromise;

    function openDb() {
        if (openPromise) return openPromise;
        openPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                for (const name of STORES) {
                    if (!request.result.objectStoreNames.contains(name)) {
                        request.result.createObjectStore(name, { keyPath: 'id' });
                    }
                }
            };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => { db.close(); openPromise = undefined; };
                resolve(db);
            };
            request.onerror = () => { openPromise = undefined; reject(request.error); };
            request.onblocked = () => { openPromise = undefined; reject(new Error('他のタブがデータベースを使用中です。')); };
        });
        return openPromise;
    }

    async function operation(storeName, mode, callback) {
        if (!STORES.includes(storeName)) throw new Error('Unsupported store: ' + storeName);
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, mode);
            let request;
            try { request = callback(tx.objectStore(storeName)); }
            catch (err) { try { tx.abort(); } catch (_) {} reject(err); return; }
            tx.oncomplete = () => resolve(request?.result ?? null);
            tx.onerror = () => reject(tx.error || request?.error);
            tx.onabort = () => reject(tx.error || new Error('保存処理が中断されました。'));
        });
    }

    window.pachinkoDb = {
        getAll: async store => await operation(store, 'readonly', s => s.getAll()),
        put: async (store, value) => await operation(store, 'readwrite', s => s.put(value)),
        remove: async (store, id) => await operation(store, 'readwrite', s => s.delete(id)),
        importBackup: async backup => {
            const db = await openDb();
            const records = {
                visits: backup.visits || [],
                plays: backup.plays || [],
                favorites: backup.favorites || [],
                shopSettings: backup.shopSettings || [],
                storedBallTransactions: backup.storedBallTransactions || []
            };
            return new Promise((resolve, reject) => {
                const tx = db.transaction(Object.keys(records), 'readwrite');
                for (const [name, items] of Object.entries(records)) {
                    const store = tx.objectStore(name);
                    for (const value of items) store.put(value);
                }
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error('インポートが中断されました。'));
            });
        },
        clearUserData: async () => {
            const db = await openDb();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORES.filter(name => name !== 'logs'), 'readwrite');
                for (const name of STORES) {
                    if (name !== 'logs') tx.objectStore(name).clear();
                }
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error('削除が中断されました。'));
            });
        },
        deleteVisitWithPlays: async (visitId, playIds) => {
            const db = await openDb();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(['visits', 'plays'], 'readwrite');
                tx.objectStore('visits').delete(visitId);
                for (const id of playIds) tx.objectStore('plays').delete(id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error || new Error('削除が中断されました。'));
            });
        }
    };
    window.pachinkoUi = {
        confirm: text => window.confirm(text),
        download: (name, contents, mime = 'application/json;charset=utf-8') => {
            const blob = new Blob([contents], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
        }
    };
})();
