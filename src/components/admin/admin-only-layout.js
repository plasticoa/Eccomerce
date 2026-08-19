import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";

export async function AdminOnlyLayout({ children }) {
  const profile = await getCurrentProfile();
  if (profile?.role !== "admin") redirect("/no-autorizado");
  return children;
}

