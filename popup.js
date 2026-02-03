// DOM Elements
const walletInput = document.getElementById('walletInput');
const trackBtn = document.getElementById('trackBtn');
const walletDisplay = document.getElementById('walletDisplay');
const currentStreakEl = document.getElementById('currentStreak');
const longestStreakEl = document.getElementById('longestStreak');
const totalDaysEl = document.getElementById('totalDays');
const onBaseSinceEl = document.getElementById('onBaseSince');
const streakStatus = document.getElementById('streakStatus');
const flameIcon = document.getElementById('flameIcon');
const heatmapEl = document.getElementById('heatmap');
const countdownSection = document.getElementById('countdownSection');
const countdownTimer = document.getElementById('countdownTimer');
const refreshBtn = document.getElementById('refreshBtn');
const shareBtn = document.getElementById('shareBtn');
const notifyToggle = document.getElementById('notifyToggle');
const shareModal = document.getElementById('shareModal');
const shareCanvas = document.getElementById('shareCanvas');
const copyImageBtn = document.getElementById('copyImageBtn');
const downloadBtn = document.getElementById('downloadBtn');
const closeModalBtn = document.getElementById('closeModalBtn');

let currentStreakData = null;
let countdownInterval = null;

// Initialize
async function init() {
  // Load saved settings
  const stored = await chrome.storage.local.get([
    'walletAddress', 
    'streakData', 
    'notificationsEnabled'
  ]);
  
  if (stored.walletAddress) {
    walletInput.value = stored.walletAddress;
    walletDisplay.textContent = `Tracking: ${shortenAddress(stored.walletAddress)}`;
  }
  
  if (stored.streakData) {
    currentStreakData = stored.streakData;
    updateUI(stored.streakData);
  }
  
  notifyToggle.checked = stored.notificationsEnabled || false;
  
  // Start countdown timer
  startCountdown();
}

// Shorten address for display
function shortenAddress(address) {
  if (address.length > 20) {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  }
  return address;
}

