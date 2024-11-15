// proxy_worker.js 

let config = {
  enabled: true,
  poisonTracking: true,
  injectNoise: true,
  sanitizeHeaders: true,
  randomizeIdentifiers: true,
  sessionId: generateSessionId(),
  poisoningInterval: 5000  // How often to refresh poisoned data
};

let stats = {
  requestCount: 0,
  trackingCount: 0,
  poisonedCount: 0,
  pingCount: 0,
  poisonedAttributes: 0,  // New counter for attribute poisoning
  sessionStart: Date.now()
};

// Load any existing stats first
chrome.storage.local.get('proxyStats', (result) => {
  if (result.proxyStats) {
    stats = { 
      ...result.proxyStats,
      sessionStart: stats.sessionStart
    };
  } else {
    chrome.storage.local.set({ proxyStats: stats });
  }
});

// Known tracking parameters and endpoints
const TRACKING_PARAMS = [
  'ved', 'ei', 'sourceid', 'gs_lcp', 'oq', 'aqs', 'sclient', 
  'gws_rd', 'dpr', 'gs_gi', 'gs_mss', 'gs_rn', 'gs_lcp',
  'uact', 'cd', 'cad', 'usg', 'sig', 'feid', 'vet', 'sa',
  'bih', 'biw', 'gbv', 'source', 'pbx', 'kgs', 'ludocid'
];

const TRACKING_ENDPOINTS = [
  '/gen_204',
  '/log',
  '/webchannel',
  '/complete/search',
  '/_/vissearch',
  '/clientlog',
  '/_/NonExistentDomain'
];

function updateBadge() {
  const totalCount = stats.requestCount + 
  stats.trackingCount + 
  stats.poisonedCount + 
  stats.pingCount;
  
  chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });
  
  let badgeText = totalCount.toString();
  if (totalCount > 999) {
    badgeText = `${Math.floor(totalCount/1000)}k`;
  }
  
  // Update badge text
  chrome.action.setBadgeText({ 
    text: config.enabled ? badgeText : ''
  });
  
  // Simple tooltip with total count
  chrome.action.setTitle({ 
    title: `Surveillance Attempts Blocked: ${totalCount.toLocaleString()}`
  });
}

function syncStats() {
  console.log('[GoogleGuard] Syncing stats:', stats);
  chrome.storage.local.set({ proxyStats: stats })
  .then(() => {
    chrome.runtime.sendMessage({
      type: 'statsUpdate',
      stats: {
        requestCount: stats.requestCount,
        trackingCount: stats.trackingCount,
        poisonedCount: stats.poisonedCount,
        poisonedAttributes: stats.poisonedAttributes,  // New stat
        pingCount: stats.pingCount,
        sessionStart: stats.sessionStart
      }
    }).catch((error) => {
      console.debug('[GoogleGuard] No popup available for stats update:', error);
    });
  })
  .catch(error => {
    console.error('[GoogleGuard] Error syncing stats:', error);
  });
}

// Service Worker setup
self.addEventListener('install', event => {
  console.log('[GoogleGuard] Service worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[GoogleGuard] Service worker activating...');
  event.waitUntil((async () => {
    await clients.claim();
    await initializePrivacyRules();
    console.log('[GoogleGuard] Service worker activated and claiming clients');
  })());
});

