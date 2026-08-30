const themes = new Set(["dark", "light"]);
const tones = new Set(["neutral", "signal", "healthy", "warning", "danger"]);

const palettes = {
  dark: {
    brand: "#f4f7f6",
    body: "#c3ccca",
    calloutBackground: "#0b0f0f",
    calloutBorder: "#ffffff",
    headline: "#f8faf9",
    line: "#dbe5e2",
  },
  light: {
    brand: "#101514",
    body: "#47514f",
    calloutBackground: "#f8faf9",
    calloutBorder: "#101514",
    headline: "#101514",
    line: "#2e3b38",
  },
};

const toneColors = {
  danger: "#ef6a66",
  healthy: "#5fc68d",
  neutral: "#9aa6a3",
  signal: "#6fc9c4",
  warning: "#efac66",
};

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const isNumberInRange = (value, minimum, maximum) =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;

const checkPoint = (point, canvas, label, failures) => {
  if (!isRecord(point) || ![point.x, point.y].every(isNonNegativeInteger)) {
    failures.push(`${label} must contain non-negative integer x and y coordinates`);
    return;
  }
  if (point.x > canvas.width || point.y > canvas.height) {
    failures.push(`${label} must stay inside the canvas`);
  }
};

const checkText = (value, label, failures, maximumLength) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    failures.push(`${label} must be a non-empty string`);
  } else if (value.length > maximumLength) {
    failures.push(`${label} must contain at most ${maximumLength} characters`);
  }
};

export const validateEditorial = (editorial, canvas, label, failures) => {
  if (editorial === undefined) return;
  if (!isRecord(editorial)) {
    failures.push(`${label}.editorial must be an object`);
    return;
  }
  if (!themes.has(editorial.theme)) failures.push(`${label}.editorial.theme is not supported`);

  if (editorial.brand !== undefined) {
    const brandLabel = `${label}.editorial.brand`;
    if (!isRecord(editorial.brand)) {
      failures.push(`${brandLabel} must be an object`);
    } else {
      checkPoint(editorial.brand, canvas, brandLabel, failures);
      checkText(editorial.brand.label, `${brandLabel}.label`, failures, 24);
    }
  }

  if (editorial.headline !== undefined) {
    const headlineLabel = `${label}.editorial.headline`;
    const headline = editorial.headline;
    if (!isRecord(headline)) {
      failures.push(`${headlineLabel} must be an object`);
    } else {
      checkPoint(headline, canvas, headlineLabel, failures);
      if (
        !Array.isArray(headline.lines) ||
        headline.lines.length < 1 ||
        headline.lines.length > 2
      ) {
        failures.push(`${headlineLabel}.lines must contain one or two strings`);
      } else {
        headline.lines.forEach((line, index) =>
          checkText(line, `${headlineLabel}.lines[${index}]`, failures, 72),
        );
      }
      if (!isNumberInRange(headline.size, 30, 88)) {
        failures.push(`${headlineLabel}.size must be between 30 and 88`);
      }
      if (headline.subtitle !== undefined) {
        checkText(headline.subtitle, `${headlineLabel}.subtitle`, failures, 140);
      }
    }
  }

  if (editorial.callouts !== undefined) {
    if (!Array.isArray(editorial.callouts)) {
      failures.push(`${label}.editorial.callouts must be an array`);
    } else {
      if (editorial.callouts.length > 6) {
        failures.push(`${label}.editorial.callouts must contain at most six items`);
      }
      editorial.callouts.forEach((callout, index) => {
        const calloutLabel = `${label}.editorial.callouts[${index}]`;
        if (!isRecord(callout)) {
          failures.push(`${calloutLabel} must be an object`);
          return;
        }
        checkPoint(callout, canvas, calloutLabel, failures);
        if (!isPositiveInteger(callout.width)) {
          failures.push(`${calloutLabel}.width must be a positive integer`);
        }
        const height = callout.detail ? 88 : 64;
        if (callout.x + callout.width > canvas.width || callout.y + height > canvas.height) {
          failures.push(`${calloutLabel} must stay inside the canvas`);
        }
        checkText(callout.title, `${calloutLabel}.title`, failures, 36);
        if (callout.detail !== undefined) {
          checkText(callout.detail, `${calloutLabel}.detail`, failures, 48);
        }
        if (!tones.has(callout.tone)) failures.push(`${calloutLabel}.tone is not supported`);
        if (callout.anchor !== undefined) {
          checkPoint(callout.anchor, canvas, `${calloutLabel}.anchor`, failures);
        }
      });
    }
  }
};

