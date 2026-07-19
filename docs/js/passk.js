// ============================================================================
//  passk.js — the wrap-up interactive: slide k, watch pass@k and pass^k
//  tell opposite stories.
// ============================================================================

export function mountPassK(root) {
  const kInput = root.querySelector('.js-passk-k');
  const pInput = root.querySelector('.js-passk-p');
  const kOut   = root.querySelector('.js-passk-k-out');
  const pOut   = root.querySelector('.js-passk-p-out');
  const passAt = root.querySelector('.js-passk-at');
  const passHat = root.querySelector('.js-passk-hat');
  const callout = root.querySelector('.js-passk-callout');
  const canvas = root.querySelector('.js-passk-canvas');

  function render() {
    const k = Number(kInput.value);
    const p = Number(pInput.value);
    kOut.textContent = k;
    pOut.textContent = p.toFixed(2);
    const at  = 1 - Math.pow(1 - p, k);
    const hat = Math.pow(p, k);
    passAt.textContent  = (at  * 100).toFixed(1) + '%';
    passHat.textContent = (hat * 100).toFixed(1) + '%';
    callout.textContent = calloutFor(k, p, at, hat);
    drawChart(canvas, p, k);
  }

  [kInput, pInput].forEach(i => i.addEventListener('input', render));
  render();
}

function calloutFor(k, p, at, hat) {
  if (k === 1) return `At k=1 the two are equal — both ${(p * 100).toFixed(0)}%. As k grows they'll diverge.`;
  if (k >= 8 && at - hat > 0.5) return `At k=${k} with p=${p.toFixed(2)}, pass@k = ${(at*100).toFixed(1)}% but pass^k = ${(hat*100).toFixed(1)}%. Opposite stories from the same runs.`;
  return `pass@k rises with k (any success counts). pass^k falls with k (all must succeed). Which one you use depends on whether one right answer is enough.`;
}

function drawChart(canvas, p, currentK) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { top: 20, right: 20, bottom: 34, left: 40 };
  const w = cssW - pad.left - pad.right;
  const h = cssH - pad.top - pad.bottom;

  // Axes
  ctx.strokeStyle = '#dddbda';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + h);
  ctx.lineTo(pad.left + w, pad.top + h);
  ctx.stroke();

  // Y gridlines at 0, 0.25, 0.5, 0.75, 1
  ctx.strokeStyle = '#f3f3f3';
  ctx.fillStyle = '#514f4d';
  ctx.font = '11px "Salesforce Sans", system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let y = 0; y <= 1.0001; y += 0.25) {
    const py = pad.top + h - y * h;
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(pad.left + w, py);
    ctx.stroke();
    ctx.fillText((y * 100).toFixed(0) + '%', pad.left - 6, py);
  }

  // X ticks at k=1..10
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const kMax = 10;
  for (let k = 1; k <= kMax; k++) {
    const px = pad.left + ((k - 1) / (kMax - 1)) * w;
    ctx.fillText(String(k), px, pad.top + h + 6);
  }

  const kToX = k => pad.left + ((k - 1) / (kMax - 1)) * w;
  const vToY = v => pad.top + h - v * h;

  // pass@k curve (rising)
  ctx.strokeStyle = '#0176d3';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let k = 1; k <= kMax; k++) {
    const v = 1 - Math.pow(1 - p, k);
    const x = kToX(k), y = vToY(v);
    if (k === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // pass^k curve (falling)
  ctx.strokeStyle = '#ba0517';
  ctx.beginPath();
  for (let k = 1; k <= kMax; k++) {
    const v = Math.pow(p, k);
    const x = kToX(k), y = vToY(v);
    if (k === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Current-k markers
  const cx = kToX(currentK);
  const atV = 1 - Math.pow(1 - p, currentK);
  const hatV = Math.pow(p, currentK);
  ctx.fillStyle = '#0176d3';
  ctx.beginPath(); ctx.arc(cx, vToY(atV), 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ba0517';
  ctx.beginPath(); ctx.arc(cx, vToY(hatV), 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c9c7c5';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(cx, pad.top);
  ctx.lineTo(cx, pad.top + h);
  ctx.stroke();
  ctx.setLineDash([]);

  // Legend
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '600 12px "Salesforce Sans", system-ui, sans-serif';
  ctx.fillStyle = '#0176d3';
  ctx.fillRect(pad.left + w - 130, pad.top + 4, 12, 3);
  ctx.fillText('pass@k', pad.left + w - 114, pad.top + 5);
  ctx.fillStyle = '#ba0517';
  ctx.fillRect(pad.left + w - 60, pad.top + 4, 12, 3);
  ctx.fillText('pass^k', pad.left + w - 44, pad.top + 5);
}
