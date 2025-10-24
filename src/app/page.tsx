import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppLayout from "./_components/app-layout";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  return <AppLayout />;
}