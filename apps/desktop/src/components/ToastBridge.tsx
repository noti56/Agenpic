import { useEffect } from "react";
import { toast, ToastContainer, Slide } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
// Deep-imported per icon (see the matching note in screens/Shell.tsx) so
// the bundle only includes the handful of icons actually used here.
import { Info } from "@phosphor-icons/react/Info";
import { CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { Warning } from "@phosphor-icons/react/Warning";
import { Kanban } from "@phosphor-icons/react/Kanban";
import { UserPlus } from "@phosphor-icons/react/UserPlus";
import { Flag } from "@phosphor-icons/react/Flag";
import { HandWaving } from "@phosphor-icons/react/HandWaving";
import { ChatCircle } from "@phosphor-icons/react/ChatCircle";
import { onToast, type ToastEvent } from "../lib/toastBus";
import "./ToastBridge.css";

const ICONS: Record<ToastEvent["kind"], typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: Warning,
  "ticket-moved": Kanban,
  "teammate-joined": UserPlus,
  "message-flagged": Flag,
  poke: HandWaving,
  message: ChatCircle,
};

export function ToastBridge() {
  useEffect(() => {
    return onToast((event) => {
      const Icon = ICONS[event.kind];
      toast(event.message, {
        icon: () => <Icon size={18} weight="fill" />,
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
