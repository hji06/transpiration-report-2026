(() => {
  "use strict";

  const DB_NAME = "transpiration-report-db";
  const DB_VERSION = 1;

  const STORES = [
    "drafts",
    "outbox"
  ];

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(
        DB_NAME,
        DB_VERSION
      );

      request.onupgradeneeded = () => {
        const db = request.result;

        for (const storeName of STORES) {
          if (
            !db.objectStoreNames.contains(
              storeName
            )
          ) {
            db.createObjectStore(
              storeName,
              {
                keyPath: "key"
              }
            );
          }
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async function withStore(
    storeName,
    mode,
    callback
  ) {
    const db = await openDb();

    try {
      return await new Promise(
        (resolve, reject) => {
          const transaction =
            db.transaction(
              storeName,
              mode
            );

          const store =
            transaction.objectStore(
              storeName
            );

          let result;

          try {
            result = callback(store);
          } catch (error) {
            reject(error);
            return;
          }

          transaction.oncomplete = () => {
            resolve(result);
          };

          transaction.onerror = () => {
            reject(transaction.error);
          };

          transaction.onabort = () => {
            reject(
              transaction.error ||
              new Error(
                "기기 저장 작업이 중단되었습니다."
              )
            );
          };
        }
      );
    } finally {
      db.close();
    }
  }

  function requestToPromise(request) {
    return new Promise(
      (resolve, reject) => {
        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          reject(request.error);
        };
      }
    );
  }

  window.ReportDb = {
    async get(storeName, key) {
      const db = await openDb();

      try {
        const transaction =
          db.transaction(
            storeName,
            "readonly"
          );

        const store =
          transaction.objectStore(
            storeName
          );

        return await requestToPromise(
          store.get(key)
        );
      } finally {
        db.close();
      }
    },

    async put(storeName, value) {
      return withStore(
        storeName,
        "readwrite",
        (store) => {
          return store.put(value);
        }
      );
    },

    async delete(storeName, key) {
      return withStore(
        storeName,
        "readwrite",
        (store) => {
          return store.delete(key);
        }
      );
    },

    async getAll(storeName) {
      const db = await openDb();

      try {
        const transaction =
          db.transaction(
            storeName,
            "readonly"
          );

        const store =
          transaction.objectStore(
            storeName
          );

        return await requestToPromise(
          store.getAll()
        );
      } finally {
        db.close();
      }
    }
  };
})();