function logRequestDetails(request) {
  console.log('[GoogleGuard] Request details:', {
    url: request.url,
    method: request.method,
    type: request.type,
    destination: request.destination,
    mode: request.mode,
    headers: Object.fromEntries([...request.headers.entries()])
  });
}

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message, 'from sender:', sender);
  
  if (message.type === "getActiveTabId") {
    if (sender?.tab?.id) {
      console.log('Using sender tab ID:', sender.tab.id);
      sendResponse({ tabId: sender.tab.id });
      return true;
    }
    
    if (message.url) {
      chrome.tabs.query({ 
        url: "*://*.google.com/*",
        active: true,
        currentWindow: true
      }, (tabs) => {
        if (tabs?.length > 0) {
          console.log('Found matching tab:', tabs[0].id);
          sendResponse({ tabId: tabs[0].id });
        } else {
          chrome.tabs.query({ url: "*://*.google.com/*" }, (allTabs) => {
            if (allTabs?.length > 0) {
              console.log('Found tab by URL match:', allTabs[0].id);
              sendResponse({ tabId: allTabs[0].id });
            } else {
              console.error('No matching tab found');
              sendResponse({ error: 'No matching tab found' });
            }
          });
        }
      });
      return true;
    }
  }
  
  if (message.type === 'resetStats') {
    stats = {
      requestCount: 0,
      trackingCount: 0,
      poisonedCount: 0,
      pingCount: 0,
      sessionStart: Date.now()
    };
    chrome.storage.local.set({ proxyStats: stats })
    .then(() => {
      sendResponse({ success: true });
    })
    .catch(error => {
      console.error('Error resetting stats:', error);
      sendResponse({ error: error.message });
    });
    return true;
  }
  
  if (['interceptStorage', 'interceptNavigator', 'injectProtection'].includes(message.type)) {
    const tabId = message.tabId || (sender?.tab?.id);
    
    if (!tabId || typeof tabId !== 'number') {
      console.error('Invalid or missing tabId. Message:', message, 'Sender:', sender);
      sendResponse({ error: 'Invalid or missing tabId' });
      return;
    }
    
    console.log(`Executing ${message.type} script in tab ${tabId}`);
    
    const injection = {
      target: { tabId: tabId },
      files: [`content/${message.type === 'interceptStorage' ? 'interceptStorageAPIs.js' : 
        message.type === 'interceptNavigator' ? 'interceptNavigatorAPIs.js' : 
        'injectProtectionScript.js'}`]
    };
    
    chrome.scripting.executeScript(injection)
    .then(() => {
      console.log(`Successfully injected script for ${message.type} in tab ${tabId}`);
      sendResponse({ success: true });
    })
    .catch((error) => {
      console.error(`Failed to inject script for ${message.type}:`, error);
      sendResponse({ error: error.message });
    });
    
    return true;
  }
  
  if (message.type === 'dataPoisoned') {
    stats.poisonedCount++;
    stats.poisonedAttributes++;
    console.log('[GoogleGuard] Data point poisoned. New count:', stats.poisonedCount);
    syncStats();
    return true;
  }
  
  if (message.type === 'updateConfig') {
    config = { ...config, ...message.config };
    console.log('Updated proxy configuration:', config);
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'getStats') {
    sendResponse({
      requestCount: stats.requestCount,
      trackingCount: stats.trackingCount,
      poisonedCount: stats.poisonedCount,
      pingCount: stats.pingCount,
      sessionStart: stats.sessionStart,
      enabled: config.enabled
    });
    return true;
  }
  
  if (message.type === 'pingBlocked') {
    stats.pingCount += (message.count || 1);  // Increment ping count
    console.log('[GoogleGuard] Updated ping count:', stats.pingCount);
    syncStats();  // Sync updated stats
    return true;
  }
  
  if (message.type === 'trackingBlocked') {
    stats.trackingCount++;
    console.log('[GoogleGuard] Tracking attempt blocked. New count:', stats.trackingCount);
    syncStats();
    return true;
  }
  
  if (message.type === 'dataPoisoned') {
    stats.poisonedCount++;
    console.log('[GoogleGuard] Data point poisoned. New count:', stats.poisonedCount);
    syncStats();
    return true;
  }
  
  if (message.type === 'requestProtected') {
    stats.requestCount++;
    console.log('[GoogleGuard] Request protected. New count:', stats.requestCount);
    syncStats();
    return true;
  }
});

// Continuing proxy_worker.js - Part 2

async function initializePrivacyRules() {
  console.log('[GoogleGuard] Setting up declarative blocking rules');
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1, 2, 3, 4, 5],
    addRules: [
      {
        id: 1,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: '*/gen_204',
          domains: ['google.com'],
          resourceTypes: ['ping', 'xmlhttprequest']  // Only block non-HTML
        }
      },
      {
        id: 2,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: '*/log?',
          domains: ['google.com'],
          resourceTypes: ['ping', 'xmlhttprequest']  // Only block non-HTML
        }
      },
      {
        id: 3,
        priority: 1,
        action: { type: 'allow' },  // Explicitly allow main_frame
        condition: {
          urlFilter: '*',
          domains: ['google.com'],
          resourceTypes: ['main_frame', 'sub_frame']
        }
      }
    ]
  });
  console.log('[GoogleGuard] Declarative rules setup complete');
}

