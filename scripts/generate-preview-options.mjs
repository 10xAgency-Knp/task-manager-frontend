import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = 'C:/Users/pc/.gemini/antigravity/brain/776b3a29-6e7c-4243-9ebc-62bf5f57eafa';

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const logoBuffer = fs.readFileSync('C:/Users/pc/Desktop/JayantBackup/Task Manger/tms-front-end/public/assets/img/logo.png');
const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;

const baseCss = `
  :root {
    --bg: #f5f7fb; --surface: #fff; --surface2: #fbfcfe; --border: #e2e8f3; --border2: #eef2f9;
    --text: #0d1b34; --text2: #4a5875; --muted: #8894ac;
    --navy: #0b3d91; --navyDark: #082a63; --navySoft: #e8eefc;
    --green: #5aa236; --amber: #e0a13a; --amberSoft: #fdf3e2;
    --red: #d94b4b; --redSoft: #fdeaea; --greySoft: #eef1f7;
    --shadow: 0 1px 2px rgba(11,61,145,.05), 0 8px 24px -12px rgba(11,61,145,.18);
    --r: 14px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
    background: linear-gradient(150deg, #06204d, #0b3d91 55%, #5aa236 165%);
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 30px 16px;
    color: var(--text);
  }
  .error-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 20px;
    box-shadow: 0 40px 80px -24px rgba(4, 14, 40, .7);
    max-width: 520px;
    width: 100%;
    padding: 38px 32px 34px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .login-logo-plate {
    background: #fff;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 18px;
    max-width: 210px;
    margin: 0 auto 24px;
    border: 1px solid var(--border2);
  }
  .login-logo {
    height: 38px;
    width: auto;
    display: block;
  }
  .error-badge {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 14px;
    border-radius: 20px;
    font-size: 11.5px;
    font-weight: 750;
    letter-spacing: .6px;
    text-transform: uppercase;
    background: var(--greySoft);
    color: var(--text2);
    border: 1px solid var(--border);
    margin-bottom: 18px;
  }
  .error-badge svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
  }
  .error-icon-plate {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: inline-grid;
    place-items: center;
    background: var(--greySoft);
    color: var(--text2);
    margin-bottom: 16px;
  }
  .error-icon-plate svg {
    width: 34px;
    height: 34px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
  }
  .error-title {
    font-size: 21px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 9px;
    letter-spacing: -.3px;
  }
  .error-desc {
    font-size: 13.4px;
    color: var(--text2);
    line-height: 1.6;
    max-width: 440px;
    margin: 0 auto 22px;
  }
  .error-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8.5px 15px;
    border-radius: 10px;
    font-size: 13.1px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .btn svg {
    width: 15px;
    height: 15px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
  }
  .btn-primary {
    background: var(--navy);
    color: #fff;
    box-shadow: 0 8px 18px -10px rgba(11,61,145,.95);
  }
  .btn-ghost {
    background: #fff;
    border-color: var(--border);
    color: var(--text2);
  }
  .preview-label-tag {
    position: absolute;
    top: 20px;
    left: 20px;
    background: rgba(255, 255, 255, 0.95);
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 750;
    color: var(--navy);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
`;

const serverIconSvg = `
  <svg viewBox="0 0 24 24">
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
    <circle cx="6" cy="6" r="1"/>
    <circle cx="6" cy="18" r="1"/>
  </svg>
`;

const refreshIconSvg = `
  <svg viewBox="0 0 24 24">
    <path d="M21 12a9 9 0 11-3-6.7"/>
    <path d="M21 3v6h-6"/>
  </svg>
`;

const dashIconSvg = `
  <svg viewBox="0 0 24 24">
    <path d="M3 13h8V3H3v10zm10 8h8V11h-8v10zM3 21h8v-6H3v6zm10-12h8V3h-8v6z"/>
  </svg>
`;

