import { useEffect } from "react";
import { toast, ToastContainer, Slide } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { onToast, type ToastEvent } from "../lib/toastBus";
import "./ToastBridge.css";

const ICONS: Record<ToastEvent["kind"], string> = {
  info: "ℹ",
  success: "✓",
  warning: "⚠",
  "ticket-moved": "▤",
  "teammate-joined": "◉",
  "message-flagged": "🚩",
};

export function ToastBridge() {
  useEffect(() => {
    return onToast((event) => {
      toast(event.message, {
        icon: () => ICONS[event.kind],
        className: `agp-toast agp-toast-${event.kind}`,
      });
    });
  }, []);

  return (
    <ToastContainer
      position="bottom-right"
      autoClose={4000}
      newestOnTop
      closeOnClick
      pauseOnHover
      theme="dark"
      transition={Slide}
    />
  );
}
