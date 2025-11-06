import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";

// ====================================================================
// ADMIN AUTHENTICATION HOOK
// Manages JWT token state and authentication flow
// ====================================================================

interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useAdminAuth() {
  const { publicKey, signMessage } = useWallet();
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    token: null,
    isLoading: true,
    error: null,
  });

  // 1️⃣ Check for existing token on mount
  useEffect(() => {
    const checkExistingAuth = async () => {
      const storedToken = localStorage.getItem("admin_token");
      
      if (!storedToken) {
        setAuthState({
          isAuthenticated: false,
          token: null,
          isLoading: false,
          error: null,
        });
        return;
      }

      // Verify token is still valid
      try {
        const response = await fetch("/api/admin/auth", {
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        });

        if (response.ok) {
          setAuthState({
            isAuthenticated: true,
            token: storedToken,
            isLoading: false,
            error: null,
          });
        } else {
          // Token invalid/expired, clear it
          localStorage.removeItem("admin_token");
          setAuthState({
            isAuthenticated: false,
            token: null,
            isLoading: false,
            error: "Session expired",
          });
        }
      } catch (error) {
        console.error("Token verification error:", error);
        localStorage.removeItem("admin_token");
        setAuthState({
          isAuthenticated: false,
          token: null,
          isLoading: false,
          error: "Failed to verify session",
        });
      }
    };

    checkExistingAuth();
  }, []);

  // 2️⃣ Login function - signs message and gets JWT token
  const login = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setAuthState((prev) => ({
        ...prev,
        error: "Wallet not connected or does not support message signing",
      }));
      return false;
    }

    setAuthState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      // Create message to sign
      const message = `Sign this message to authenticate as admin.\n\nWallet: ${publicKey.toString()}\nTimestamp: ${Date.now()}`;
      const messageBytes = new TextEncoder().encode(message);

      // Request signature from wallet
      const signature = await signMessage(messageBytes);

      // Convert signature to base58
      const signatureBase58 = bs58.encode(signature);

      // Send to backend for verification
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          wallet: publicKey.toString(),
          signature: signatureBase58,
          message,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      // Store token
      localStorage.setItem("admin_token", data.token);

      setAuthState({
        isAuthenticated: true,
        token: data.token,
        isLoading: false,
        error: null,
      });

      console.log("✅ Admin authenticated successfully");
      return true;
    } catch (error: any) {
      console.error("❌ Login error:", error);
      setAuthState({
        isAuthenticated: false,
        token: null,
        isLoading: false,
        error: error.message || "Authentication failed",
      });
      return false;
    }
  }, [publicKey, signMessage]);

  // 3️⃣ Logout function
  const logout = useCallback(() => {
    localStorage.removeItem("admin_token");
    setAuthState({
      isAuthenticated: false,
      token: null,
      isLoading: false,
      error: null,
    });
    console.log("🔓 Admin logged out");
  }, []);

  // 4️⃣ Helper to get auth headers for API calls
  const getAuthHeaders = useCallback(() => {
    if (!authState.token) {
      return {};
    }
    return {
      Authorization: `Bearer ${authState.token}`,
    };
  }, [authState.token]);

  return {
    ...authState,
    login,
    logout,
    getAuthHeaders,
  };
}
