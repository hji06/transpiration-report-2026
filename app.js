(() => {
  "use strict";

  const config = window.APP_CONFIG;

  const form =
    document.getElementById("reportForm");

  const sections =
    Array.from(
      document.querySelectorAll(
        ".form-section"
      )
    );

  const navButtons =
    Array.from(
      document.querySelectorAll(
        ".nav-step"
      )
    );

  const networkBadge =
    document.getElementById(
      "networkBadge"
    );

  const saveBadge =
    document.getElementById(
      "saveBadge"
    );

  const offlineReadyBadge =
    document.getElementById(
      "offlineReadyBadge"
    );

  const nextButton =
    document.getElementById(
      "nextButton"
    );

  const prevButton =
    document.getElementById(
      "prevButton"
    );

  const finalButton =
    document.getElementById(
      "finalButton"
    );

  const pdfButton =
    document.getElementById(
      "pdfButton"
    );

  const syncButton =
    document.getElementById(
      "syncButton"
    );

  const saveLocalButton =
    document.getElementById(
      "saveLocalButton"
    );

  const deleteDraftButton =
    document.getElementById(
      "deleteDraftButton"
    );

  const factorDefinitions = [
    [
      "strongLight",
      "강한 빛"
    ],
    [
      "highHumidity",
      "높은 습도"
    ],
    [
      "highTemperature",
      "높은 온도"
    ],
    [
      "strongWind",
      "강한 바람"
    ],
    [
      "soilWater",
      "풍부한 토양 수분량"
    ],
    [
      "highCo2",
      "높은 대기 중 CO₂ 농도"
    ]
  ];

  const state = {
    currentSectionIndex: 0,

    submissionId:
      crypto.randomUUID(),

    revision: 0,

    sessionStartedAt:
      new Date().toISOString(),

    firstEditAt: null,

    lastEditAt: null,

    finalSubmittedAt: null,

    activeSeconds: 0,

    offlineSeconds: 0,

    lastActivityAt:
      Date.now(),

    fieldStats: {},

    sectionSeconds: {},

    images: {},

    dirty: false,

    saving: false
  };

  let autosaveTimer = null;

  let metricTimer = null;

  const previousLengths =
    new Map();


  /**
   * 9쪽의 환경 요인 분류 표를 만듭니다.
   */
  function buildFactorTable() {
    const tbody =
      document.getElementById(
        "factorTableBody"
      );

    tbody.innerHTML =
      factorDefinitions
        .map(
          ([key, label]) => `
            <tr>
              <th
                class="factor-name"
                id="factor-label-${key}"
              >
                ${label}
              </th>

              <td>
                <input
                  type="radio"
                  name="q9_factor_${key}_effect"
                  value="promote"
                  aria-labelledby="factor-label-${key}"
                >
              </td>

              <td>
                <input
                  type="radio"
                  name="q9_factor_${key}_effect"
                  value="inhibit"
                  aria-labelledby="factor-label-${key}"
                >
              </td>

              <td>
                <input
                  type="checkbox"
                  name="q9_factor_${key}_manipulable"
                  aria-label="${label} 조작 가능"
                >
              </td>
            </tr>
          `
        )
        .join("");
  }


  /**
   * 조작 가능한 변인을 빨간색으로 표시합니다.
   */
  function updateFactorStyles() {
    for (
      const [key] of
      factorDefinitions
    ) {
      const checkbox =
        form.elements[
          `q9_factor_${key}_manipulable`
        ];

      const label =
        document.getElementById(
          `factor-label-${key}`
        );

      label.classList.toggle(
        "manipulable",
        Boolean(
          checkbox?.checked
        )
      );
    }
  }


  /**
   * 활동지 페이지를 이동합니다.
   */
  function setSection(index) {
    state.currentSectionIndex =
      Math.max(
        0,
        Math.min(
          index,
          sections.length - 1
        )
      );

    sections.forEach(
      (section, sectionIndex) => {
        section.classList.toggle(
          "active",
          sectionIndex ===
            state.currentSectionIndex
        );
      }
    );

    navButtons.forEach(
      (button, buttonIndex) => {
        button.classList.toggle(
          "active",
          buttonIndex ===
            state.currentSectionIndex
        );
      }
    );

    prevButton.disabled =
      state.currentSectionIndex === 0;

    const atLast =
      state.currentSectionIndex ===
      sections.length - 1;

    nextButton.hidden = atLast;

    pdfButton.hidden = !atLast;

    finalButton.hidden = !atLast;

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

    scheduleSave();
  }


  /**
   * 학생이 화면을 사용한 시간을 갱신합니다.
   */
  function touchActivity() {
    state.lastActivityAt =
      Date.now();
  }


  /**
   * 문항별 입력 횟수와 시간을 기록합니다.
   */
  function recordFieldEvent(event) {
    const target =
      event.target;

    if (
      !(
        target instanceof
          HTMLInputElement ||
        target instanceof
          HTMLTextAreaElement ||
        target instanceof
          HTMLSelectElement
      )
    ) {
      return;
    }

    const fieldId =
      target.name ||
      target.id;

    if (
      !fieldId ||
      target.type === "file"
    ) {
      return;
    }

    const now =
      new Date().toISOString();

    if (!state.firstEditAt) {
      state.firstEditAt = now;
    }

    state.lastEditAt = now;

    const stats =
      state.fieldStats[fieldId] ||= {
        firstEditAt: now,
        lastEditAt: now,
        inputEvents: 0,
        pasteEvents: 0,
        charactersAdded: 0,
        maxPasteLength: 0
      };

    stats.lastEditAt = now;

    if (
      event.type === "input" ||
      event.type === "change"
    ) {
      stats.inputEvents += 1;

      const valueLength =
        String(
          target.value || ""
        ).length;

      const previous =
        previousLengths.get(
          fieldId
        ) ?? valueLength;

      if (
        valueLength > previous
      ) {
        stats.charactersAdded +=
          valueLength - previous;
      }

      previousLengths.set(
        fieldId,
        valueLength
      );
    }

    state.dirty = true;

    touchActivity();

    updateFactorStyles();

    updateCalculatedFields();

    scheduleSave();
  }


  /**
   * 붙여넣기 사용 횟수와 붙여넣은 글자 수를 기록합니다.
   */
  function recordPasteEvent(event) {
    const target =
      event.target;

    if (
      !(
        target instanceof
          HTMLInputElement ||
        target instanceof
          HTMLTextAreaElement
      )
    ) {
      return;
    }

    const fieldId =
      target.name ||
      target.id;

    if (!fieldId) {
      return;
    }

    const now =
      new Date().toISOString();

    const stats =
      state.fieldStats[fieldId] ||= {
        firstEditAt: now,
        lastEditAt: now,
        inputEvents: 0,
        pasteEvents: 0,
        charactersAdded: 0,
        maxPasteLength: 0
      };

    const pastedText =
      event.clipboardData
        ?.getData("text") ||
      "";

    stats.pasteEvents += 1;

    stats.maxPasteLength =
      Math.max(
        stats.maxPasteLength,
        pastedText.length
      );

    stats.lastEditAt = now;
  }


  /**
   * 현재 입력된 모든 답변을 모읍니다.
   */
  function collectAnswers() {
    const answers = {};

    const radioNames =
      new Set();

    for (
      const element of
      Array.from(form.elements)
    ) {
      if (
        !element.name ||
        element.type === "file" ||
        element.type === "button"
      ) {
        continue;
      }

      if (
        element.type === "radio"
      ) {
        radioNames.add(
          element.name
        );

        if (element.checked) {
          answers[element.name] =
            element.value;
        }
      } else if (
        element.type === "checkbox"
      ) {
        answers[element.name] =
          element.checked;
      } else {
        answers[element.name] =
          element.value.trim?.() ??
          element.value;
      }
    }

    for (
      const name of
      radioNames
    ) {
      if (!(name in answers)) {
        answers[name] = "";
      }
    }

    return answers;
  }


  /**
   * 기기에 저장된 답변을 화면에 복원합니다.
   */
  function restoreAnswers(
    answers = {}
  ) {
    for (
      const [name, value] of
      Object.entries(answers)
    ) {
      const elements =
        form.querySelectorAll(
          `[name="${CSS.escape(name)}"]`
        );

      for (
        const element of
        elements
      ) {
        if (
          element.type === "radio"
        ) {
          element.checked =
            element.value === value;
        } else if (
          element.type === "checkbox"
        ) {
          element.checked =
            Boolean(value);
        } else {
          element.value =
            value ?? "";
        }
      }
    }

    updateFactorStyles();

    updateCalculatedFields();
  }


  /**
   * 전체 붙여넣기 횟수를 계산합니다.
   */
  function totalPasteCount() {
    return Object
      .values(
        state.fieldStats
      )
      .reduce(
        (sum, item) =>
          sum +
          (
            item.pasteEvents ||
            0
          ),
        0
      );
  }


  /**
   * 기기에 저장할 초안 자료를 만듭니다.
   */
  function buildDraftRecord() {
    return {
      key: "current",

      savedAt:
        new Date().toISOString(),

      appVersion:
        config.APP_VERSION,

      submissionId:
        state.submissionId,

      revision:
        state.revision,

      sessionStartedAt:
        state.sessionStartedAt,

      firstEditAt:
        state.firstEditAt,

      lastEditAt:
        state.lastEditAt,

      finalSubmittedAt:
        state.finalSubmittedAt,

      activeSeconds:
        state.activeSeconds,

      offlineSeconds:
        state.offlineSeconds,

      fieldStats:
        state.fieldStats,

      sectionSeconds:
        state.sectionSeconds,

      currentSectionIndex:
        state.currentSectionIndex,

      answers:
        collectAnswers(),

      images:
        state.images
    };
  }


  /**
   * 현재 자료를 갤럭시탭 내부에 저장합니다.
   */
  async function saveDraft({
    showMessage = false
  } = {}) {
    try {
      await ReportDb.put(
        "drafts",
        buildDraftRecord()
      );

      state.dirty = false;

      setSaveStatus(
        "기기 저장 완료",
        "neutral"
      );

      if (showMessage) {
        showDialog(
          "저장 완료",
          "현재 입력 내용과 그래프 사진을 이 기기에 저장했습니다."
        );
      }
    } catch (error) {
      console.error(error);

      setSaveStatus(
        "기기 저장 실패",
        "error"
      );

      if (showMessage) {
        showDialog(
          "저장 실패",
          "기기 저장 공간을 확인한 뒤 다시 시도하세요."
        );
      }
    }
  }


  /**
   * 입력 후 잠시 기다렸다가 자동 저장합니다.
   */
  function scheduleSave() {
    clearTimeout(
      autosaveTimer
    );

    setSaveStatus(
      "저장 중…",
      "neutral"
    );

    autosaveTimer =
      setTimeout(
        () => saveDraft(),
        650
      );
  }


  /**
   * 기존 초안을 불러옵니다.
   */
  async function restoreDraft() {
    const draft =
      await ReportDb.get(
        "drafts",
        "current"
      );

    if (!draft) {
      return;
    }

    state.submissionId =
      draft.submissionId ||
      state.submissionId;

    state.revision =
      Number(
        draft.revision || 0
      );

    state.sessionStartedAt =
      draft.sessionStartedAt ||
      state.sessionStartedAt;

    state.firstEditAt =
      draft.firstEditAt ||
      null;

    state.lastEditAt =
      draft.lastEditAt ||
      null;

    state.finalSubmittedAt =
      draft.finalSubmittedAt ||
      null;

    state.activeSeconds =
      Number(
        draft.activeSeconds ||
        0
      );

    state.offlineSeconds =
      Number(
        draft.offlineSeconds ||
        0
      );

    state.fieldStats =
      draft.fieldStats || {};

    state.sectionSeconds =
      draft.sectionSeconds || {};

    state.images =
      draft.images || {};

    restoreAnswers(
      draft.answers
    );

    restoreImagePreviews();

    setSection(
      Number(
        draft.currentSectionIndex ||
        0
      )
    );

    setSaveStatus(
      "초안 복원됨",
      "neutral"
    );
  }


  /**
   * 상단 저장 상태 표시를 바꿉니다.
   */
  function setSaveStatus(
    text,
    type = "neutral"
  ) {
    saveBadge.textContent =
      text;

    saveBadge.className =
      `badge ${type}`;
  }


  /**
   * 인터넷 연결 여부를 화면에 표시합니다.
   */
  function updateNetworkStatus() {
    if (navigator.onLine) {
      networkBadge.textContent =
        "네트워크 연결됨";

      networkBadge.className =
        "badge";
    } else {
      networkBadge.textContent =
        "오프라인 작성 중";

      networkBadge.className =
        "badge offline";
    }
  }


  /**
   * 입력값을 이용해 구간 길이를 자동 계산합니다.
   */
  function updateCalculatedFields() {
    const start =
      Number(
        form.elements
          .q13_range_start
          ?.value
      );

    const end =
      Number(
        form.elements
          .q13_range_end
          ?.value
      );

    document
      .getElementById(
        "rangeLength"
      )
      .value =
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        end >= start
          ? (
              end - start
            ).toFixed(1)
          : "";
  }


  /**
   * 파일을 전송 가능한 문자열로 바꿉니다.
   */
  async function fileToDataUrl(
    blob
  ) {
    return await new Promise(
      (resolve, reject) => {
        const reader =
          new FileReader();

        reader.onload = () => {
          resolve(
            reader.result
          );
        };

        reader.onerror = () => {
          reject(
            reader.error
          );
        };

        reader.readAsDataURL(
          blob
        );
      }
    );
  }


  /**
   * 파일의 고유 해시값을 만듭니다.
   */
  async function sha256Hex(
    blob
  ) {
    const digest =
      await crypto.subtle.digest(
        "SHA-256",
        await blob.arrayBuffer()
      );

    return Array
      .from(
        new Uint8Array(
          digest
        )
      )
      .map(
        (byte) =>
          byte
            .toString(16)
            .padStart(2, "0")
      )
      .join("");
  }


  /**
   * 그래프 사진을 용량이 작은 JPEG로 압축합니다.
   */
  async function compressImage(
    file
  ) {
    if (
      !file.type.startsWith(
        "image/"
      )
    ) {
      throw new Error(
        "이미지 파일만 올릴 수 있습니다."
      );
    }

    const sourceUrl =
      URL.createObjectURL(file);

    try {
      const image =
        await new Promise(
          (resolve, reject) => {
            const img =
              new Image();

            img.onload = () => {
              resolve(img);
            };

            img.onerror = () => {
              reject(
                new Error(
                  "이미지를 읽을 수 없습니다."
                )
              );
            };

            img.src =
              sourceUrl;
          }
        );

      const scale =
        Math.min(
          1,
          config.MAX_IMAGE_EDGE /
            Math.max(
              image.naturalWidth,
              image.naturalHeight
            )
        );

      const width =
        Math.max(
          1,
          Math.round(
            image.naturalWidth *
            scale
          )
        );

      const height =
        Math.max(
          1,
          Math.round(
            image.naturalHeight *
            scale
          )
        );

      const canvas =
        document.createElement(
          "canvas"
        );

      canvas.width = width;

      canvas.height = height;

      const context =
        canvas.getContext(
          "2d",
          {
            alpha: false
          }
        );

      context.fillStyle =
        "#ffffff";

      context.fillRect(
        0,
        0,
        width,
        height
      );

      context.drawImage(
        image,
        0,
        0,
        width,
        height
      );

      let quality =
        config.IMAGE_QUALITY;

      let blob =
        await new Promise(
          (resolve) => {
            canvas.toBlob(
              resolve,
              "image/jpeg",
              quality
            );
          }
        );

      while (
        blob &&
        blob.size >
          config.MAX_IMAGE_BYTES &&
        quality > 0.42
      ) {
        quality -= 0.08;

        blob =
          await new Promise(
            (resolve) => {
              canvas.toBlob(
                resolve,
                "image/jpeg",
                quality
              );
            }
          );
      }

      if (!blob) {
        throw new Error(
          "이미지 변환에 실패했습니다."
        );
      }

      if (
        blob.size >
        config.MAX_IMAGE_BYTES
      ) {
        throw new Error(
          "사진 용량이 너무 큽니다. 그래프 부분만 잘라 다시 올려주세요."
        );
      }

      return {
        blob: blob,

        name:
          `${
            file.name.replace(
              /\.[^.]+$/,
              ""
            ) ||
            "graph"
          }.jpg`,

        type:
          "image/jpeg",

        hash:
          await sha256Hex(
            blob
          ),

        width: width,

        height: height,

        size:
          blob.size
      };
    } finally {
      URL.revokeObjectURL(
        sourceUrl
      );
    }
  }


  /**
   * 그래프 사진 미리보기를 갱신합니다.
   */
  function updateImageSlot(
    slotName
  ) {
    const element =
      document.querySelector(
        `.image-slot[data-slot="${slotName}"]`
      );

    if (!element) {
      return;
    }

    const image =
      element.querySelector(
        "img"
      );

    const placeholder =
      element.querySelector(
        ".image-placeholder"
      );

    const removeButton =
      element.querySelector(
        ".remove-image"
      );

    const item =
      state.images[slotName];

    if (
      image.dataset.objectUrl
    ) {
      URL.revokeObjectURL(
        image.dataset.objectUrl
      );
    }

    if (item?.blob) {
      const objectUrl =
        URL.createObjectURL(
          item.blob
        );

      image.src =
        objectUrl;

      image.dataset.objectUrl =
        objectUrl;

      image.hidden = false;

      placeholder.hidden = true;

      removeButton.hidden = false;
    } else {
      image.removeAttribute(
        "src"
      );

      image.hidden = true;

      placeholder.hidden = false;

      removeButton.hidden = true;
    }
  }


  /**
   * 모든 저장된 사진을 화면에 복원합니다.
   */
  function restoreImagePreviews() {
    for (
      const slot of
      [
        "graph1",
        "graph2",
        "graph3"
      ]
    ) {
      updateImageSlot(
        slot
      );
    }
  }


  /**
   * 학생이 선택한 그래프 사진을 처리합니다.
   */
  async function acceptImage(
    slotName,
    file
  ) {
    try {
      setSaveStatus(
        "사진 압축 중…",
        "neutral"
      );

      state.images[slotName] =
        await compressImage(
          file
        );

      updateImageSlot(
        slotName
      );

      state.dirty = true;

      touchActivity();

      await saveDraft();
    } catch (error) {
      showDialog(
        "사진 추가 실패",
        error.message ||
        "이미지를 처리하지 못했습니다."
      );
    }
  }


  /**
   * 사진 선택·붙여넣기·삭제 기능을 연결합니다.
   */
  function setupImageSlots() {
    for (
      const slot of
      document.querySelectorAll(
        ".image-slot"
      )
    ) {
      const slotName =
        slot.dataset.slot;

      const input =
        slot.querySelector(
          'input[type="file"]'
        );

      const remove =
        slot.querySelector(
          ".remove-image"
        );

      slot.addEventListener(
        "click",
        (event) => {
          if (
            event.target ===
            remove
          ) {
            return;
          }

          input.click();
        }
      );

      slot.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key ===
              "Enter" ||
            event.key === " "
          ) {
            input.click();
          }
        }
      );

      input.addEventListener(
        "change",
        () => {
          const file =
            input.files?.[0];

          if (file) {
            acceptImage(
              slotName,
              file
            );
          }

          input.value = "";
        }
      );

      remove.addEventListener(
        "click",
        async (event) => {
          event.stopPropagation();

          delete state.images[
            slotName
          ];

          updateImageSlot(
            slotName
          );

          await saveDraft();
        }
      );

      for (
        const eventName of
        [
          "dragenter",
          "dragover"
        ]
      ) {
        slot.addEventListener(
          eventName,
          (event) => {
            event.preventDefault();

            slot.classList.add(
              "dragover"
            );
          }
        );
      }

      for (
        const eventName of
        [
          "dragleave",
          "drop"
        ]
      ) {
        slot.addEventListener(
          eventName,
          (event) => {
            event.preventDefault();

            slot.classList.remove(
              "dragover"
            );
          }
        );
      }

      slot.addEventListener(
        "drop",
        (event) => {
          const file =
            Array
              .from(
                event.dataTransfer
                  ?.files ||
                []
              )
              .find(
                (item) =>
                  item.type.startsWith(
                    "image/"
                  )
              );

          if (file) {
            acceptImage(
              slotName,
              file
            );
          }
        }
      );

      slot.addEventListener(
        "paste",
        (event) => {
          const item =
            Array
              .from(
                event.clipboardData
                  ?.items ||
                []
              )
              .find(
                (entry) =>
                  entry.type.startsWith(
                    "image/"
                  )
              );

          const file =
            item?.getAsFile();

          if (file) {
            event.preventDefault();

            acceptImage(
              slotName,
              file
            );
          }
        }
      );
    }
  }


  /**
   * 사진을 서버 전송 형식으로 변환합니다.
   */
  async function serializeImages() {
    const result = [];

    for (
      const [slot, item] of
      Object.entries(
        state.images
      )
    ) {
      if (!item?.blob) {
        continue;
      }

      result.push({
        slot: slot,

        name:
          item.name,

        type:
          item.type,

        hash:
          item.hash,

        width:
          item.width,

        height:
          item.height,

        size:
          item.size,

        dataUrl:
          await fileToDataUrl(
            item.blob
          )
      });
    }

    return result;
  }


  /**
   * Apps Script 주소가 입력되었는지 확인합니다.
   */
  function apiConfigured() {
    return /^https:\/\/script\.google\.com\/.+\/exec(?:\?.*)?$/
      .test(
        config.API_URL
      );
  }


  /**
   * 교사용 서버로 보낼 제출 자료를 만듭니다.
   */
  async function buildSubmissionPayload(
    status,
    pdfFile = null
  ) {
    const answers =
      collectAnswers();

    const nextRevision =
      state.revision + 1;

    return {
      schemaVersion: 2,

      appVersion:
        config.APP_VERSION,

      classCode:
        config.CLASS_CODE,

      submissionId:
        state.submissionId,

      revision:
        nextRevision,

      status:
        status,

      clientSavedAt:
        new Date().toISOString(),

      finalSubmittedAt:
        status === "final"
          ? new Date()
              .toISOString()
          : state.finalSubmittedAt,

      identity: {
        studentNo:
          answers.studentNo ||
          "",

        studentName:
          answers.studentName ||
          "",

        groupNo:
          answers.groupNo ||
          "",

        className:
          answers.className ||
          ""
      },

      timing: {
        sessionStartedAt:
          state.sessionStartedAt,

        firstEditAt:
          state.firstEditAt,

        lastEditAt:
          state.lastEditAt,

        activeSeconds:
          state.activeSeconds,

        offlineSeconds:
          state.offlineSeconds,

        sectionSeconds:
          state.sectionSeconds,

        totalPasteCount:
          totalPasteCount()
      },

      fieldStats:
        state.fieldStats,

      answers:
        answers,

      images:
        await serializeImages(),

      pdf:
        status === "final" &&
        pdfFile
          ? {
              name:
                pdfFile.name,

              type:
                pdfFile.type,

              hash:
                pdfFile.hash,

              size:
                pdfFile.size,

              pageCount:
                pdfFile.pageCount,

              createdAt:
                pdfFile.createdAt,

              dataUrl:
                await fileToDataUrl(
                  pdfFile.blob
                )
            }
          : null,

      client: {
        userAgent:
          navigator.userAgent,

        language:
          navigator.language,

        screen:
          `${screen.width}x${screen.height}`,

        onlineAtSubmit:
          navigator.onLine
      }
    };
  }


  /**
   * 아직 전송하지 못한 자료를 기기에 보관합니다.
   */
  async function queuePayload(
    payload
  ) {
    const existing =
      await ReportDb.get(
        "outbox",
        state.submissionId
      );

    if (
      existing?.payload
        ?.status === "final" &&
      payload.status === "draft"
    ) {
      return;
    }

    await ReportDb.put(
      "outbox",
      {
        key:
          state.submissionId,

        queuedAt:
          new Date()
            .toISOString(),

        attempts: 0,

        payload:
          payload
      }
    );
  }


  /**
   * Apps Script에 자료를 전송합니다.
   */
  async function sendNoCors(
    payload
  ) {
    const body =
      new URLSearchParams({
        payload:
          JSON.stringify(
            payload
          )
      });

    await fetch(
      config.API_URL,
      {
        method: "POST",

        mode: "no-cors",

        redirect: "follow",

        cache: "no-store",

        body: body
      }
    );
  }


  /**
   * Apps Script에 실제로 저장되었는지 다시 확인합니다.
   */
  function jsonpStatus(
    submissionId,
    expectedRevision
  ) {
    return new Promise(
      (resolve, reject) => {
        const callbackName =
          `__reportStatus_${
            Date.now()
          }_${
            Math.floor(
              Math.random() *
              10000
            )
          }`;

        const script =
          document.createElement(
            "script"
          );

        const timeout =
          setTimeout(
            () =>
              cleanup(
                new Error(
                  "서버 확인 시간이 초과되었습니다."
                )
              ),
            9000
          );

        function cleanup(
          error,
          value
        ) {
          clearTimeout(
            timeout
          );

          script.remove();

          delete window[
            callbackName
          ];

          if (error) {
            reject(error);
          } else {
            resolve(value);
          }
        }

        window[callbackName] =
          (result) => {
            if (
              result?.found &&
              Number(
                result.revision
              ) >=
                Number(
                  expectedRevision
                )
            ) {
              cleanup(
                null,
                result
              );
            } else {
              cleanup(
                new Error(
                  "서버에 아직 반영되지 않았습니다."
                )
              );
            }
          };

        const url =
          new URL(
            config.API_URL
          );

        url.searchParams.set(
          "action",
          "status"
        );

        url.searchParams.set(
          "classCode",
          config.CLASS_CODE
        );

        url.searchParams.set(
          "submissionId",
          submissionId
        );

        url.searchParams.set(
          "prefix",
          callbackName
        );

        url.searchParams.set(
          "_",
          Date.now()
        );

        script.onerror = () => {
          cleanup(
            new Error(
              "서버 상태를 확인하지 못했습니다."
            )
          );
        };

        script.src =
          url.toString();

        document.head.appendChild(
          script
        );
      }
    );
  }


  /**
   * 전송 대기 자료 한 건을 전송합니다.
   */
  async function transmitQueued(
    item
  ) {
    await sendNoCors(
      item.payload
    );

    let lastError;

    for (
      let attempt = 0;
      attempt < 4;
      attempt += 1
    ) {
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            1100 +
              attempt *
              900
          )
      );

      try {
        return await jsonpStatus(
          item.payload
            .submissionId,

          item.payload
            .revision
        );
      } catch (error) {
        lastError = error;
      }
    }

    throw (
      lastError ||
      new Error(
        "서버 저장을 확인하지 못했습니다."
      )
    );
  }


  /**
   * 기기에 쌓인 전송 대기 자료를 서버로 보냅니다.
   */
  async function flushOutbox() {
    if (
      !navigator.onLine ||
      !apiConfigured()
    ) {
      return false;
    }

    const items =
      await ReportDb.getAll(
        "outbox"
      );

    for (
      const item of items
    ) {
      try {
        const result =
          await transmitQueued(
            item
          );

        state.revision =
          Math.max(
            state.revision,
            Number(
              result.revision ||
              0
            )
          );

        if (
          item.payload.status ===
          "final"
        ) {
          state.finalSubmittedAt =
            item.payload
              .finalSubmittedAt;
        }

        await ReportDb.delete(
          "outbox",
          item.key
        );

        await saveDraft();
      } catch (error) {
        console.warn(
          "Outbox sync failed",
          error
        );

        item.attempts =
          Number(
            item.attempts ||
            0
          ) + 1;

        item.lastAttemptAt =
          new Date()
            .toISOString();

        item.lastError =
          String(
            error.message ||
            error
          );

        await ReportDb.put(
          "outbox",
          item
        );

        return false;
      }
    }

    return true;
  }


  /**
   * PDF 작업 중 버튼을 잠급니다.
   */
  function setPdfBusy(
    isBusy
  ) {
    pdfButton.disabled =
      isBusy;

    finalButton.disabled =
      isBusy;

    syncButton.disabled =
      isBusy;

    saveLocalButton.disabled =
      isBusy;
  }


  /**
   * 현재 입력 내용을 PDF로 생성합니다.
   */
  async function createReportPdf({
    download = true
  } = {}) {
    if (!window.ReportPdf) {
      throw new Error(
        "PDF 생성 기능을 불러오지 못했습니다. 앱을 새로고침해 주세요."
      );
    }

    const answers =
      collectAnswers();

    setPdfBusy(true);

    setSaveStatus(
      "PDF 생성 준비 중…",
      "neutral"
    );

    try {
      await saveDraft();

      const pdf =
        await ReportPdf.create({
          answers:
            answers,

          images:
            state.images,

          timing: {
            activeSeconds:
              state.activeSeconds,

            offlineSeconds:
              state.offlineSeconds
          },

          submissionId:
            state.submissionId,

          appVersion:
            config.APP_VERSION,

          onProgress: ({
            current,
            total,
            label
          }) => {
            setSaveStatus(
              `PDF 생성 중 ${current}/${total} · ${label}`,
              "neutral"
            );
          }
        });

      const maxPdfBytes =
        Number(
          config.MAX_PDF_BYTES ||
          12000000
        );

      if (
        pdf.size >
        maxPdfBytes
      ) {
        throw new Error(
          `생성된 PDF가 ${
            (
              pdf.size /
              1024 /
              1024
            ).toFixed(1)
          }MB로 너무 큽니다. 그래프 이미지를 줄인 뒤 다시 시도해 주세요.`
        );
      }

      if (download) {
        ReportPdf.download(
          pdf
        );
      }

      setSaveStatus(
        "PDF 생성 완료",
        "neutral"
      );

      return pdf;
    } finally {
      setPdfBusy(false);
    }
  }


  /**
   * 최종 제출 전에 필수 내용을 확인합니다.
   */
  function validateBeforeFinal() {
    const required = [
      [
        "studentNo",
        "학번"
      ],
      [
        "studentName",
        "이름"
      ],
      [
        "groupNo",
        "모둠"
      ],
      [
        "q10_1a",
        "10쪽 1-①"
      ],
      [
        "q11_3",
        "11쪽 3번"
      ],
      [
        "q12_3",
        "12쪽 3번"
      ],
      [
        "inquiryTopic",
        "개별 심화 탐구 주제"
      ]
    ];

    for (
      const [name, label] of
      required
    ) {
      const element =
        form.elements[name];

      if (
        !String(
          element?.value ||
          ""
        ).trim()
      ) {
        return `${label} 항목을 작성해 주세요.`;
      }
    }

    if (
      !state.images
        .graph1?.blob
    ) {
      return "1차 실험 결과 그래프를 첨부해 주세요.";
    }

    const aiUsed =
      form.querySelector(
        'input[name="aiUsed"]:checked'
      )?.value;

    if (!aiUsed) {
      return "AI 사용 여부를 선택해 주세요.";
    }

    if (
      aiUsed === "yes" &&
      !String(
        form.elements
          .aiLink?.value ||
        ""
      ).trim()
    ) {
      return "AI를 사용했다면 대화 공유 링크를 입력해 주세요.";
    }

    return "";
  }


  /**
   * 중간 저장 또는 최종 제출을 실행합니다.
   */
  async function syncReport(
    status = "draft",
    pdfFile = null
  ) {
    if (state.saving) {
      return;
    }

    if (!apiConfigured()) {
      await saveDraft();

      showDialog(
        "서버 주소 설정 필요",
        "config.js의 API_URL을 Apps Script 배포 주소로 설정해야 서버 제출이 가능합니다."
      );

      return;
    }

    if (!navigator.onLine) {
      const payload =
        await buildSubmissionPayload(
          status,
          pdfFile
        );

      await queuePayload(
        payload
      );

      await saveDraft();

      setSaveStatus(
        "연결 후 전송 대기",
        "offline"
      );

      showDialog(
        "오프라인 저장 완료",
        status === "final"
          ? "PDF는 기기에 다운로드되었고 최종 제출 자료는 전송 대기함에 저장되었습니다. 인터넷에 다시 연결한 뒤 서버 저장 버튼을 눌러 전송 상태를 확인하세요."
          : "인터넷에 다시 연결하면 서버 전송을 시도합니다. 이 탭을 닫아도 초안과 전송 대기 자료는 기기에 남습니다."
      );

      return;
    }

    state.saving = true;

    syncButton.disabled = true;

    finalButton.disabled = true;

    pdfButton.disabled = true;

    setSaveStatus(
      "서버 전송 중…",
      "neutral"
    );

    try {
      const payload =
        await buildSubmissionPayload(
          status,
          pdfFile
        );

      await queuePayload(
        payload
      );

      const success =
        await flushOutbox();

      if (!success) {
        throw new Error(
          "서버 반영을 확인하지 못했습니다. 전송 대기 상태로 보관합니다."
        );
      }

      setSaveStatus(
        status === "final"
          ? "최종 제출 완료"
          : "서버 저장 완료",
        "neutral"
      );

      showDialog(
        status === "final"
          ? "PDF 최종 제출 완료"
          : "중간 저장 완료",

        status === "final"
          ? "기기에 다운로드된 PDF와 동일한 보고서가 교사용 드라이브에 제출되었습니다. 수정 후 다시 제출하면 최신 PDF로 갱신됩니다."
          : "현재 내용을 교사용 스프레드시트에 저장했습니다."
      );
    } catch (error) {
      console.error(error);

      setSaveStatus(
        "전송 대기",
        "offline"
      );

      showDialog(
        "서버 저장 확인 실패",
        "내용은 이 기기와 전송 대기함에 보관되어 있습니다. 인터넷 연결 후 ‘서버에 중간 저장’을 다시 눌러주세요."
      );
    } finally {
      state.saving = false;

      syncButton.disabled = false;

      finalButton.disabled = false;

      pdfButton.disabled = false;
    }
  }


  /**
   * 안내창을 표시합니다.
   */
  function showDialog(
    title,
    message
  ) {
    document
      .getElementById(
        "dialogTitle"
      )
      .textContent =
        title;

    document
      .getElementById(
        "dialogMessage"
      )
      .textContent =
        message;

    const dialog =
      document.getElementById(
        "messageDialog"
      );

    if (
      typeof dialog.showModal ===
      "function"
    ) {
      dialog.showModal();
    } else {
      alert(
        `${title}\n\n${message}`
      );
    }
  }


  /**
   * 공용 기기에서 학생 자료를 삭제합니다.
   */
  async function deleteDraft() {
    const confirmed =
      confirm(
        "이 기기에 저장된 초안, 사진, 전송 대기 자료를 모두 삭제할까요? 서버에 이미 제출된 자료는 삭제되지 않습니다."
      );

    if (!confirmed) {
      return;
    }

    await ReportDb.delete(
      "drafts",
      "current"
    );

    await ReportDb.delete(
      "outbox",
      state.submissionId
    );

    location.reload();
  }


  /**
   * 실제 작성 시간을 5초 단위로 기록합니다.
   */
  function startMetrics() {
    metricTimer =
      setInterval(
        () => {
          if (
            document
              .visibilityState !==
            "visible"
          ) {
            return;
          }

          if (
            Date.now() -
              state.lastActivityAt >
            config
              .ACTIVE_WINDOW_SECONDS *
              1000
          ) {
            return;
          }

          state.activeSeconds += 5;

          if (!navigator.onLine) {
            state.offlineSeconds +=
              5;
          }

          const sectionId =
            sections[
              state
                .currentSectionIndex
            ]?.id ||
            "unknown";

          state.sectionSeconds[
            sectionId
          ] =
            Number(
              state.sectionSeconds[
                sectionId
              ] ||
              0
            ) + 5;

          state.dirty = true;

          if (
            state.activeSeconds %
              30 ===
            0
          ) {
            scheduleSave();
          }
        },
        5000
      );
  }


  /**
   * 버튼과 입력창의 동작을 연결합니다.
   */
  function bindEvents() {
    form.addEventListener(
      "input",
      recordFieldEvent
    );

    form.addEventListener(
      "change",
      recordFieldEvent
    );

    form.addEventListener(
      "paste",
      recordPasteEvent
    );

    for (
      const eventName of
      [
        "pointerdown",
        "keydown",
        "touchstart"
      ]
    ) {
      document.addEventListener(
        eventName,
        touchActivity,
        {
          passive: true
        }
      );
    }

    navButtons.forEach(
      (button, index) => {
        button.addEventListener(
          "click",
          () =>
            setSection(index)
        );
      }
    );

    nextButton.addEventListener(
      "click",
      () =>
        setSection(
          state.currentSectionIndex +
          1
        )
    );

    prevButton.addEventListener(
      "click",
      () =>
        setSection(
          state.currentSectionIndex -
          1
        )
    );

    saveLocalButton
      .addEventListener(
        "click",
        () =>
          saveDraft({
            showMessage: true
          })
      );

    syncButton.addEventListener(
      "click",
      () =>
        syncReport("draft")
    );

    pdfButton.addEventListener(
      "click",
      async () => {
        try {
          const pdf =
            await createReportPdf({
              download: true
            });

          showDialog(
            "PDF 다운로드 완료",
            `${pdf.name} 파일을 생성했습니다. 다운로드 폴더에서 열어 보고서 내용을 확인해 주세요.`
          );
        } catch (error) {
          console.error(error);

          setSaveStatus(
            "PDF 생성 실패",
            "error"
          );

          showDialog(
            "PDF 생성 실패",
            error.message ||
            "보고서 PDF를 만들지 못했습니다."
          );
        }
      }
    );

    finalButton.addEventListener(
      "click",
      async () => {
        const error =
          validateBeforeFinal();

        if (error) {
          showDialog(
            "작성 항목 확인",
            error
          );

          return;
        }

        const confirmed =
          confirm(
            "현재 내용으로 PDF를 생성해 기기에 다운로드하고, 같은 PDF를 교사에게 최종 제출할까요?"
          );

        if (!confirmed) {
          return;
        }

        try {
          const pdf =
            await createReportPdf({
              download: true
            });

          await syncReport(
            "final",
            pdf
          );
        } catch (error) {
          console.error(error);

          setSaveStatus(
            "PDF 제출 실패",
            "error"
          );

          showDialog(
            "PDF 제출 준비 실패",
            error.message ||
            "PDF를 생성하지 못했습니다."
          );
        }
      }
    );

    deleteDraftButton
      .addEventListener(
        "click",
        deleteDraft
      );

    window.addEventListener(
      "online",
      async () => {
        updateNetworkStatus();

        setSaveStatus(
          "연결됨 · 전송 확인 중",
          "neutral"
        );

        const success =
          await flushOutbox();

        setSaveStatus(
          success
            ? "대기 자료 전송 완료"
            : "전송 대기",

          success
            ? "neutral"
            : "offline"
        );
      }
    );

    window.addEventListener(
      "offline",
      updateNetworkStatus
    );

    window.addEventListener(
      "beforeunload",
      () => {
        if (state.dirty) {
          saveDraft();
        }
      }
    );
  }


  /**
   * 오프라인 화면 저장 기능을 등록합니다.
   */
  async function registerServiceWorker() {
    if (
      !(
        "serviceWorker" in
        navigator
      )
    ) {
      offlineReadyBadge.textContent =
        "오프라인 재실행 미지원";

      offlineReadyBadge.className =
        "badge error";

      return;
    }

    try {
      await navigator
        .serviceWorker
        .register("sw.js");

      await navigator
        .serviceWorker
        .ready;

      offlineReadyBadge.textContent =
        "오프라인 준비됨";

      offlineReadyBadge.className =
        "badge";

      if (
        navigator.storage
          ?.persist
      ) {
        await navigator
          .storage
          .persist();
      }
    } catch (error) {
      console.warn(
        "Service worker registration failed",
        error
      );

      offlineReadyBadge.textContent =
        "오프라인 준비 실패";

      offlineReadyBadge.className =
        "badge error";
    }
  }


  /**
   * 학생용 웹앱을 시작합니다.
   */
  async function init() {
    buildFactorTable();

    bindEvents();

    setupImageSlots();

    updateNetworkStatus();

    await restoreDraft();

    startMetrics();

    await registerServiceWorker();

    if (navigator.onLine) {
      flushOutbox();
    }
  }


  init().catch(
    (error) => {
      console.error(error);

      showDialog(
        "초기화 오류",
        "앱을 시작하지 못했습니다. 크롬을 새로고침한 뒤 다시 시도하세요."
      );
    }
  );
})();
