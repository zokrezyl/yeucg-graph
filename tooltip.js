// tooltip.js
// Tooltip creation and display functions

var tooltipDiv = null;

function ensureTooltipDiv() {
  if (tooltipDiv) return;
  tooltipDiv = document.createElement('div');
  tooltipDiv.id = 'vis-tooltip';
  Object.assign(tooltipDiv.style, {
    position: 'fixed',
    zIndex: 1001,
    maxWidth: '300px',
    whiteSpace: 'pre',
    background: 'rgba(255,255,255,0.9)',
    border: '1px solid #999',
    borderRadius: '4px',
    padding: '4px 6px',
    fontSize: '0.75em',
    fontFamily: 'monospace',
    pointerEvents: 'none',
    display: 'none'
  });
  document.body.appendChild(tooltipDiv);
}

function showTooltip(text, x, y) {
  if (!tooltipDiv) return;
  tooltipDiv.textContent = text;
  tooltipDiv.style.left = (x + 8) + 'px';
  var yPos = y - 12;
  tooltipDiv.style.top = (yPos < 0 ? 4 : yPos) + 'px';
  tooltipDiv.style.display = 'block';
}

function hideTooltip() {
  if (tooltipDiv) tooltipDiv.style.display = 'none';
}
