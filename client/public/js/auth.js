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

        return fetch(this.buildApiUrl(normalizedEndpoint), options);
    }

    static async login(email, password) {
        try {
            const response = await this.request('auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include' // For secure cookies
            });

            if (!response.ok) {
                throw new Error('Login failed');
            }

            const data = await response.json();
            this.setSession(data);
            return data;
        } catch (error) {
            console.error('Auth error:', error);
            throw error;
        }
    }

    static async register(userData) {
        try {
            const response = await this.request('auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData),
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error('Registration failed');
            }

            const data = await response.json();
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
