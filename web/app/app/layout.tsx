import type { ReactNode } from "react";
import { AppQueryProvider } from "./AppQueryProvider";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppQueryProvider>{children}</AppQueryProvider>;
}
