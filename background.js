// BaseScan API (free, no key needed for basic endpoints)
const BASESCAN_API = 'https://api.basescan.org/api';

// Check interval (every 30 minutes)
const CHECK_INTERVAL = 30;

// Get transactions for an address
async function getTransactions(address) {
  try {
    const url = `${BASESCAN_API}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === '1' && data.result) {
      return data.result;
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch transactions:', error);
    return [];
  }
}

// Get internal transactions (for contract interactions)
async function getInternalTransactions(address) {
  try {
    const url = `${BASESCAN_API}?module=account&action=txlistinternal&address=${address}&startblock=0&endblock=99999999&sort=desc`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === '1' && data.result) {
      return data.result;
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch internal transactions:', error);
    return [];
  }
}

// Get ERC20 token transfers
async function getTokenTransfers(address) {
  try {
    const url = `${BASESCAN_API}?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&sort=desc`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === '1' && data.result) {
      return data.result;
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch token transfers:', error);
    return [];
  }
}

// Convert timestamp to UTC date string (YYYY-MM-DD)
function timestampToDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toISOString().split('T')[0];
}

// Get today's date in UTC
function getTodayUTC() {
  return new Date().toISOString().split('T')[0];
}

// Calculate streak data from transactions
function calculateStreakData(transactions) {
  if (!transactions || transactions.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalDays: 0,
      activityMap: {},
      todayActive: false,
      firstTxDate: null,
      lastTxDate: null
    };
  }

  // Get unique active days
  const activeDays = new Set();
  transactions.forEach(tx => {
    const date = timestampToDate(parseInt(tx.timeStamp));
    activeDays.add(date);
  });

  // Sort dates
  const sortedDates = Array.from(activeDays).sort();
  const today = getTodayUTC();
  const todayActive = activeDays.has(today);

  // Build activity map for heatmap (last 90 days)
  const activityMap = {};
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  for (let d = new Date(ninetyDaysAgo); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    activityMap[dateStr] = activeDays.has(dateStr) ? 1 : 0;
  }

  // Count transactions per day for intensity
  transactions.forEach(tx => {
    const date = timestampToDate(parseInt(tx.timeStamp));
    if (activityMap[date] !== undefined) {
      activityMap[date]++;
    }
  });

  // Calculate current streak
  let currentStreak = 0;
  let checkDate = new Date();
  
  // If not active today, start checking from yesterday
  if (!todayActive) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0];
    if (activeDays.has(dateStr)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Calculate longest streak
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate = null;

  sortedDates.forEach(dateStr => {
    const currentDate = new Date(dateStr);
    
    if (prevDate) {
      const diffDays = Math.round((currentDate - prevDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    } else {
      tempStreak = 1;
    }
    
    prevDate = currentDate;
  });
  longestStreak = Math.max(longestStreak, tempStreak);

  return {
    currentStreak,
    longestStreak,
    totalDays: activeDays.size,
    activityMap,
    todayActive,
    firstTxDate: sortedDates[0] || null,
    lastTxDate: sortedDates[sortedDates.length - 1] || null
  };
}

// Update streak data for a wallet
async function updateStreakData(address) {
  if (!address) {
    const stored = await chrome.storage.local.get(['walletAddress']);
    address = stored.walletAddress;
  }
  
  if (!address) {
    return null;
  }

  // Fetch all transaction types
  const [txs, internalTxs, tokenTxs] = await Promise.all([
    getTransactions(address),
    getInternalTransactions(address),
    getTokenTransfers(address)
  ]);

  // Combine all transactions
  const allTxs = [...txs, ...internalTxs, ...tokenTxs];
  
  // Calculate streak data
  const streakData = calculateStreakData(allTxs);
  
  // Store the data
  await chrome.storage.local.set({
    streakData,
    lastUpdate: Date.now(),
    walletAddress: address
  });

  // Update badge
  updateBadge(streakData);

  // Check for streak warning
  checkStreakWarning(streakData);

  return streakData;
}

// Update the toolbar badge
function updateBadge(streakData) {
  const streak = streakData?.currentStreak || 0;
  
  chrome.action.setBadgeText({ text: streak > 0 ? `${streak}` : '' });
  
  if (streak >= 30) {
    chrome.action.setBadgeBackgroundColor({ color: '#FFD700' }); // Gold
  } else if (streak >= 7) {
    chrome.action.setBadgeBackgroundColor({ color: '#00FF41' }); // Green
  } else if (streak > 0) {
    chrome.action.setBadgeBackgroundColor({ color: '#0052FF' }); // Base blue
  }
}

// Check if user needs streak warning
async function checkStreakWarning(streakData) {
  const settings = await chrome.storage.local.get(['notificationsEnabled']);
  
  if (!settings.notificationsEnabled) return;
  
  if (streakData.currentStreak > 0 && !streakData.todayActive) {
    // Get current hour
    const hour = new Date().getHours();
    
    // Only warn in evening (after 6 PM)
    if (hour >= 18) {
      const lastWarning = await chrome.storage.local.get(['lastWarningDate']);
      const today = getTodayUTC();
      
      if (lastWarning.lastWarningDate !== today) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '🔥 Streak Warning!',
          message: `Your ${streakData.currentStreak} day streak is about to break! Make a transaction on Base to keep it alive.`,
          priority: 2
        });
        
        await chrome.storage.local.set({ lastWarningDate: today });
      }
    }
  }
}

// Setup alarm for periodic checking
chrome.alarms.create('checkStreak', { periodInMinutes: CHECK_INTERVAL });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkStreak') {
    updateStreakData();
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateStreak') {
    updateStreakData(message.address).then(data => {
      sendResponse({ success: true, data });
    });
    return true;
  }
  
  if (message.action === 'getStreakData') {
    chrome.storage.local.get(['streakData', 'lastUpdate', 'walletAddress']).then(data => {
      sendResponse(data);
    });
    return true;
  }
});

// Initial check on install
chrome.runtime.onInstalled.addListener(() => {
  updateStreakData();
});
