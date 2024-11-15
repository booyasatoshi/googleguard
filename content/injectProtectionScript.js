(function() {
    console.log('[GoogleGuard] Starting protection script execution');

    // Helper function to check if chrome runtime is available
    const isExtensionContextValid = () => {
        try {
            return !!(chrome && chrome.runtime && chrome.runtime.sendMessage);
        } catch (error) {
            return false;
        }
    };

    // Existing tracking function overrides
    window.ga = function() {
        console.log('Google Analytics call blocked');
    };
    window.gtag = function() {
        console.log('Google Tag Manager call blocked');
    };
    window._gaq = {
        push: function() {
            console.log('Google Analytics queue push blocked');
        }
    };

    // Block storage access - keeping existing functionality
    Object.defineProperty(window, 'localStorage', {
        get: function() {
            console.log('Access to localStorage blocked');
            return {
                getItem: function() { return null; },
                setItem: function() {},
                removeItem: function() {},
                clear: function() {},
                length: 0
            };
        }
    });

    // Prevent beacon sending - keeping existing functionality
    navigator.sendBeacon = function() { 
        console.log('SendBeacon blocked');
        return false;
    };

    // Clean performance API - keeping existing functionality
    if (window.performance) {
        window.performance.mark = function() {
            console.log('Performance mark blocked');
        };
        window.performance.measure = function() {
            console.log('Performance measure blocked');
        };
    }

    // Block tracking pixels - keeping existing functionality
    const originalImage = window.Image;
    window.Image = function() {
        console.log('Tracking pixel blocked');
        const image = new originalImage(...arguments);
        image.src = '';
        return image;
    };

    // Add behavioral data poisoning
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

    // Store the interval ID for cleanup
    let updateInterval = null;

    // Create a function to update behavioral data
    const updateBehavioralData = () => {
        Object.assign(window.__userBehavior, {
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
        });
        console.log('[GoogleGuard] Updated behavioral data:', window.__userBehavior);

        // Report update if extension context is valid
        if (isExtensionContextValid()) {
            try {
                chrome.runtime.sendMessage({
                    type: 'dataPoisoned',
                    count: 1
                }, response => {
                    if (chrome.runtime.lastError) {
                        if (updateInterval) {
                            clearInterval(updateInterval);
                            updateInterval = null;
                        }
                    }
                });
            } catch (error) {
                if (updateInterval) {
                    clearInterval(updateInterval);
                    updateInterval = null;
                }
            }
        }
    };

    // Start the interval with context checking
    if (isExtensionContextValid()) {
        try {
            chrome.runtime.sendMessage({
                type: 'dataPoisoned',
                count: 1
            }, response => {
                if (!chrome.runtime.lastError) {
                    updateInterval = setInterval(updateBehavioralData, 5000);
                }
            });
        } catch (error) {
            console.log('Initial message failed:', error);
        }
    }

    console.log('[GoogleGuard] Protection script initialized successfully');
})();
