let config = {
    enabled: true,
    poisonTracking: true,
    injectNoise: true,
    sanitizeHeaders: true,
    randomizeIdentifiers: true
};

// Initialize as soon as possible
(async function initialize() {
    await loadConfig();
    if (config.enabled) {
        setupPrivacyProtection();
    }
})();

// Load configuration from storage
async function loadConfig() {
    try {
        const result = await chrome.storage.local.get('proxyConfig');
        if (result.proxyConfig) {
            config = { ...config, ...result.proxyConfig };
        }
    } catch (error) {
        console.error('Error loading configuration:', error);
    }
}

// Set up main privacy protection features
function setupPrivacyProtection() {
    // Run before DOM is ready
    preventEarlyTracking();
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeProtections);
    } else {
        initializeProtections();
    }
    
    // Set up mutation observer for dynamic content
    setupMutationObserver();
}

function preventEarlyTracking() {
    chrome.runtime.sendMessage({ 
        type: "getActiveTabId",
        url: window.location.href 
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Error getting active tab:', chrome.runtime.lastError.message);
            return;
        }
        
        if (response && response.tabId) {
            const tabId = response.tabId;
            
            Promise.resolve()
            .then(() => {
                console.log('Injecting storage protection for tab:', tabId);
                return new Promise((resolve) => {
                    interceptStorageAPIs(tabId);
                    resolve();
                });
            })
            .then(() => {
                console.log('Injecting navigator protection for tab:', tabId);
                return new Promise((resolve) => {
                    interceptNavigatorAPIs(tabId);
                    resolve();
                });
            })
            .then(() => {
                console.log('Injecting main protection for tab:', tabId);
                return new Promise((resolve) => {
                    injectProtectionScript(tabId);
                    resolve();
                });
            })
            .catch(error => {
                console.error('Error during protection injection:', error);
            });
        } else {
            console.error('No valid tabId received from background script');
        }
    });
}

function interceptStorageAPIs(tabId) {
    chrome.runtime.sendMessage({ 
        type: 'interceptStorage',
        tabId: tabId 
    }, response => {
        if (chrome.runtime.lastError) {
            console.error('Error sending interceptStorage message:', chrome.runtime.lastError.message);
        }
    });
}

function interceptNavigatorAPIs(tabId) {
    chrome.runtime.sendMessage({ 
        type: 'interceptNavigator',
        tabId: tabId 
    }, response => {
        if (chrome.runtime.lastError) {
            console.error('Error sending interceptNavigator message:', chrome.runtime.lastError.message);
        }
    });
}

function injectProtectionScript(tabId) {
    chrome.runtime.sendMessage({ 
        type: 'injectProtection',
        tabId: tabId 
    }, response => {
        if (chrome.runtime.lastError) {
            console.error('Error sending injectProtection message:', chrome.runtime.lastError.message);
        }
    });
}

function initializeProtections() {
    removeTrackingElements();
    cleanNode(document.body);
    injectProtectionScript();
    setupEventCleaning();
}

function setupMutationObserver() {
    const observerConfig = {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['ping', 'onmousedown', 'href']
    };
    
    console.log('[GoogleGuard] Setting up MutationObserver');
    
    const observer = new MutationObserver((mutations) => {
        if (!config.enabled) return;
        
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        cleanNode(node);
                    }
                });
            } else if (mutation.type === 'attributes') {
                console.log('[GoogleGuard] Attribute mutation detected:', {
                    type: mutation.attributeName,
                    element: mutation.target.tagName,
                    oldValue: mutation.oldValue,
                    newValue: mutation.target.getAttribute(mutation.attributeName)
                });
                cleanNode(mutation.target);
            }
        }
    });
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[GoogleGuard] DOM loaded, starting observer');
            observer.observe(document.body, observerConfig);
            initialClean();
        });
    } else {
        console.log('[GoogleGuard] DOM already loaded, starting observer');
        observer.observe(document.body, observerConfig);
        initialClean();
    }
}

