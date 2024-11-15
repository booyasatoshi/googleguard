// Unified configuration and stats management
let config = {
    enabled: true,
    poisonTracking: true,
    injectNoise: true,
    sanitizeHeaders: true,
    randomizeIdentifiers: true
};

let stats = {
    requestCount: 0,
    trackingCount: 0,
    poisonedCount: 0,
    poisonedAttributes: 0,
    pingCount: 0,
    sessionStart: Date.now()
};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Popup initialized');
    await initializePopup();
});

async function initializePopup() {
    try {
        await loadStoredData();
        setupEventListeners();
        startPeriodicUpdates();
        updateUI();
    } catch (error) {
        console.error('Error initializing popup:', error);
        showStatusMessage('Error initializing extension', 'error');
    }
}

async function loadStoredData() {
    const result = await chrome.storage.local.get(['proxyConfig', 'proxyStats']);
    if (result.proxyConfig) {
        config = { ...config, ...result.proxyConfig };
    }
    if (result.proxyStats) {
        stats = { 
            ...result.proxyStats,
            sessionStart: stats.sessionStart 
        };
    }
}

function setupEventListeners() {
    // Main toggle
    const mainToggle = document.querySelector('.main-toggle input[type="checkbox"]');
    if (mainToggle) {
        mainToggle.addEventListener('change', handleMainToggle);
    }
    
    // Protection settings
    ['poisonTracking', 'injectNoise', 'sanitizeHeaders', 'randomizeIdentifiers'].forEach(setting => {
        const toggle = document.getElementById(setting);
        if (toggle) {
            toggle.addEventListener('change', (e) => handleSettingToggle(setting, e.target.checked));
        }
    });
    
    // Advanced options
    setupAdvancedOptions();
}

function setupAdvancedOptions() {
    // Reset stats button
    const resetButton = document.querySelector('.advanced-grid button:first-child');
    if (resetButton) {
        resetButton.addEventListener('click', showResetModal);
    }
    
    // Export report button
    const exportButton = document.querySelector('.advanced-grid button:last-child');
    if (exportButton) {
        exportButton.addEventListener('click', exportReport);
    }
    
    // Reset modal buttons
    const confirmReset = document.querySelector('.modal-buttons button:first-child');
    const cancelReset = document.querySelector('.modal-buttons button:last-child');
    if (confirmReset) {
        confirmReset.addEventListener('click', handleStatsReset);
    }
    if (cancelReset) {
        cancelReset.addEventListener('click', hideResetModal);
    }
}

async function handleMainToggle(event) {
    try {
        config.enabled = event.target.checked;
        await updateConfig();
        updateUI();
        
        chrome.runtime.sendMessage({
            type: 'updateConfig',
            config: { enabled: config.enabled }
        });
        
        showStatusMessage(
            config.enabled ? 'Protection enabled' : 'Protection disabled',
            config.enabled ? 'success' : 'warning'
        );
    } catch (error) {
        console.error('Error updating main toggle:', error);
        showStatusMessage('Failed to update protection status', 'error');
    }
}

async function handleSettingToggle(setting, value) {
    try {
        config[setting] = value;
        await updateConfig();
        
        chrome.runtime.sendMessage({
            type: 'updateConfig',
            config: { [setting]: value }
        });
        
        showStatusMessage(
            `${formatSettingName(setting)} ${value ? 'enabled' : 'disabled'}`,
            'success'
        );
    } catch (error) {
        console.error(`Error updating ${setting}:`, error);
        showStatusMessage(`Failed to update ${formatSettingName(setting)}`, 'error');
    }
}

async function handleStatsReset() {
    try {
        stats = {
            requestCount: 0,
            trackingCount: 0,
            poisonedCount: 0,
            poisonedAttributes: 0,
            pingCount: 0,
            sessionStart: Date.now()
        };
        
        await chrome.storage.local.set({ proxyStats: stats });
        chrome.runtime.sendMessage({ type: 'resetStats' });
        
        updateUI();
        hideResetModal();
        showStatusMessage('Statistics reset successfully', 'success');
    } catch (error) {
        console.error('Error resetting stats:', error);
        showStatusMessage('Failed to reset statistics', 'error');
    }
}

function updateUI() {
    // Update toggle states
    document.querySelector('.main-toggle input[type="checkbox"]').checked = config.enabled;
    ['poisonTracking', 'injectNoise', 'sanitizeHeaders', 'randomizeIdentifiers'].forEach(setting => {
        const toggle = document.getElementById(setting);
        if (toggle) {
            toggle.checked = config[setting];
        }
    });
    
    // Update statistics
    updateStats(stats);
    
    // Update status indicator
    updateStatusIndicator();
}

function updateStats(stats) {
    if (!stats) return;
    
    const elements = {
        requestCount: document.getElementById('requestCount'),
        trackingCount: document.getElementById('trackingCount'),
        pingCount: document.getElementById('pingCount'),
        poisonedCount: document.getElementById('poisonedCount'),
        poisonedAttributes: document.getElementById('poisonedAttributes')
    };
    
    Object.entries(elements).forEach(([key, element]) => {
        if (element && stats[key] !== undefined) {
            element.textContent = stats[key].toLocaleString();
        }
    });
}

function updateStatusIndicator() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    
    if (statusDot && statusText) {
        if (config.enabled) {
            statusDot.classList.add('active');
            statusText.textContent = 'Protected';
        } else {
            statusDot.classList.remove('active');
            statusText.textContent = 'Unprotected';
        }
    }
}

async function updateConfig() {
    await chrome.storage.local.set({ proxyConfig: config });
}

function startPeriodicUpdates() {
    // Update stats every second
    setInterval(() => {
        chrome.runtime.sendMessage({ type: 'getStats' }, (response) => {
            if (response) {
                updateStats(response);
            }
        });
    }, 1000);
}

function exportReport() {
    const report = {
        timestamp: new Date().toISOString(),
        config: config,
        statistics: stats,
        sessionDuration: Math.floor((Date.now() - stats.sessionStart) / 1000)
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `privacy-report-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showStatusMessage('Report exported successfully', 'success');
}

function showResetModal() {
    const modal = document.getElementById('resetModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function hideResetModal() {
    const modal = document.getElementById('resetModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function showStatusMessage(message, type = 'success') {
    const statusElement = document.getElementById('statusMessage');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = 'status-message';
        statusElement.classList.add(type);
        
        setTimeout(() => {
            statusElement.className = 'status-message';
        }, 3000);
    }
}

function formatSettingName(setting) {
    return setting
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase());
}

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'statsUpdate' && message.stats) {
        stats = { ...stats, ...message.stats };
        updateStats(stats);
    }
});


