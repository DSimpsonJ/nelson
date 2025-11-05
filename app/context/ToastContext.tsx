"use client";
import React, { createContext, useContext, useState } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: Toast | null;
  showToast: (toast: Toast) => void;
  clearToast: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (toast: Toast) => {
    setToast(toast);
    setTimeout(() => setToast(null), 3000);
  };

  const clearToast = () => setToast(null);

  return (
    <ToastContext.Provider value={{ toast, showToast, clearToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function ToastRenderer() {
  const { toast } = useToast();

  if (!toast) return null;

  return (
    <div
      className={`
        fixed bottom-5 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-white 
        ${
          toast.type === "success"
            ? "bg-green-600"
            : toast.type === "error"
            ? "bg-red-600"
            : "bg-blue-600"
        }
      `}
    >
      {toast.message}
    </div>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
};