(() => {
    console.log('[GoogleGuard] Starting navigator API interception and poisoning');
    
    // Initial context validation
    if (!chrome?.runtime?.id) {
        console.log('[GoogleGuard] Extension context invalid at startup');
        return;
    }
    
    let isExtensionValid = true;
    
    // Random value generators
    const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const getRandomFloat = (min, max) => Math.random() * (max - min) + min;
    const getRandomBool = () => Math.random() > 0.5;
    const getRandomFromArray = (arr) => arr[Math.floor(Math.random() * arr.length)];
    
    // Connection generator
    const getRandomConnection = () => ({
        type: getRandomFromArray(['wifi', '4g', '3g', 'ethernet', 'cellular', 'bluetooth', 'wimax']),
        effectiveType: getRandomFromArray(['slow-2g', '2g', '3g', '4g']),
        downlink: getRandomFloat(0.5, 50),
        downlinkMax: getRandomFloat(50, 100),
        rtt: getRandomInt(20, 1000),
        saveData: getRandomBool()
    });
    
    // Battery generator
    const getRandomBattery = () => ({
        charging: getRandomBool(),
        chargingTime: getRandomInt(0, 3600),
        dischargingTime: getRandomInt(300, 7200),
        level: getRandomFloat(0, 1)
    });
    
    // Device memory and hardware values
    const getRandomHardware = () => ({
        deviceMemory: getRandomFromArray([0.5, 1, 2, 4, 8, 16, 32]),
        hardwareConcurrency: getRandomInt(1, 32),
        maxTouchPoints: getRandomInt(0, 10)
    });
    
    // Platform and OS data
    const platforms = [
        'Win32',
        'Linux x86_64',
        'MacIntel',
        'Linux armv8l',
        'Linux aarch64',
        'Android',
        'iPhone',
        'iPad'
    ];
    
    const vendors = [
        'Google Inc.',
        'Apple Computer, Inc.',
        'Mozilla',
        'Microsoft',
        ''
    ];
    
    const languages = [
        'en-US',
        'en-GB',
        'fr-FR',
        'de-DE',
        'es-ES',
        'zh-CN',
        'ja-JP',
        'ko-KR',
        'ru-RU'
    ];
    
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    ];
    
    let initialized = false;
    let connectionObj = null;
    
    // Check extension context before operations
    const checkExtensionContext = () => {
        try {
            return !!(chrome?.runtime?.id);
        } catch (error) {
            console.log('[GoogleGuard] Extension context check failed');
            isExtensionValid = false;
            return false;
        }
    };
    
    // Notify background of poisoning with context check
    const reportPoisoning = () => {
        if (!isExtensionValid || !chrome?.runtime) return;
        
        try {
            const message = {
                type: 'dataPoisoned',
                count: 1
            };

            chrome.runtime.sendMessage(message, response => {
                if (chrome.runtime.lastError) {
                    isExtensionValid = false;
                    if (updateInterval) {
                        clearInterval(updateInterval);
                        updateInterval = null;
                    }
                }
            });
        } catch (error) {
            isExtensionValid = false;
            if (updateInterval) {
                clearInterval(updateInterval);
                updateInterval = null;
            }
            console.log('[GoogleGuard] Extension context error:', error);
        }
    };
    
    // Property definition with error handling
    const definePropertySafely = (obj, prop, descriptor) => {
        try {
            const existingDescriptor = Object.getOwnPropertyDescriptor(obj, prop);
            if (existingDescriptor && !existingDescriptor.configurable) {
                console.log(`[GoogleGuard] Property ${prop} is not configurable, using alternative method`);
                if (existingDescriptor.get) {
                    const originalGetter = existingDescriptor.get;
                    Object.defineProperty(obj, prop, {
                        ...existingDescriptor,
                        get: function() {
                            const originalValue = originalGetter.call(this);
                            return descriptor.get ? descriptor.get.call(this, originalValue) : descriptor.value;
                        }
                    });
                }
                return false;
            }
            Object.defineProperty(obj, prop, descriptor);
            return true;
        } catch (error) {
            console.log(`[GoogleGuard] Unable to modify ${prop}:`, error);
            return false;
        }
    };
    
    // Main poisoning function with context checking
    const poisonNavigator = () => {
        if (!checkExtensionContext()) return;
        
        const hardware = getRandomHardware();
        
        if (!initialized) {
            // First-time setup
            const navigatorProps = {
                hardwareConcurrency: { get: () => hardware.hardwareConcurrency },
                deviceMemory: { get: () => hardware.deviceMemory },
                maxTouchPoints: { get: () => hardware.maxTouchPoints },
                platform: { get: () => getRandomFromArray(platforms) },
                vendor: { get: () => getRandomFromArray(vendors) },
                language: { get: () => getRandomFromArray(languages) },
                languages: { get: () => [getRandomFromArray(languages), getRandomFromArray(languages)] },
                onLine: { get: () => getRandomBool() },
                doNotTrack: { get: () => getRandomFromArray(['1', '0', 'unspecified', null]) },
                webdriver: { get: () => false },
                pdfViewerEnabled: { get: () => getRandomBool() },
                cookieEnabled: { get: () => true },
                appCodeName: { get: () => 'Mozilla' },
                appName: { get: () => getRandomFromArray(['Netscape', 'Mozilla']) },
                appVersion: { get: () => getRandomFromArray(userAgents).split('Mozilla/5.0 ')[1] },
                product: { get: () => 'Gecko' },
                productSub: { get: () => '20030107' }
            };
            
            // Define properties with error handling
            Object.keys(navigatorProps).forEach(prop => {
                definePropertySafely(Navigator.prototype, prop, navigatorProps[prop]);
            });
            
            // Connection handling with Proxy
            if ('connection' in navigator) {
                try {
                    const originalConnection = navigator.connection;
                    const connectionProxy = new Proxy(originalConnection, {
                        get: function(target, prop) {
                            if (prop === 'type') return getRandomFromArray(['wifi', '4g', '3g', 'ethernet']);
                            if (prop === 'effectiveType') return getRandomFromArray(['slow-2g', '2g', '3g', '4g']);
                            if (prop === 'downlink') return getRandomFloat(0.5, 50);
                            if (prop === 'rtt') return getRandomInt(20, 1000);
                            if (prop === 'saveData') return getRandomBool();
                            if (prop === 'addEventListener' || prop === 'removeEventListener') {
                                return function() {}; // No-op event listeners
                            }
                            return target[prop];
                        }
                    });
                    
                    try {
                        Object.defineProperty(navigator, 'connection', {
                            get: () => connectionProxy,
                            configurable: true
                        });
                    } catch (connError) {
                        console.log('[GoogleGuard] Using fallback connection spoofing');
                        const connProto = Object.getPrototypeOf(navigator.connection);
                        Object.keys(getRandomConnection()).forEach(key => {
                            definePropertySafely(connProto, key, {
                                get: () => getRandomConnection()[key]
                            });
                        });
                    }
                } catch (error) {
                    console.log('[GoogleGuard] Connection spoofing failed:', error);
                }
            }
            
            // Override battery API
            if ('getBattery' in navigator) {
                try {
                    navigator.getBattery = () => Promise.resolve(getRandomBattery());
                } catch (error) {
                    console.log('[GoogleGuard] Battery API spoofing failed:', error);
                }
            }
            
            // Screen properties
            const screenProps = {
                width: { get: () => getRandomInt(1024, 3840) },
                height: { get: () => getRandomInt(768, 2160) },
                availWidth: { get: () => getRandomInt(1024, 3840) },
                availHeight: { get: () => getRandomInt(768, 2160) },
                colorDepth: { get: () => getRandomFromArray([24, 30, 48]) },
                pixelDepth: { get: () => getRandomFromArray([24, 30, 48]) }
            };
            
            Object.keys(screenProps).forEach(prop => {
                definePropertySafely(Screen.prototype, prop, screenProps[prop]);
            });
            
            initialized = true;
        }
        
        // Only report if context is still valid
        if (isExtensionValid) {
            reportPoisoning();
        }
    };
    
    // Canvas poisoning
    const poisonCanvas = () => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, attributes) {
            const context = getContext.call(this, type, attributes);
            if (context && type === '2d') {
                const originalGetImageData = context.getImageData;
                context.getImageData = function() {
                    const imageData = originalGetImageData.apply(this, arguments);
                    const pixels = imageData.data;
                    for (let i = 0; i < pixels.length; i += 4) {
                        pixels[i] += getRandomInt(-1, 1);     // Red
                        pixels[i + 1] += getRandomInt(-1, 1); // Green
                        pixels[i + 2] += getRandomInt(-1, 1); // Blue
                    }
                    return imageData;
                };
            }
            return context;
        };
    };
    
    // Keep existing beacon blocking
    navigator.sendBeacon = function() { return false; };
    
    // Add context listener
    try {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            // Keep connection alive
            return true;
        });
    } catch (error) {
        console.log('[GoogleGuard] Extension context already invalid');
        isExtensionValid = false;
    }
    
    // Initialize poisoning with context checking
    const initPoisoning = () => {
        if (!checkExtensionContext()) {
            console.log('[GoogleGuard] Skipping initialization due to invalid context');
            return;
        }
        
        try {
            poisonNavigator();
            poisonCanvas();
            
            if (isExtensionValid) {
                console.log('[GoogleGuard] Navigator APIs poisoned:', {
                    userAgent: navigator.userAgent,
                    platform: navigator.platform,
                    vendor: navigator.vendor,
                    memory: navigator.deviceMemory,
                    cores: navigator.hardwareConcurrency,
                    language: navigator.language,
                    languages: navigator.languages,
                    connection: navigator.connection,
                    screen: {
                        width: screen.width,
                        height: screen.height,
                        colorDepth: screen.colorDepth
                    }
                });
            }
        } catch (error) {
            console.log('[GoogleGuard] Error during initialization:', error);
            if (error.message.includes('Extension context invalidated')) {
                isExtensionValid = false;
            }
        }
    };
    
    // Modified interval handling
    let updateInterval;
    const startUpdateInterval = () => {
        if (updateInterval) {
            clearInterval(updateInterval);
        }
        
        updateInterval = setInterval(() => {
            if (!checkExtensionContext()) {
                console.log('[GoogleGuard] Clearing interval due to invalid context');
                clearInterval(updateInterval);
                updateInterval = null;
                return;
            }
            try {
                initPoisoning();
            } catch (error) {
                console.log('[GoogleGuard] Error during periodic update:', error);
                if (error.message.includes('Extension context invalidated')) {
                    clearInterval(updateInterval);
                    updateInterval = null;
                    isExtensionValid = false;
                }
            }
        }, 5000);
    };
    
    // Cleanup handler
    const cleanup = () => {
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
        isExtensionValid = false;
        console.log('[GoogleGuard] Extension cleanup completed');
    };
    
    // Listen for unload/disable events
    try {
        chrome.runtime.onSuspend.addListener(cleanup);
    } catch (error) {
        console.log('[GoogleGuard] Error setting up cleanup handlers:', error);
    }
    
    // Initial run with context checking
    if (checkExtensionContext()) {
        initPoisoning();
        startUpdateInterval();
    }
    
})();