if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(
    (info) => {
      console.log('[GoogleGuard] Declarative rule matched:', {
        rule: info.rule,
        request: info.request,
        type: info.request.type
      });
      
      // Always increment request counter for any intercepted request
      stats.requestCount++;
      
      // Check if this is a ping request
      if (info.request.type === 'ping') {
        stats.pingCount++;
        console.log('[GoogleGuard] Ping blocked. New count:', stats.pingCount);
      } else {
        // Existing tracking count increment
        stats.trackingCount++;
      }
      syncStats();
    }
  );
}

// Main request interception
self.addEventListener('fetch', event => {
  // Add detailed logging
  console.log('[GoogleGuard] Fetch event received:', {
    url: event.request.url,
    method: event.request.method,
    type: event.request.type,
    destination: event.request.destination,
    mode: event.request.mode,
    headers: [...event.request.headers.entries()]
  });
  
  if (!config.enabled) {
    return;
  }
  
  const url = new URL(event.request.url);
  
  if (!url.hostname.includes('google')) {
    console.log('[GoogleGuard] Skipping non-Google domain:', url.hostname);
    return;
  }
  
  // Check if this is a navigation request (HTML content)
  if (event.request.mode === 'navigate' || 
    event.request.destination === 'document' || 
    (event.request.headers.get('accept') || '').includes('text/html')) {
      
      console.log('[GoogleGuard] Processing navigation/HTML request:', url.toString());
      
      event.respondWith((async () => {
        try {
          const modifiedRequest = await sanitizeRequest(event.request);
          const response = await fetch(modifiedRequest);
          
          console.log('[GoogleGuard] Received response:', {
            url: url.toString(),
            type: response.headers.get('content-type'),
            status: response.status
          });
          
          // Only process HTML responses
          if (response.headers.get('content-type')?.includes('text/html')) {
            console.log('[GoogleGuard] Found HTML response, processing...');
            const body = await response.text();
            let cleanBody = body
            .replace(/<script[^>]*google-analytics\.com[^>]*>[^<]*<\/script>/gi, '')
            .replace(/<script[^>]*googletagmanager\.com[^>]*>[^<]*<\/script>/gi, '')
            .replace(/<script[^>]*google_tag_data[^>]*>[^<]*<\/script>/gi, '')
            .replace(/ping="[^"]*"/gi, '')
            .replace(/onclick="[^"]*"/gi, '')
            .replace(/onmousedown="[^"]*"/gi, '')
            .replace(/data-ved="[^"]*"/gi, '')
            .replace(/data-ei="[^"]*"/gi, '')
            .replace(/data-s="[^"]*"/gi, '');
            
            if (config.poisonTracking) {
              console.log('[GoogleGuard] Attempting to inject fake data');
              try {
                cleanBody = injectFakeData(cleanBody);
                stats.poisonedCount++;
                syncStats();
                console.log('[GoogleGuard] Successfully injected fake data');
              } catch (error) {
                console.error('[GoogleGuard] Error injecting fake data:', error);
              }
            }
            
            if (config.randomizeIdentifiers) {
              cleanBody = cleanBody
              .replace(/"csi":"[^"]*"/g, `"csi":"${Date.now()}"`)
              .replace(/"ei":"[^"]*"/g, `"ei":"${Math.random().toString(36).substring(2)}"`)
              .replace(/"zx":"[^"]*"/g, `"zx":"${Math.random().toString(36).substring(2)}"`)
              .replace(/"rid":"[^"]*"/g, `"rid":"${Math.random().toString(36).substring(2)}"`)
              .replace(/"client":"[^"]*"/g, `"client":"${generateRandomClient()}"`)
              .replace(/"sessionId":"[^"]*"/g, `"sessionId":"${config.sessionId}"`);
            }
            
            console.log('[GoogleGuard] Returning modified HTML response');
            return new Response(cleanBody, {
              status: response.status,
              statusText: response.statusText,
              headers: sanitizeHeaders(response.headers)
            });
          }
          
          return response;
        } catch (error) {
          console.error('[GoogleGuard] Error processing request:', error);
          return fetch(event.request);
        }
      })());
    }
});

