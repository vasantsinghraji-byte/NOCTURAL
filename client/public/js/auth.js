class AuthService {
    static TOKEN_KEY = 'token';
    static USER_KEY = 'user';

    static buildApiUrl(endpoint) {
        const normalizedEndpoint = endpoint.replace(/^\//, '');

        if (typeof AppConfig !== 'undefined' && typeof AppConfig.api === 'function') {
            return AppConfig.api(normalizedEndpoint);
        }

        return `/api/v1/${normalizedEndpoint}`;
    }

    static request(endpoint, options = {}) {
        const normalizedEndpoint = endpoint.replace(/^\//, '');

        if (typeof AppConfig !== 'undefined' && typeof AppConfig.fetch === 'function') {
            return AppConfig.fetch(normalizedEndpoint, options);
        }

        const requestOptions = { ...options };
        const shouldParseJson = requestOptions.parseJson === true;
        const shouldParseText = requestOptions.parseText === true;

        delete requestOptions.parseJson;
        delete requestOptions.parseText;

        return fetch(this.buildApiUrl(normalizedEndpoint), requestOptions).then(async (response) => {
            if (!shouldParseJson) {
                if (!shouldParseText) {
                    return response;
                }

                const text = await response.text();

                if (!response.ok) {
                    throw new Error(text || 'Request failed');
                }

                return text;
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error((data && data.message) || 'Request failed');
            }

            return data;
        });
    }

    static async login(email, password) {
        try {
            const data = await this.request('auth/login', {
                method: 'POST',
                skipAuth: true,
                parseJson: true,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include' // For secure cookies
            });
            this.setSession(data);
            return data;
        } catch (error) {
            console.error('Auth error:', error);
            throw error;
        }
    }

    static async register(userData) {
        try {
            const data = await this.request('auth/register', {
                method: 'POST',
                skipAuth: true,
                parseJson: true,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData),
                credentials: 'include'
            });
            this.setSession(data);
            return data;
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    static setSession(authData) {
        if (authData.token) {
            localStorage.setItem(this.TOKEN_KEY, authData.token);
            localStorage.setItem(this.USER_KEY, JSON.stringify(authData.user));
        }
    }

    static clearSession() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_KEY);
        localStorage.removeItem('userType');
    }

    static isAuthenticated() {
        return !!localStorage.getItem(this.TOKEN_KEY);
    }
}