const escapeXml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const brandMarkup = (brand, palette) => {
  if (!brand) return "";
  const markX = brand.x;
  const markY = brand.y;
  return `<g>
    <rect x="${markX}" y="${markY}" width="34" height="34" rx="10" fill="${palette.brand}" fill-opacity="0.1" stroke="${palette.brand}" stroke-opacity="0.28"/>
    <path d="M${markX + 8} ${markY + 22} L${markX + 14} ${markY + 16} L${markX + 20} ${markY + 19} L${markX + 26} ${markY + 11}" fill="none" stroke="${palette.brand}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${markX + 26}" cy="${markY + 11}" r="2.5" fill="#6fc9c4"/>
    <text x="${markX + 48}" y="${markY + 24}" class="brand">${escapeXml(brand.label)}</text>
  </g>`;
};

const headlineMarkup = (headline, palette) => {
  if (!headline) return "";
  const lineHeight = Math.round(headline.size * 1.02);
  const lines = headline.lines
    .map(
      (line, index) =>
        `<text x="${headline.x}" y="${headline.y + headline.size + index * lineHeight}" class="headline" font-size="${headline.size}">${escapeXml(line)}</text>`,
    )
    .join("");
  const subtitleY = headline.y + headline.lines.length * lineHeight + headline.size + 8;
  const subtitle = headline.subtitle
    ? `<text x="${headline.x}" y="${subtitleY}" class="body">${escapeXml(headline.subtitle)}</text>`
    : "";
  return `<g fill="${palette.headline}">${lines}${subtitle}</g>`;
};

const anchorMarkup = (callout, palette) => {
  if (!callout.anchor) return "";
  const height = callout.detail ? 88 : 64;
  const startX = Math.min(
    Math.max(callout.anchor.x, callout.x + 18),
    callout.x + callout.width - 18,
  );
  const startY = callout.anchor.y < callout.y ? callout.y : callout.y + height;
  const color = toneColors[callout.tone];
  return `<g>
    <path d="M${startX} ${startY} L${callout.anchor.x} ${callout.anchor.y}" fill="none" stroke="${palette.line}" stroke-opacity="0.48" stroke-width="1.5" stroke-dasharray="5 7"/>
    <circle cx="${callout.anchor.x}" cy="${callout.anchor.y}" r="7" fill="${color}" fill-opacity="0.18"/>
    <circle cx="${callout.anchor.x}" cy="${callout.anchor.y}" r="3" fill="${color}"/>
  </g>`;
};

const calloutMarkup = (callout, palette) => {
  const height = callout.detail ? 88 : 64;
  const color = toneColors[callout.tone];
  const detail = callout.detail
    ? `<text x="${callout.x + 22}" y="${callout.y + 59}" class="detail">${escapeXml(callout.detail)}</text>`
    : "";
  return `${anchorMarkup(callout, palette)}<g filter="url(#cardShadow)">
    <rect x="${callout.x}" y="${callout.y}" width="${callout.width}" height="${height}" rx="16" fill="${palette.calloutBackground}" fill-opacity="0.92" stroke="${palette.calloutBorder}" stroke-opacity="0.16"/>
    <rect x="${callout.x}" y="${callout.y + 16}" width="3" height="${height - 32}" rx="1.5" fill="${color}"/>
    <text x="${callout.x + 22}" y="${callout.y + (callout.detail ? 34 : 40)}" class="callout">${escapeXml(callout.title)}</text>
    ${detail}
  </g>`;
};

export const renderEditorial = (canvas, editorial) => {
  if (!editorial) return undefined;
  const palette = palettes[editorial.theme];
  const callouts =
    editorial.callouts?.map((callout) => calloutMarkup(callout, palette)).join("") ?? "";
  return Buffer.from(`<svg width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="cardShadow" x="-30%" y="-40%" width="160%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#020505" flood-opacity="0.24"/></filter>
      <style>
        text { font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .brand { fill: ${palette.brand}; font-size: 21px; font-weight: 600; letter-spacing: -0.2px; }
        .headline { fill: ${palette.headline}; font-weight: 600; letter-spacing: -1.8px; }
        .body { fill: ${palette.body}; font-size: 22px; font-weight: 450; letter-spacing: -0.2px; }
        .callout { fill: ${palette.headline}; font-size: 21px; font-weight: 600; letter-spacing: -0.2px; }
        .detail { fill: ${palette.body}; font-size: 16px; font-weight: 450; }
      </style>
    </defs>
    ${brandMarkup(editorial.brand, palette)}
    ${headlineMarkup(editorial.headline, palette)}
    ${callouts}
  </svg>`);
};