function shouldBlockRequest(url) {
  if (!config.enabled) return false;
  
  if (TRACKING_ENDPOINTS.some(endpoint => url.pathname.includes(endpoint))) {
    console.log(`[GoogleGuard] Blocking known tracking endpoint: ${url.pathname}`);
    return true;
  }
  
  if (url.searchParams.has('ping') || 
    url.searchParams.has('pf') || 
    url.searchParams.has('atyp') || 
    url.searchParams.has('ved') || 
    url.searchParams.has('ei')) {
      console.log(`[GoogleGuard] Blocking request with tracking parameter: ${url.toString()}`);
      return true;
    }
  
  const trackingDomains = [
    'www.google-analytics.com',
    'ssl.google-analytics.com',
    'doubleclick.net',
    'googleadservices.com',
    'googlesyndication.com'
  ];
  
  if (trackingDomains.some(domain => url.hostname.includes(domain))) {
    console.log(`[GoogleGuard] Blocking request to tracking domain: ${url.hostname}`);
    return true;
  }
  
  return false;
}

async function handleRequest(request) {
  try {
    console.log('[GoogleGuard] Request details:', {
      url: request.url,
      type: request.type,
      destination: request.destination,
      mode: request.mode
    });
    
    // Only process if poisoning is enabled
    if (config.poisonTracking) {
      stats.poisonedAttributes++;
      syncStats();
    }
    
    let modifiedRequest = await sanitizeRequest(request);
    let response = await fetch(modifiedRequest);
    
    console.log('[GoogleGuard] Response details:', {
      url: request.url,
      type: response.type,
      status: response.status,
      contentType: response.headers.get('content-type')
    });
    
    if (response.headers.get('content-type')?.includes('text/html')) {
      console.log('[GoogleGuard] Processing HTML response');
      const body = await response.text();
      let cleanBody = body
      .replace(/<script[^>]*google-analytics\.com[^>]*>[^<]*<\/script>/gi, '')
      .replace(/<script[^>]*googletagmanager\.com[^>]*>[^<]*<\/script>/gi, '')
      .replace(/<script[^>]*google_tag_data[^>]*>[^<]*<\/script>/gi, '')
      .replace(/ping="[^"]*"/gi, '')
      .replace(/onclick="[^"]*"/gi, '')
      .replace(/onmousedown="[^"]*"/gi, '')
      .replace(/data-ved="[^"]*"/gi, '')
      .replace(/data-ei="[^"]*"/gi, '')
      .replace(/data-s="[^"]*"/gi, '');
      
      if (config.poisonTracking) {
        console.log('[GoogleGuard] Attempting to inject fake data');
        try {
          const poisonedBody = injectFakeData(cleanBody);
          if (poisonedBody !== cleanBody) {
            cleanBody = poisonedBody;
            stats.poisonedCount++;
            syncStats();
            console.log('[GoogleGuard] Successfully injected fake data');
          } else {
            console.log('[GoogleGuard] No changes made during fake data injection');
          }
        } catch (error) {
          console.error('[GoogleGuard] Error injecting fake data:', error);
        }
      }
      
      if (config.randomizeIdentifiers) {
        cleanBody = cleanBody
        .replace(/"csi":"[^"]*"/g, `"csi":"${Date.now()}"`)
        .replace(/"ei":"[^"]*"/g, `"ei":"${Math.random().toString(36).substring(2)}"`)
        .replace(/"zx":"[^"]*"/g, `"zx":"${Math.random().toString(36).substring(2)}"`)
        .replace(/"rid":"[^"]*"/g, `"rid":"${Math.random().toString(36).substring(2)}"`)
        .replace(/"client":"[^"]*"/g, `"client":"${generateRandomClient()}"`)
        .replace(/"sessionId":"[^"]*"/g, `"sessionId":"${config.sessionId}"`);
      }
      
      return new Response(cleanBody, {
        status: response.status,
        statusText: response.statusText,
        headers: sanitizeHeaders(response.headers)
      });
    }
    
    console.log('[GoogleGuard] Skipping non-HTML response:', response.headers.get('content-type'));
    return response;
  } catch (error) {
    console.error('[GoogleGuard] Error in handleRequest:', error);
    throw error;
  }
}

