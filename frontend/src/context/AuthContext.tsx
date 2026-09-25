import React, { createContext, useState, useEffect, ReactNode } from "react";
import apiClient, { setAccessToken, refreshAccessToken } from "@/libs/apiClient";

interface AuthPayload {
    email: string;
    password: string;
    username?: string;
    name?: string;
    confirmPassword?: string;
}

interface User {
    id: number;
    email: string;
    username: string;
    role: string;
    isActive: boolean;
    isFrozen: boolean;
    createdAt: string;
    wallet: {
        walletId: string;
        balance: string;
    } | null;
    kycProfile: {
        verificationStatus: string;
        fullName: string;
        idType: string;
    } | null;
}

interface Props {
    children: ReactNode;
}

export interface AuthContextType {
    user: User | null;
    loading: boolean;
    isLoggedIn: boolean;
    completedKyc: boolean;
    register: (payload: AuthPayload) => Promise<void>;
    login: (payload: AuthPayload) => Promise<void>;
    logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    isLoggedIn: false,
    completedKyc: false,
    register: async () => {},
    login: async () => {},
    logout: async () => {},
});

export const AuthProvider: React.FC<Props> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const initializeAuth = async () => {
            try {
                // Restore session: refresh via the shared lock (deduplicates parallel
                // refresh calls), then fetch the current user's profile.
                const token = await refreshAccessToken();
                if (!token) {
                    setUser(null);
                    return;
                }

                const userResponse = await apiClient.get("/user/profile");
                setUser(userResponse.data.data);
            } catch (error) {
                setUser(null);
                setAccessToken(null);
                console.log("Auth initialization failed:", error);
            } finally {
                setLoading(false);
            }
        };

        initializeAuth();
    }, []);

    const fetchCurrentUser = async () => {
        const res = await apiClient.get("/user/profile");
        setUser(res.data.data);
    };

    const register = async (payload: AuthPayload) => {
        const { data } = await apiClient.post("/auth/register", {
            email: payload.email,
            password: payload.password,
            confirmPassword: payload.confirmPassword ?? payload.password,
            name: payload.name,
        });
        setAccessToken(data.data.accessToken);
        await fetchCurrentUser();
    };

    const login = async (payload: AuthPayload) => {
        const { data } = await apiClient.post("/auth/login", {
            email: payload.email,
            password: payload.password,
        });

        // Handle 2FA required case
        if (data.twoFactorRequired) {
            throw { twoFactorRequired: true, tempToken: data.tempToken };
        }

        setAccessToken(data.data.accessToken);
        await fetchCurrentUser();
    };

    const logout = async () => {
        try {
            await apiClient.post("/auth/logout");
        } catch (error) {
            console.error("Logout error:", error);
        } finally {
            setAccessToken(null);
            setUser(null);
        }
    };

    const isLoggedIn = !!user;
    const completedKyc = user?.kycProfile?.verificationStatus === "VERIFIED";

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                isLoggedIn,
                completedKyc,
                register,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};