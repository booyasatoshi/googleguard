// interceptStorageAPIs.js

Object.defineProperty(window, 'localStorage', {
    get: function() {
        return {
            getItem: function() { return null; },
            setItem: function() {},
            removeItem: function() {},
            clear: function() {},
            length: 0
        };
    }
});

Object.defineProperty(window, 'sessionStorage', {
    get: function() {
        return {
            getItem: function() { return null; },
            setItem: function() {},
            removeItem: function() {},
            clear: function() {},
            length: 0
        };
    }
});