function cleanNode(node) {
    if (!node || !node.removeAttribute) return;
    
    // Clean all tracking attributes
    const trackingAttrs = ['ping', 'onclick', 'onmousedown', 'data-ved', 'data-ei', 'data-s', 'data-cid'];
    trackingAttrs.forEach(attr => {
        if (node.hasAttribute(attr)) {
            const attrValue = node.getAttribute(attr);
            console.log(`[GoogleGuard] Removed ${attr} attribute:`, {
                element: node.tagName,
                value: attrValue,
                url: node.href || 'no href',
                text: node.textContent?.trim()
            });
            
            // Send specific message for ping blocks
            if (attr === 'ping') {
                chrome.runtime.sendMessage({
                    type: 'pingBlocked',
                    count: 1
                });
            }
            // Send tracking blocked message for other tracking attributes
            else if (attr === 'onmousedown') {
                chrome.runtime.sendMessage({
                    type: 'trackingBlocked',
                    count: 1
                });
            }
            
            node.removeAttribute(attr);
        }
    });
    
    // Clean href tracking parameters
    if (node.hasAttribute('href')) {
        const originalHref = node.getAttribute('href');
        if (isValidUrl(originalHref)) {
            const cleanedHref = cleanUrl(originalHref);
            if (cleanedHref !== originalHref) {
                console.log('[GoogleGuard] Cleaned URL:', {
                    from: originalHref,
                    to: cleanedHref
                });
                node.setAttribute('href', cleanedHref);
            }
        }
    }
    
    // Clean form elements
    if (node.tagName === 'FORM') {
        const trackingInputs = node.querySelectorAll('input[name*="ei"], input[name*="ved"]');
        trackingInputs.forEach(input => input.remove());
        node.removeAttribute('onsubmit');
    }
    
    // Clean image elements
    if (node.tagName === 'IMG' && node.src) {
        try {
            const url = new URL(node.src);
            ['ved', 'ei', 'tracking'].forEach(param => {
                url.searchParams.delete(param);
            });
            node.src = url.toString();
        } catch (error) {
            // Invalid URL, ignore
        }
    }
    
    // Recursively clean child nodes
    if (node.querySelectorAll) {
        const elements = node.querySelectorAll('a[ping], a[onmousedown], a[href*="google"], form, img');
        elements.forEach(element => cleanNode(element));
    }
}

function isValidUrl(string) {
    try {
        if (string.startsWith('/')) return true;
        new URL(string);
        return true;
    } catch (e) {
        return false;
    }
}

function cleanUrl(url) {
    try {
        const baseUrl = window.location.origin;
        const urlObj = new URL(url, baseUrl);
        
        const trackingParams = [
            'ved', 
            'ei', 
            'usg', 
            'aqs', 
            'sourceid', 
            'sca_esv',
            'ictx',
            'adview_type',
            'adview_query_id'
        ];
        
        const originalParams = new URLSearchParams(urlObj.search).toString();
        trackingParams.forEach(param => urlObj.searchParams.delete(param));
        const newParams = new URLSearchParams(urlObj.search).toString();
        
        if (originalParams !== newParams) {
            console.log('[GoogleGuard] Removed tracking parameters:', {
                from: originalParams,
                to: newParams
            });
        }
        
        const cleanedUrl = urlObj.toString();
        return url.startsWith('/') ? cleanedUrl.replace(baseUrl, '') : cleanedUrl;
        
    } catch (e) {
        console.debug('[GoogleGuard] Skipping URL cleaning for:', url);
        return url;
    }
}

function initialClean() {
    console.log('[GoogleGuard] Performing initial cleaning');
    cleanNode(document.body);
}

function removeTrackingElements() {
    const selectors = [
        'script[src*="google-analytics"]',
        'script[src*="googletagmanager"]',
        'script[src*="doubleclick"]',
        'script[src*="google-adservices"]',
        'link[href*="google-analytics"]',
        'iframe[src*="google.com/ads"]',
        'img[src*="google-analytics"]',
        'img[src*="googleads"]'
    ];
    
    selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => element.remove());
    });
}

function setupEventCleaning() {
    document.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'A') {
            e.stopPropagation();
        }
    }, true);
    
    document.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') {
            e.stopPropagation();
        }
    }, true);
}

