"use client";

import React from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { appApiPost } from "@/lib/app-api-client";

interface PayPalCheckoutButtonProps {
  clientId: string;
  userId: string;
  planCode?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  disabled?: boolean;
  locale?: string;
}

export function PayPalCheckoutButton({
  clientId,
  userId,
  planCode = "pro",
  onSuccess,
  onError,
  disabled = false,
  locale = "en",
}: PayPalCheckoutButtonProps) {
  if (!clientId) return null;

  return (
    <PayPalScriptProvider
      options={{
        clientId,
        currency: "USD",
        intent: "capture",
      }}
    >
      <PayPalButtons
        disabled={disabled}
        style={{
          layout: "vertical",
          color: "blue",
          shape: "rect",
          label: "paypal",
          height: 45,
        }}
        createOrder={async () => {
          const res = await appApiPost<{ ok: boolean; orderId: string }>(
            "/account/billing/checkout",
            { plan: planCode },
            {
              headers: { "x-omytree-user-id": userId },
              cache: "no-store",
            }
          );
          if (!res.ok || !res.orderId) {
            throw new Error("Failed to create order");
          }
          return res.orderId;
        }}
        onApprove={async (data) => {
          const res = await appApiPost<{ ok: boolean; status: string }>(
            "/account/billing/capture",
            { orderId: data.orderID },
            {
              headers: { "x-omytree-user-id": userId },
              cache: "no-store",
            }
          );
          if (res.ok && res.status === "COMPLETED") {
            onSuccess?.();
          } else {
            onError?.(new Error("Payment capture failed"));
          }
        }}
        onError={(err) => {
          console.error("[PayPal] Error:", err);
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }}
        onCancel={() => {
          // User closed PayPal popup — silently ignore
        }}
      />
    </PayPalScriptProvider>
  );
}
