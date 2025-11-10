import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";

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
      
      console.log('📝 Message to sign:', message);
      console.log('🔑 Wallet:', publicKey.toString());
      
      const messageBytes = new TextEncoder().encode(message);

      // Request signature from wallet
      console.log('✍️ Requesting signature from wallet...');
      const signature = await signMessage(messageBytes);
      console.log('✅ Signature received, length:', signature.length);

      // Convert signature to base58
      const signatureBase58 = bs58.encode(signature);
      console.log('📦 Signature (base58):', signatureBase58.substring(0, 20) + '...');

      const payload = {
        wallet: publicKey.toString(),
        signature: signatureBase58,
        message,
      };

      console.log('📤 Sending auth request...');
      
      // Send to backend for verification
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      console.log('📥 Response status:', response.status);
      
      const data = await response.json();
      console.log('📥 Response data:', data);

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
      console.error("❌ Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      setAuthState({
        isAuthenticated: false,
        token: null,
        isLoading: false,
        error: error.message || "Authentication failed",
      });
      return false;
    }
  }, [publicKey, signMessage]);

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