function injectFakeData(html) {
  console.log('[GoogleGuard] Starting fake data injection');
  
  const fakeDataScript = `
    (function() {
      console.log('[GoogleGuard] Executing injected script');
      
      window.__userBehavior = {
        clicks: Array.from({length: Math.floor(Math.random() * 8) + 3}, () => ({
          x: Math.floor(Math.random() * 1000),
          y: Math.floor(Math.random() * 800),
          timestamp: Date.now() - Math.floor(Math.random() * 30000),
          type: ['left', 'left', 'left', 'right'][Math.floor(Math.random() * 4)]
        })),
        scrolls: Array.from({length: Math.floor(Math.random() * 15) + 5}, () => ({
          position: Math.floor(Math.random() * 3000),
          timestamp: Date.now() - Math.floor(Math.random() * 60000),
          speed: Math.floor(Math.random() * 100) + 20
        })),
        timing: {
          pageLoadTime: Math.floor(Math.random() * 1000) + 500,
          domContentLoaded: Math.floor(Math.random() * 300) + 200,
          firstPaint: Math.floor(Math.random() * 200) + 100
        }
      };

      console.log('[GoogleGuard] Injected fake behavioral data:', window.__userBehavior);
    })();
  `;
  
  console.log('[GoogleGuard] Preparing to inject script into HTML');
  const injectedHtml = html.replace('</head>', `<script>${fakeDataScript}</script></head>`);
  console.log('[GoogleGuard] Script injection completed');
  
  return injectedHtml;
}

function verifyPoisoning() {
  return `
    console.log('[GoogleGuard] Verifying data poisoning...');
    if (window.__userBehavior) {
      console.log('[GoogleGuard] Fake behavioral data injected:', window.__userBehavior);
      return true;
    }
    return false;
  `;
}

function sanitizeHeaders(headers) {
  const clean = new Headers(headers);
  
  ['set-cookie', 'etag', 'last-modified', 'x-client-data', 
    'x-frame-options', 'clear-site-data'].forEach(header => {
      clean.delete(header);
    });
  
  clean.set('Content-Security-Policy', generateCSP());
  clean.set('X-Content-Type-Options', 'nosniff');
  clean.set('Referrer-Policy', 'no-referrer');
  
  return clean;
}

async function sanitizeRequest(request) {
  const url = new URL(request.url);
  TRACKING_PARAMS.forEach(param => url.searchParams.delete(param));
  
  if (config.injectNoise) {
    url.searchParams.append('_noise', Math.random().toString(36).substring(7));
  }
  
  const headers = new Headers(request.headers);
  ['cookie', 'x-client-data', 'referer'].forEach(header => {
    headers.delete(header);
  });
  
  headers.set('DNT', '1');
  headers.set('Sec-GPC', '1');
  
  return new Request(url.toString(), {
    method: request.method,
    headers: headers,
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'follow'
  });
}

function generateCSP() {
  return [
    "default-src 'self' *.google.com",
    "script-src 'self' 'unsafe-inline' *.google.com",
    "style-src 'self' 'unsafe-inline' *.google.com",
    "img-src 'self' * data: blob:",
    "connect-src 'self' *.google.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'"
  ].join('; ');
}

function generateRandomClient() {
  const clients = ['firefox', 'opera', 'safari', 'chrome'];
  return clients[Math.floor(Math.random() * clients.length)];
}

function generateSessionId() {
  return Math.random().toString(36).substring(2, 15);
}

function generateRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}


// Set up periodic stats sync
setInterval(syncStats, 5000);

// Load initial configuration
chrome.storage.local.get('proxyConfig', (result) => {
  if (result.proxyConfig) {
    config = { ...config, ...result.proxyConfig };
  }
});

// Initialize badge on worker startup
chrome.storage.local.get(['proxyStats', 'proxyConfig'], (result) => {
  if (result.proxyStats) {
    stats = { ...stats, ...result.proxyStats };
  }
  if (result.proxyConfig) {
    config = { ...config, ...result.proxyConfig };
  }
  updateBadge();
});