// Format date for display
function formatDate(dateStr) {
  if (!dateStr) return '---';
  const date = new Date(dateStr);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 
                  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

// Update UI with streak data
function updateUI(data) {
  if (!data) return;
  
  // Update streak number
  currentStreakEl.textContent = data.currentStreak;
  currentStreakEl.className = data.currentStreak === 0 ? 'streak-number zero' : 'streak-number';
  
  // Update flame
  if (data.currentStreak === 0) {
    flameIcon.classList.add('inactive');
    flameIcon.textContent = '💀';
  } else if (data.currentStreak >= 30) {
    flameIcon.classList.remove('inactive');
    flameIcon.textContent = '🔥';
  } else if (data.currentStreak >= 7) {
    flameIcon.classList.remove('inactive');
    flameIcon.textContent = '🔥';
  } else {
    flameIcon.classList.remove('inactive');
    flameIcon.textContent = '🔥';
  }
  
  // Update status
  if (data.todayActive) {
    streakStatus.className = 'streak-status active';
    streakStatus.innerHTML = '<span class="status-icon">✓</span><span class="status-text">TODAY COMPLETE!</span>';
    countdownSection.classList.add('safe');
  } else if (data.currentStreak > 0) {
    streakStatus.className = 'streak-status warning';
    streakStatus.innerHTML = '<span class="status-icon">⚠️</span><span class="status-text">MAKE A TX TODAY!</span>';
    countdownSection.classList.remove('safe');
  } else {
    streakStatus.className = 'streak-status';
    streakStatus.innerHTML = '<span class="status-icon">💤</span><span class="status-text">START YOUR STREAK!</span>';
    countdownSection.classList.remove('safe');
  }
  
  // Update stats
  longestStreakEl.textContent = data.longestStreak;
  totalDaysEl.textContent = data.totalDays;
  onBaseSinceEl.textContent = formatDate(data.firstTxDate);
  
  // Update heatmap
  renderHeatmap(data.activityMap);
}

// Render activity heatmap
function renderHeatmap(activityMap) {
  heatmapEl.innerHTML = '';
  
  if (!activityMap) return;
  
  const today = new Date().toISOString().split('T')[0];
  const dates = Object.keys(activityMap).sort();
  
  dates.forEach(dateStr => {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    
    const count = activityMap[dateStr];
    
    // Determine level based on activity count
    let level = 0;
    if (count >= 10) level = 4;
    else if (count >= 5) level = 3;
    else if (count >= 2) level = 2;
    else if (count >= 1) level = 1;
    
    cell.classList.add(`level-${level}`);
    
    // Mark today
    if (dateStr === today) {
      cell.classList.add('today');
    }
    
    // Tooltip
    cell.title = `${dateStr}: ${count} tx${count !== 1 ? 's' : ''}`;
    
    heatmapEl.appendChild(cell);
  });
}

// Start countdown timer to midnight UTC
function startCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
  }
  
  function updateCountdown() {
    const now = new Date();
    const utcNow = new Date(now.toUTCString());
    
    // Midnight UTC tomorrow
    const midnight = new Date(utcNow);
    midnight.setUTCDate(midnight.getUTCDate() + 1);
    midnight.setUTCHours(0, 0, 0, 0);
    
    const diff = midnight - utcNow;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    countdownTimer.textContent = 
      `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  
  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
}

// Track wallet
async function trackWallet() {
  const address = walletInput.value.trim();
  
  if (!address) {
    walletDisplay.textContent = 'Please enter a wallet address';
    return;
  }
  
  // Basic validation
  if (!address.startsWith('0x') || address.length !== 42) {
    walletDisplay.textContent = 'Invalid address format';
    return;
  }
  
  trackBtn.textContent = 'LOADING...';
  trackBtn.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'updateStreak',
      address: address
    });
    
    if (response.success && response.data) {
      currentStreakData = response.data;
      updateUI(response.data);
      walletDisplay.textContent = `Tracking: ${shortenAddress(address)}`;
      
      // Save notification preference
      await chrome.storage.local.set({ 
        notificationsEnabled: notifyToggle.checked 
      });
    } else {
      walletDisplay.textContent = 'Error fetching data';
    }
  } catch (error) {
    console.error('Error:', error);
    walletDisplay.textContent = 'Error connecting to API';
  }
  
  trackBtn.textContent = 'TRACK';
  trackBtn.disabled = false;
}

// Refresh data
async function refreshData() {
  refreshBtn.textContent = '↻ LOADING...';
  refreshBtn.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({ action: 'updateStreak' });
    
    if (response.success && response.data) {
      currentStreakData = response.data;
      updateUI(response.data);
    }
  } catch (error) {
    console.error('Refresh error:', error);
  }
  
  refreshBtn.textContent = '↻ REFRESH';
  refreshBtn.disabled = false;
}

// Generate share image
function generateShareImage() {
  const ctx = shareCanvas.getContext('2d');
  const width = 600;
  const height = 400;
  
  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, width, height);
  
  // Border
  ctx.strokeStyle = '#0052FF';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, width - 20, height - 20);
  
  // Inner glow
  ctx.strokeStyle = 'rgba(0, 82, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, width - 40, height - 40);
  
  // Title
  ctx.font = 'bold 24px "Press Start 2P", monospace';
  ctx.fillStyle = '#00D4FF';
  ctx.textAlign = 'center';
  ctx.fillText('BASE STREAK', width / 2, 70);
  
  // Streak number
  ctx.font = 'bold 80px "VT323", monospace';
  ctx.fillStyle = '#FFD700';
  ctx.shadowColor = '#FF6B00';
  ctx.shadowBlur = 20;
  ctx.fillText(currentStreakData?.currentStreak || '0', width / 2, 180);
  ctx.shadowBlur = 0;
  
  // Day streak label
  ctx.font = '16px "Press Start 2P", monospace';
  ctx.fillStyle = '#FFD700';
  ctx.fillText('DAY STREAK 🔥', width / 2, 220);
  
  // Stats
  ctx.font = '12px "Press Start 2P", monospace';
  ctx.fillStyle = '#888';
  
  const stats = [
    `BEST: ${currentStreakData?.longestStreak || 0}`,
    `TOTAL DAYS: ${currentStreakData?.totalDays || 0}`,
    `SINCE: ${formatDate(currentStreakData?.firstTxDate)}`
  ];
  
  stats.forEach((stat, i) => {
    ctx.fillText(stat, width / 2, 280 + (i * 30));
  });
  
  // Footer
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.fillStyle = '#0052FF';
  ctx.fillText('POWERED BY BASE', width / 2, 380);
  
  // Scanlines effect
  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  for (let y = 0; y < height; y += 4) {
    ctx.fillRect(0, y, width, 2);
  }
}

// Copy image to clipboard
async function copyImage() {
  try {
    const blob = await new Promise(resolve => shareCanvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
    copyImageBtn.textContent = '✓ COPIED!';
    setTimeout(() => {
      copyImageBtn.textContent = '📋 COPY IMAGE';
    }, 2000);
  } catch (error) {
    console.error('Copy failed:', error);
    copyImageBtn.textContent = '✗ FAILED';
    setTimeout(() => {
      copyImageBtn.textContent = '📋 COPY IMAGE';
    }, 2000);
  }
}

// Download image
function downloadImage() {
  const link = document.createElement('a');
  link.download = `base-streak-${currentStreakData?.currentStreak || 0}-days.png`;
  link.href = shareCanvas.toDataURL('image/png');
  link.click();
}

// Event Listeners
trackBtn.addEventListener('click', trackWallet);

walletInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    trackWallet();
  }
});

refreshBtn.addEventListener('click', refreshData);

shareBtn.addEventListener('click', () => {
  generateShareImage();
  shareModal.classList.add('active');
});

closeModalBtn.addEventListener('click', () => {
  shareModal.classList.remove('active');
});

copyImageBtn.addEventListener('click', copyImage);
downloadBtn.addEventListener('click', downloadImage);

notifyToggle.addEventListener('change', async () => {
  await chrome.storage.local.set({ 
    notificationsEnabled: notifyToggle.checked 
  });
});

// Close modal on outside click
shareModal.addEventListener('click', (e) => {
  if (e.target === shareModal) {
    shareModal.classList.remove('active');
  }
});

// Initialize
init();
