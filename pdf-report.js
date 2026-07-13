(() => {
  "use strict";

  const REPORT_TITLE =
    "무선 센서를 활용한 기공 개폐와 증산 속도 분석";

  const A4_WIDTH_MM = 210;
  const A4_HEIGHT_MM = 297;

  const RENDER_WIDTH_PX = 794;
  const RENDER_SCALE = 1.35;
  const JPEG_QUALITY = 0.76;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function display(
    value,
    emptyText = "작성하지 않음"
  ) {
    const text =
      String(value ?? "").trim();

    if (text) {
      return escapeHtml(text)
        .replace(/\n/g, "<br>");
    }

    return `
      <span class="pdf-empty">
        ${escapeHtml(emptyText)}
      </span>
    `;
  }

  function numberDisplay(
    value,
    suffix = ""
  ) {
    const text =
      String(value ?? "").trim();

    if (!text) {
      return `
        <span class="pdf-empty">
          -
        </span>
      `;
    }

    return (
      escapeHtml(text) +
      escapeHtml(suffix)
    );
  }

  function answerBlock(
    number,
    question,
    answer
  ) {
    return `
      <section class="pdf-question">
        <div class="pdf-question-title">
          <b>${escapeHtml(number)}</b>
          ${escapeHtml(question)}
        </div>

        <div class="pdf-answer">
          ${display(answer)}
        </div>
      </section>
    `;
  }

  function effectText(value) {
    if (value === "promote") {
      return "증산 촉진";
    }

    if (value === "inhibit") {
      return "증산 억제";
    }

    return "-";
  }

  function yesNo(value) {
    if (
      value === true ||
      value === "true"
    ) {
      return "가능";
    }

    return "-";
  }

  function aiUsedText(value) {
    if (value === "yes") {
      return "사용함";
    }

    if (value === "no") {
      return "사용하지 않음";
    }

    return "선택하지 않음";
  }

  async function blobToDataUrl(blob) {
    return new Promise(
      (resolve, reject) => {
        const reader =
          new FileReader();

        reader.onload = () => {
          resolve(reader.result);
        };

        reader.onerror = () => {
          reject(reader.error);
        };

        reader.readAsDataURL(blob);
      }
    );
  }

  async function hashBlob(blob) {
    const buffer =
      await blob.arrayBuffer();

    if (
      globalThis.crypto &&
      globalThis.crypto.subtle
    ) {
      const digest =
        await globalThis.crypto.subtle.digest(
          "SHA-256",
          buffer
        );

      return Array.from(
        new Uint8Array(digest)
      )
        .map((byte) =>
          byte
            .toString(16)
            .padStart(2, "0")
        )
        .join("");
    }

    let hash = 2166136261;

    for (
      const byte of
      new Uint8Array(buffer)
    ) {
      hash ^= byte;
      hash = Math.imul(
        hash,
        16777619
      );
    }

    return (
      "fnv1a-" +
      (hash >>> 0)
        .toString(16)
        .padStart(8, "0") +
      "-" +
      blob.size
    );
  }

  function safeFileName(value) {
    return String(
      value || "보고서"
    )
      .replace(
        /[\\/:*?"<>|#%{}~&]/g,
        "_"
      )
      .replace(/\s+/g, "_")
      .slice(0, 100);
  }

  function imageBlock(
    dataUrl,
    caption,
    emptyText = "첨부 이미지 없음"
  ) {
    const imageHtml = dataUrl
      ? `
        <img
          src="${dataUrl}"
          alt="${escapeHtml(caption)}"
        >
      `
      : `
        <div class="pdf-image-empty">
          ${escapeHtml(emptyText)}
        </div>
      `;

    return `
      <section class="pdf-image-block">
        <div class="pdf-caption">
          ${escapeHtml(caption)}
        </div>

        ${imageHtml}
      </section>
    `;
  }

  function group(
    title,
    pageLabel,
    body,
    className = ""
  ) {
    return `
      <article
        class="pdf-group ${className}"
      >
        <header class="pdf-section-header">
          <span>
            ${escapeHtml(pageLabel)}
          </span>

          <h2>
            ${escapeHtml(title)}
          </h2>
        </header>

        ${body}
      </article>
    `;
  }

  async function buildReportElement({
    answers,
    images,
    timing,
    submissionId,
    appVersion
  }) {
    const imageData = {};

    for (
      const slot of
      ["graph1", "graph2", "graph3"]
    ) {
      if (
        images &&
        images[slot] &&
        images[slot].blob
      ) {
        imageData[slot] =
          await blobToDataUrl(
            images[slot].blob
          );
      } else {
        imageData[slot] = "";
      }
    }

    const factorDefinitions = [
      ["strongLight", "강한 빛"],
      ["highHumidity", "높은 습도"],
      [
        "highTemperature",
        "높은 온도"
      ],
      ["strongWind", "강한 바람"],
      [
        "soilWater",
        "풍부한 토양 수분량"
      ],
      [
        "highCo2",
        "높은 대기 중 CO₂ 농도"
      ]
    ];

    const factorRows =
      factorDefinitions
        .map(([key, label]) => {
          return `
            <tr>
              <th>
                ${escapeHtml(label)}
              </th>

              <td>
                ${effectText(
                  answers[
                    `q9_factor_${key}_effect`
                  ]
                )}
              </td>

              <td>
                ${yesNo(
                  answers[
                    `q9_factor_${key}_manipulable`
                  ]
                )}
              </td>
            </tr>
          `;
        })
        .join("");

    const conditions = [
      [
        "1차",
        "빛",
        "q9_c_1_light"
      ],
      [
        "1차",
        "습도",
        "q9_c_1_hum"
      ],
      [
        "2차",
        "빛",
        "q9_c_2_light"
      ],
      [
        "2차",
        "습도",
        "q9_c_2_hum"
      ]
    ];

    const conditionRows =
      conditions
        .map(
          ([
            round,
            variable,
            prefix
          ]) => {
            const groupCells =
              [1, 2, 3, 4]
                .map(
                  (groupNo) => `
                    <td>
                      ${display(
                        answers[
                          `${prefix}_g${groupNo}`
                        ],
                        "-"
                      )}
                    </td>
                  `
                )
                .join("");

            return `
              <tr>
                <th>
                  ${round}
                </th>

                <th>
                  ${variable}
                </th>

                ${groupCells}
              </tr>
            `;
          }
        )
        .join("");

    const resultMetrics = [
      [
        "1차 초기 온도(℃)",
        "first_temp"
      ],
      [
        "1차 초기 습도(%)",
        "first_hum"
      ],
      [
        "① 초기 습도 증가 기울기",
        "first_slope"
      ],
      [
        "2차 초기 온도(℃)",
        "second_temp"
      ],
      [
        "2차 초기 습도(%)",
        "second_hum"
      ],
      [
        "② 초기 습도 증가 기울기",
        "second_slope"
      ],
      [
        "초기 증산 속도 증가량(②-①)",
        "delta"
      ]
    ];

    const resultMetricRows =
      resultMetrics.map(
        ([label, suffix]) => {
          const groupCells =
            [1, 2, 3, 4]
              .map(
                (groupNo) => `
                  <td>
                    ${display(
                      answers[
                        `q11_g${groupNo}_${suffix}`
                      ],
                      "-"
                    )}
                  </td>
                `
              )
              .join("");

          return `
            <tr>
              <th>
                ${label}
              </th>

              ${groupCells}
            </tr>
          `;
        }
      );

    const reportRoot =
      document.createElement("div");

    reportRoot.className =
      "report-pdf-root";

    reportRoot.setAttribute(
      "aria-hidden",
      "true"
    );

    reportRoot.innerHTML = `
      <style>
        .report-pdf-root {
          position: fixed;
          left: -100000px;
          top: 0;
          width: ${RENDER_WIDTH_PX}px;
          z-index: -1;
          color: #17201e;
          font-family:
            "Noto Sans KR",
            "Malgun Gothic",
            "Apple SD Gothic Neo",
            sans-serif;
          line-height: 1.55;
        }

        .report-pdf-root * {
          box-sizing: border-box;
        }

        .pdf-group {
          width: ${RENDER_WIDTH_PX}px;
          min-height: 1040px;
          padding: 50px 54px 58px;
          background: #ffffff;
        }

        .pdf-cover {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 1040px;
        }

        .pdf-cover-top {
          border-top:
            8px solid #0f766e;
          padding-top: 48px;
        }

        .pdf-cover .pdf-program {
          color: #0f766e;
          font-weight: 800;
          letter-spacing: 0.06em;
          font-size: 16px;
        }

        .pdf-cover h1 {
          margin: 28px 0 20px;
          font-size: 34px;
          line-height: 1.35;
          letter-spacing: -0.03em;
        }

        .pdf-cover .pdf-subtitle {
          font-size: 18px;
          color: #41514d;
        }

        .pdf-identity {
          width: 100%;
          border-collapse: collapse;
          margin-top: 56px;
          font-size: 17px;
        }

        .pdf-identity th,
        .pdf-identity td {
          border:
            1px solid #9fb0ab;
          padding: 13px 15px;
        }

        .pdf-identity th {
          width: 18%;
          background: #e9f5f2;
          text-align: left;
        }

        .pdf-cover-note {
          padding: 18px 20px;
          background: #f4f7f6;
          border-left:
            5px solid #0f766e;
          color: #52615d;
          font-size: 14px;
        }

        .pdf-meta {
          margin-top: 20px;
          font-size: 11px;
          color: #7c8985;
          overflow-wrap: anywhere;
        }

        .pdf-section-header {
          display: flex;
          align-items: center;
          gap: 14px;
          border-bottom:
            3px solid #0f766e;
          padding-bottom: 12px;
          margin-bottom: 22px;
        }

        .pdf-section-header span {
          min-width: 54px;
          padding: 7px 10px;
          border-radius: 999px;
          background: #0f766e;
          color: #ffffff;
          text-align: center;
          font-weight: 800;
          font-size: 13px;
        }

        .pdf-section-header h2 {
          margin: 0;
          font-size: 24px;
          letter-spacing: -0.02em;
        }

        .pdf-question {
          margin: 0 0 19px;
          break-inside: avoid;
        }

        .pdf-question-title {
          font-size: 14px;
          margin-bottom: 7px;
          color: #25322f;
        }

        .pdf-answer {
          min-height: 48px;
          padding: 11px 13px;
          border:
            1px solid #bdcac6;
          background: #fbfdfc;
          border-radius: 6px;
          font-size: 13px;
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .pdf-empty {
          color: #9aa5a2;
        }

        .pdf-table {
          width: 100%;
          border-collapse: collapse;
          margin: 9px 0 20px;
          table-layout: fixed;
          font-size: 12px;
        }

        .pdf-table th,
        .pdf-table td {
          border:
            1px solid #aebbb7;
          padding: 8px 7px;
          text-align: center;
          vertical-align: top;
          overflow-wrap: anywhere;
        }

        .pdf-table th {
          background: #e9f1ef;
          font-weight: 800;
        }

        .pdf-table .left {
          text-align: left;
        }

        .pdf-table.result th:first-child {
          width: 31%;
          text-align: left;
        }

        .pdf-table.factor th:first-child {
          width: 44%;
          text-align: left;
        }

        .pdf-subheading {
          margin: 22px 0 11px;
          font-size: 17px;
          color: #0f5f58;
        }

        .pdf-image-block {
          margin: 12px 0 22px;
          break-inside: avoid;
        }

        .pdf-caption {
          margin-bottom: 8px;
          font-weight: 800;
          font-size: 14px;
        }

        .pdf-image-block img {
          display: block;
          max-width: 100%;
          max-height: 510px;
          margin: 0 auto;
          border:
            1px solid #cad4d1;
          object-fit: contain;
        }

        .pdf-image-empty {
          height: 150px;
          display: grid;
          place-items: center;
          border:
            2px dashed #c3cecb;
          color: #87938f;
          background: #fafcfc;
        }

        .pdf-source {
          margin: 0 0 17px;
          padding: 14px 16px;
          background: #f3f6f5;
          border-radius: 7px;
          font-size: 12px;
          color: #44524e;
        }

        .pdf-inline-grid {
          display: grid;
          grid-template-columns:
            repeat(2, 1fr);
          gap: 10px;
          margin-bottom: 18px;
        }

        .pdf-inline-item {
          border:
            1px solid #bdcac6;
          border-radius: 6px;
          padding: 10px 12px;
          background: #fbfdfc;
          font-size: 13px;
        }

        .pdf-inline-item b {
          display: block;
          margin-bottom: 4px;
          color: #4d5e59;
          font-size: 12px;
        }

        .pdf-inquiry {
          min-height: 370px;
        }

        .pdf-ai {
          border:
            1px solid #d5c9a8;
          background: #fffaf0;
          padding: 16px;
          border-radius: 8px;
        }

        .pdf-ai .pdf-answer {
          background: #ffffff;
        }

        .pdf-small {
          font-size: 11px;
          color: #66736f;
        }
      </style>

      <article
        class="pdf-group pdf-cover"
      >
        <div class="pdf-cover-top">
          <div class="pdf-program">
            2026 2학년 심화실험 프로그램 · 생명과학
          </div>

          <h1>
            ${REPORT_TITLE}
          </h1>

          <div class="pdf-subtitle">
            학생 작성 보고서 · 활동지 9~13쪽
          </div>

          <table class="pdf-identity">
            <tr>
              <th>학번</th>

              <td>
                ${display(
                  answers.studentNo
                )}
              </td>

              <th>이름</th>

              <td>
                ${display(
                  answers.studentName
                )}
              </td>
            </tr>

            <tr>
              <th>수업 반</th>

              <td>
                ${display(
                  answers.className
                )}
              </td>

              <th>모둠</th>

              <td>
                ${display(
                  answers.groupNo,
                  "-"
                )}

                ${
                  String(
                    answers.groupNo || ""
                  ).trim()
                    ? "모둠"
                    : ""
                }
              </td>
            </tr>
          </table>
        </div>

        <div>
          <div class="pdf-cover-note">
            이 PDF는 학생용 웹앱에 입력한 응답과
            첨부 그래프를 바탕으로 생성되었습니다.
            교사용 스프레드시트에는 작성 시간과
            문항별 입력 기록이 별도로 보관됩니다.
          </div>

          <div class="pdf-meta">
            제출 식별자:
            ${escapeHtml(submissionId)}

            · 앱 버전:
            ${escapeHtml(appVersion)}

            · 생성 시각:
            ${escapeHtml(
              new Date().toLocaleString(
                "ko-KR"
              )
            )}
          </div>
        </div>
      </article>

      ${group(
        "2차 실험 설계",
        "9쪽",
        `
          ${answerBlock(
            "1.",
            "SCD40으로 측정할 수 있는 값을 적어보자.",
            answers.q9_1
          )}

          <section class="pdf-question">
            <div class="pdf-question-title">
              <b>2.</b>
              환경 요인 분류 및
              실험에서 조작 가능한 변인
            </div>

            <table class="pdf-table factor">
              <thead>
                <tr>
                  <th>환경 요인</th>
                  <th>영향 분류</th>
                  <th>조작 가능</th>
                </tr>
              </thead>

              <tbody>
                ${factorRows}
              </tbody>
            </table>
          </section>

          ${answerBlock(
            "3.",
            "환경 요인이 식물의 증산작용에 미치는 영향에 대한 가설",
            answers.q9_3
          )}

          <section class="pdf-question">
            <div class="pdf-question-title">
              <b>4.</b>
              모둠별 실험 조건
            </div>

            <table class="pdf-table">
              <thead>
                <tr>
                  <th>실험</th>
                  <th>조작변인</th>
                  <th>1모둠</th>
                  <th>2모둠</th>
                  <th>3모둠</th>
                  <th>4모둠</th>
                </tr>
              </thead>

              <tbody>
                ${conditionRows}
              </tbody>
            </table>
          </section>

          ${answerBlock(
            "5.",
            "일정하게 유지해야 하는 통제변인",
            answers.q9_5
          )}

          ${answerBlock(
            "6.",
            "어떤 환경 요인이 증산을 촉진했다는 것을 확인하는 방법",
            answers.q9_6
          )}
        `
      )}

      ${group(
        "증산작용 1차 실험 결과",
        "10쪽",
        `
          ${imageBlock(
            imageData.graph1,
            "1차 실험 결과 그래프",
            "필수 그래프가 첨부되지 않음"
          )}

          ${answerBlock(
            "1-①.",
            "습도가 일정하게 증가하는 구간과 2차 실험 계획에 대한 시사점",
            answers.q10_1a
          )}

          ${answerBlock(
            "1-②.",
            "습도 정체 지점, 모둠별 최댓값 비교와 2차 실험 계획에 대한 시사점",
            answers.q10_1b
          )}

          ${answerBlock(
            "1-③.",
            "습도가 더 이상 증가하지 않는 이유",
            answers.q10_1c
          )}

          ${answerBlock(
            "2-①.",
            "수조 안의 CO₂ 변화를 식물 생리학적으로 해석",
            answers.q10_2a
          )}
        `
      )}

      ${group(
        "증산작용 2차 실험 결과",
        "11쪽",
        `
          ${
            imageData.graph2
              ? imageBlock(
                  imageData.graph2,
                  "2차 실험 결과 그래프"
                )
              : ""
          }

          <section class="pdf-question">
            <div class="pdf-question-title">
              <b>1.</b>
              모둠별 실험 결과
            </div>

            <table class="pdf-table result">
              <thead>
                <tr>
                  <th>항목</th>
                  <th>1모둠</th>
                  <th>2모둠</th>
                  <th>3모둠</th>
                  <th>4모둠</th>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <th>1차 · 빛</th>
                  <td>O</td>
                  <td>O</td>
                  <td>O</td>
                  <td>O</td>
                </tr>

                <tr>
                  <th>1차 · 습도</th>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                  <td>-</td>
                </tr>

                ${resultMetricRows
                  .slice(0, 3)
                  .join("")}

                <tr>
                  <th>2차 · 빛</th>
                  <td>O</td>
                  <td>O</td>
                  <td>X</td>
                  <td>X</td>
                </tr>

                <tr>
                  <th>2차 · 습도</th>
                  <td>-</td>
                  <td>고</td>
                  <td>-</td>
                  <td>고</td>
                </tr>

                ${resultMetricRows
                  .slice(3)
                  .join("")}
              </tbody>
            </table>

            <div class="pdf-small">
              초기 습도 증가 기울기:
              습도가 일정하게 증가하는 구간의 기울기
            </div>
          </section>

          <h3 class="pdf-subheading">
            모둠별 결과 해석
          </h3>

          ${answerBlock(
            "1모둠",
            "",
            answers.q11_interpret_g1
          )}

          ${answerBlock(
            "2모둠",
            "",
            answers.q11_interpret_g2
          )}

          ${answerBlock(
            "3모둠",
            "",
            answers.q11_interpret_g3
          )}

          ${answerBlock(
            "4모둠",
            "",
            answers.q11_interpret_g4
          )}

          ${answerBlock(
            "3.",
            "증산작용에 더 큰 영향을 준 요인과 판단 근거가 되는 모둠 비교",
            answers.q11_3
          )}
        `
      )}

      ${group(
        "실험 결과 적용 · 증산작용 조절 이유",
        "12쪽",
        `
          <div class="pdf-source">
            <b>자료 요약</b>
            <br>

            스마트팜 A는 과도한 환기로 습도가 낮아져
            증산이 지나치게 활발해졌고,
            스마트팜 B는 높은 습도로 증산이
            충분히 일어나지 않았다.

            기공 개폐는 CO₂ 흡수와
            수분 손실 사이의 균형을 조절한다.
          </div>

          ${answerBlock(
            "1.",
            "스마트팜 A에서 작물 생장이 나빠진 이유",
            answers.q12_1
          )}

          ${answerBlock(
            "2.",
            "스마트팜 B에서 작물 생장이 나빠진 이유",
            answers.q12_2
          )}

          ${answerBlock(
            "3.",
            "스마트팜에서 환경 조절을 할 때 고려해야 할 점",
            answers.q12_3
          )}
        `
      )}

      ${group(
        "목표 습도 도달 시간 예측",
        "13쪽",
        `
          <section class="pdf-question">
            <div class="pdf-question-title">
              <b>1.</b>
              분석할 시간-습도 데이터 구간
            </div>

            <div class="pdf-inline-grid">
              <div class="pdf-inline-item">
                <b>시작</b>

                ${numberDisplay(
                  answers.q13_range_start,
                  "분"
                )}
              </div>

              <div class="pdf-inline-item">
                <b>끝</b>

                ${numberDisplay(
                  answers.q13_range_end,
                  "분"
                )}
              </div>
            </div>

            <div class="pdf-answer">
              ${display(
                answers.q13_range_reason
              )}
            </div>
          </section>

          <section class="pdf-question">
            <div class="pdf-question-title">
              <b>2.</b>
              우리 모둠의 목표 습도
            </div>

            <div class="pdf-inline-grid">
              <div class="pdf-inline-item">
                <b>목표 습도</b>

                ${numberDisplay(
                  answers.q13_target_humidity,
                  "%"
                )}
              </div>

              <div class="pdf-inline-item">
                <b>현재 또는 시작 습도</b>

                ${numberDisplay(
                  answers.q13_start_humidity,
                  "%"
                )}
              </div>
            </div>

            <div class="pdf-answer">
              ${display(
                answers.q13_target_reason
              )}
            </div>
          </section>

          ${
            imageData.graph3
              ? imageBlock(
                  imageData.graph3,
                  "회귀 그래프 또는 계산 화면"
                )
              : ""
          }

          <section class="pdf-question">
            <div class="pdf-question-title">
              <b>3.</b>
              목표 습도 도달 시간 예측과
              환경 조절 시점
            </div>

            <div class="pdf-inline-grid">
              <div class="pdf-inline-item">
                <b>회귀식</b>

                ${display(
                  answers.q13_regression,
                  "-"
                )}
              </div>

              <div class="pdf-inline-item">
                <b>도달 예상 시간</b>

                ${numberDisplay(
                  answers.q13_predicted_minutes,
                  "분"
                )}
              </div>

              <div class="pdf-inline-item">
                <b>미리 조절할 시간</b>

                ${numberDisplay(
                  answers.q13_control_lead,
                  "분"
                )}
              </div>

              <div class="pdf-inline-item">
                <b>환경 조절 시작 시점</b>

                ${numberDisplay(
                  answers.q13_control_at,
                  "분"
                )}
              </div>
            </div>

            <div class="pdf-answer">
              ${display(
                answers.q13_prediction_reason
              )}
            </div>
          </section>
        `
      )}

      ${group(
        "개별 심화 탐구 및 AI 사용 기록",
        "개인",
        `
          ${answerBlock(
            "주제",
            "",
            answers.inquiryTopic
          )}

          <section class="pdf-question">
            <div class="pdf-question-title">
              <b>탐구 내용</b>
            </div>

            <div class="pdf-answer pdf-inquiry">
              ${display(
                answers.inquiryContent
              )}
            </div>
          </section>

          <section class="pdf-ai">
            <h3 class="pdf-subheading">
              AI 사용 기록
            </h3>

            <div class="pdf-inline-item">
              <b>AI 사용 여부</b>

              ${aiUsedText(
                answers.aiUsed
              )}
            </div>

            ${answerBlock(
              "사용 방법",
              "",
              answers.aiUseDescription
            )}

            ${answerBlock(
              "대화 공유 링크",
              "",
              answers.aiLink
            )}
          </section>

          <div class="pdf-meta">
            활성 작성 시간:
            ${Math.round(
              Number(
                timing &&
                timing.activeSeconds
                  ? timing.activeSeconds
                  : 0
              ) / 60
            )}분

            · 오프라인 작성 시간:
            ${Math.round(
              Number(
                timing &&
                timing.offlineSeconds
                  ? timing.offlineSeconds
                  : 0
              ) / 60
            )}분
          </div>
        `
      )}
    `;

    document.body.appendChild(
      reportRoot
    );

    return reportRoot;
  }

  function waitForImages(root) {
    const images = Array.from(
      root.querySelectorAll("img")
    );

    return Promise.all(
      images.map((image) => {
        if (image.complete) {
          return Promise.resolve();
        }

        return new Promise(
          (resolve) => {
            image.onload = resolve;
            image.onerror = resolve;
          }
        );
      })
    );
  }

  async function createPdf(options) {
    if (
      !window.html2canvas ||
      !window.jspdf ||
      !window.jspdf.jsPDF
    ) {
      throw new Error(
        "PDF 생성 라이브러리를 불러오지 못했습니다. 인터넷에 연결한 뒤 앱을 새로고침해 주세요."
      );
    }

    const root =
      await buildReportElement(
        options
      );

    const jsPDF =
      window.jspdf.jsPDF;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true
    });

    let hasPage = false;

    try {
      await waitForImages(root);

      if (
        document.fonts &&
        document.fonts.ready
      ) {
        await document.fonts.ready;
      }

      const groups = Array.from(
        root.querySelectorAll(
          ".pdf-group"
        )
      );

      for (
        let groupIndex = 0;
        groupIndex < groups.length;
        groupIndex += 1
      ) {
        const groupElement =
          groups[groupIndex];

        const groupTitle =
          groupElement
            .querySelector("h2")
            ?.textContent ||
          "보고서";

        if (
          typeof options.onProgress ===
          "function"
        ) {
          options.onProgress({
            current: groupIndex + 1,
            total: groups.length,
            label: groupTitle
          });
        }

        const canvas =
          await window.html2canvas(
            groupElement,
            {
              backgroundColor:
                "#ffffff",

              scale: RENDER_SCALE,

              useCORS: true,

              logging: false,

              width:
                RENDER_WIDTH_PX,

              windowWidth:
                RENDER_WIDTH_PX,

              scrollX: 0,

              scrollY: 0
            }
          );

        const pagePixelHeight =
          Math.max(
            1,
            Math.floor(
              canvas.width *
              A4_HEIGHT_MM /
              A4_WIDTH_MM
            )
          );

        const slightlyTooTall =
          canvas.height >
            pagePixelHeight &&
          canvas.height <=
            pagePixelHeight * 1.18;

        if (slightlyTooTall) {
          const pageCanvas =
            document.createElement(
              "canvas"
            );

          pageCanvas.width =
            canvas.width;

          pageCanvas.height =
            pagePixelHeight;

          const context =
            pageCanvas.getContext(
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
            pageCanvas.width,
            pageCanvas.height
          );

          const fitScale =
            pagePixelHeight /
            canvas.height;

          const drawWidth =
            Math.floor(
              canvas.width *
              fitScale
            );

          const offsetX =
            Math.floor(
              (
                pageCanvas.width -
                drawWidth
              ) / 2
            );

          context.drawImage(
            canvas,
            0,
            0,
            canvas.width,
            canvas.height,
            offsetX,
            0,
            drawWidth,
            pagePixelHeight
          );

          if (hasPage) {
            doc.addPage();
          }

          doc.addImage(
            pageCanvas.toDataURL(
              "image/jpeg",
              JPEG_QUALITY
            ),
            "JPEG",
            0,
            0,
            A4_WIDTH_MM,
            A4_HEIGHT_MM,
            undefined,
            "FAST"
          );

          hasPage = true;
        } else {
          for (
            let offsetY = 0;
            offsetY < canvas.height;
            offsetY += pagePixelHeight
          ) {
            const segmentHeight =
              Math.min(
                pagePixelHeight,
                canvas.height -
                  offsetY
              );

            const pageCanvas =
              document.createElement(
                "canvas"
              );

            pageCanvas.width =
              canvas.width;

            pageCanvas.height =
              pagePixelHeight;

            const context =
              pageCanvas.getContext(
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
              pageCanvas.width,
              pageCanvas.height
            );

            context.drawImage(
              canvas,
              0,
              offsetY,
              canvas.width,
              segmentHeight,
              0,
              0,
              canvas.width,
              segmentHeight
            );

            if (hasPage) {
              doc.addPage();
            }

            doc.addImage(
              pageCanvas.toDataURL(
                "image/jpeg",
                JPEG_QUALITY
              ),
              "JPEG",
              0,
              0,
              A4_WIDTH_MM,
              A4_HEIGHT_MM,
              undefined,
              "FAST"
            );

            hasPage = true;
          }
        }
      }

      const pageCount =
        doc.getNumberOfPages();

      for (
        let pageNo = 1;
        pageNo <= pageCount;
        pageNo += 1
      ) {
        doc.setPage(pageNo);

        doc.setFillColor(
          255,
          255,
          255
        );

        doc.rect(
          178,
          288,
          26,
          6,
          "F"
        );

        doc.setTextColor(
          95,
          105,
          102
        );

        doc.setFontSize(8);

        doc.text(
          `${pageNo} / ${pageCount}`,
          201,
          292,
          {
            align: "right"
          }
        );
      }

      doc.setProperties({
        title: REPORT_TITLE,

        subject:
          "2026 2학년 심화실험 생명과학 학생 보고서",

        author:
          `${
            options.answers
              ?.studentNo || ""
          } ${
            options.answers
              ?.studentName || ""
          }`.trim(),

        creator:
          `증산 속도 분석 보고서 웹앱 ${
            options.appVersion || ""
          }`
      });

      const blob =
        doc.output("blob");

      const fileName =
        safeFileName(
          `${
            options.answers
              ?.studentNo ||
            "학번없음"
          }_${
            options.answers
              ?.studentName ||
            "이름없음"
          }_증산속도분석보고서.pdf`
        );

      return {
        blob: blob,

        name: fileName,

        type:
          "application/pdf",

        size: blob.size,

        hash:
          await hashBlob(blob),

        pageCount: pageCount,

        createdAt:
          new Date().toISOString()
      };
    } finally {
      root.remove();
    }
  }

  function downloadPdf(pdf) {
    const url =
      URL.createObjectURL(
        pdf.blob
      );

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download = pdf.name;
    anchor.rel = "noopener";

    document.body.appendChild(
      anchor
    );

    anchor.click();
    anchor.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  }

  window.ReportPdf =
    Object.freeze({
      create: createPdf,
      download: downloadPdf
    });
})();