const options = [
  {
    id: 'option1',
    label: 'Option 1: Centered Vertical Stack (Icon on Top)',
    html: `
      <!DOCTYPE html>
      <html>
      <head><style>${baseCss}</style></head>
      <body>
        <div class="preview-label-tag">Option 1: Icon Centered on Top (Vertical Stack)</div>
        <div class="error-card">
          <div class="login-logo-plate">
            <img class="login-logo" src="${logoBase64}" alt="10X Agency" />
          </div>

          <div class="error-icon-plate">
            ${serverIconSvg}
          </div>

          <div class="error-badge">
            <span>503 &bull; SERVICE UNAVAILABLE</span>
          </div>

          <h1 class="error-title">Service Temporarily Unavailable</h1>
          <p class="error-desc">The Task Manager service is temporarily unreachable or undergoing scheduled maintenance. Please wait a moment and try again.</p>

          <div class="error-actions">
            <button class="btn btn-primary">${refreshIconSvg} Retry Connection</button>
            <button class="btn btn-ghost">${dashIconSvg} Reload App</button>
          </div>
        </div>
      </body>
      </html>
    `
  },
  {
    id: 'option2',
    label: 'Option 2: Icon Inside Badge (No Big Circle)',
    html: `
      <!DOCTYPE html>
      <html>
      <head><style>${baseCss}</style></head>
      <body>
        <div class="preview-label-tag">Option 2: Icon Inside the Badge Pill (Compact & Modern)</div>
        <div class="error-card">
          <div class="login-logo-plate">
            <img class="login-logo" src="${logoBase64}" alt="10X Agency" />
          </div>

          <div class="error-badge">
            ${serverIconSvg}
            <span>503 &bull; SERVICE UNAVAILABLE</span>
          </div>

          <h1 class="error-title">Service Temporarily Unavailable</h1>
          <p class="error-desc">The Task Manager service is temporarily unreachable or undergoing scheduled maintenance. Please wait a moment and try again.</p>

          <div class="error-actions">
            <button class="btn btn-primary">${refreshIconSvg} Retry Connection</button>
            <button class="btn btn-ghost">${dashIconSvg} Reload App</button>
          </div>
        </div>
      </body>
      </html>
    `
  },
  {
    id: 'option3',
    label: 'Option 3: Icon Below Title',
    html: `
      <!DOCTYPE html>
      <html>
      <head><style>${baseCss}</style></head>
      <body>
        <div class="preview-label-tag">Option 3: Icon Placed Below the Title ("Down")</div>
        <div class="error-card">
          <div class="login-logo-plate">
            <img class="login-logo" src="${logoBase64}" alt="10X Agency" />
          </div>

          <div class="error-badge">
            <span>503 &bull; SERVICE UNAVAILABLE</span>
          </div>

          <h1 class="error-title">Service Temporarily Unavailable</h1>

          <div class="error-icon-plate" style="margin: 10px 0 18px 0;">
            ${serverIconSvg}
          </div>

          <p class="error-desc">The Task Manager service is temporarily unreachable or undergoing scheduled maintenance. Please wait a moment and try again.</p>

          <div class="error-actions">
            <button class="btn btn-primary">${refreshIconSvg} Retry Connection</button>
            <button class="btn btn-ghost">${dashIconSvg} Reload App</button>
          </div>
        </div>
      </body>
      </html>
    `
  },
  {
    id: 'option4',
    label: 'Option 4: Icon Removed Completely',
    html: `
      <!DOCTYPE html>
      <html>
      <head><style>${baseCss}</style></head>
      <body>
        <div class="preview-label-tag">Option 4: Icon Removed Completely (Pure Minimalist)</div>
        <div class="error-card">
          <div class="login-logo-plate">
            <img class="login-logo" src="${logoBase64}" alt="10X Agency" />
          </div>

          <div class="error-badge">
            <span>503 &bull; SERVICE UNAVAILABLE</span>
          </div>

          <h1 class="error-title">Service Temporarily Unavailable</h1>
          <p class="error-desc">The Task Manager service is temporarily unreachable or undergoing scheduled maintenance. Please wait a moment and try again.</p>

          <div class="error-actions">
            <button class="btn btn-primary">${refreshIconSvg} Retry Connection</button>
            <button class="btn btn-ghost">${dashIconSvg} Reload App</button>
          </div>
        </div>
      </body>
      </html>
    `
  }
];

async function generate() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1200,800']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 750, deviceScaleFactor: 2 });

  for (const opt of options) {
    await page.setContent(opt.html, { waitUntil: 'load' });
    const outPath = path.join(OUTPUT_DIR, `${opt.id}.png`);
    await page.screenshot({ path: outPath });
    console.log(`Generated: ${outPath}`);
  }

  await browser.close();
  console.log("All previews generated successfully!");
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
