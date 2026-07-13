"use strict";

/*
 * 증산 속도 분석 보고서
 * 오프라인 화면 저장용 Service Worker
 */

const CACHE_VERSION =
  "transpiration-report-v1";

const CORE_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./db.js",
  "./pdf-report.js",
  "./app.js",
  "./manifest.webmanifest"
];

const EXTERNAL_FILES = [
  "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"
];

const INDEX_URL =
  new URL(
    "./index.html",
    self.registration.scope
  ).href;


/**
 * 웹앱의 기본 화면 파일을 기기에 저장합니다.
 */
self.addEventListener(
  "install",
  (event) => {
    event.waitUntil(
      (async () => {
        const cache =
          await caches.open(
            CACHE_VERSION
          );

        const coreUrls =
          CORE_FILES.map(
            (file) =>
              new URL(
                file,
                self.registration.scope
              ).href
          );

        await cache.addAll(
          coreUrls
        );

        /*
         * PDF 생성 라이브러리도 가능한 경우
         * 기기에 저장합니다.
         *
         * 외부 서버 문제로 저장하지 못하더라도
         * 웹앱 자체 설치는 계속 진행합니다.
         */
        for (
          const url of
          EXTERNAL_FILES
        ) {
          try {
            const response =
              await fetch(
                url,
                {
                  mode: "no-cors",
                  cache: "reload"
                }
              );

            await cache.put(
              url,
              response
            );
          } catch (error) {
            console.warn(
              "외부 PDF 파일을 미리 저장하지 못했습니다.",
              url,
              error
            );
          }
        }

        await self.skipWaiting();
      })()
    );
  }
);


/**
 * 이전 버전의 화면 저장 파일을 정리합니다.
 */
self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      (async () => {
        const cacheNames =
          await caches.keys();

        await Promise.all(
          cacheNames
            .filter(
              (name) =>
                name.startsWith(
                  "transpiration-report-"
                ) &&
                name !==
                  CACHE_VERSION
            )
            .map(
              (name) =>
                caches.delete(name)
            )
        );

        await self.clients.claim();
      })()
    );
  }
);


/**
 * 저장된 파일이 있으면 먼저 사용하고,
 * 없으면 인터넷에서 받아 저장합니다.
 */
async function cacheFirst(
  request
) {
  const cached =
    await caches.match(
      request
    );

  if (cached) {
    return cached;
  }

  const response =
    await fetch(request);

  if (
    response &&
    (
      response.ok ||
      response.type === "opaque"
    )
  ) {
    const cache =
      await caches.open(
        CACHE_VERSION
      );

    await cache.put(
      request,
      response.clone()
    );
  }

  return response;
}


/**
 * 화면 이동은 최신 화면을 먼저 확인하고,
 * 인터넷이 없으면 기기에 저장된 화면을 엽니다.
 */
async function navigationRequest(
  request
) {
  try {
    const response =
      await fetch(request);

    if (response.ok) {
      const cache =
        await caches.open(
          CACHE_VERSION
        );

      await cache.put(
        request,
        response.clone()
      );
    }

    return response;
  } catch (error) {
    const exactMatch =
      await caches.match(
        request
      );

    if (exactMatch) {
      return exactMatch;
    }

    const indexMatch =
      await caches.match(
        INDEX_URL
      );

    if (indexMatch) {
      return indexMatch;
    }

    throw error;
  }
}


/**
 * 웹앱에서 파일을 요청할 때
 * 인터넷 연결 상태에 맞춰 응답합니다.
 */
self.addEventListener(
  "fetch",
  (event) => {
    const request =
      event.request;

    if (
      request.method !== "GET"
    ) {
      return;
    }

    const url =
      new URL(
        request.url
      );

    /*
     * 학생이 웹앱 주소를 열거나
     * 페이지를 새로고침하는 경우
     */
    if (
      request.mode === "navigate"
    ) {
      event.respondWith(
        navigationRequest(
          request
        )
      );

      return;
    }

    /*
     * GitHub Pages에 저장된
     * HTML, CSS, JavaScript 파일
     */
    if (
      url.origin ===
      self.location.origin
    ) {
      event.respondWith(
        cacheFirst(
          request
        )
      );

      return;
    }

    /*
     * PDF 생성용 외부 라이브러리만
     * 오프라인 저장 대상으로 처리합니다.
     *
     * Apps Script 제출 요청은 가로채지 않습니다.
     */
    if (
      EXTERNAL_FILES.includes(
        url.href
      )
    ) {
      event.respondWith(
        cacheFirst(
          request
        )
      );
    }
  }
);
