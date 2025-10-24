export const dynamic = 'force-dynamic'

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return redirect("/");
  }

  // Await searchParams as required by Next.js 15
  const params = await searchParams;

  const signIn = async (formData: FormData) => {
    "use server";

    const email = formData.get("email") as string;
    const supabase = await createClient();
    const headersList = await headers();
    const origin = headersList.get("origin");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // This is the URL to which the user will be redirected after clicking
        // the magic link.
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });

    if (error) {
      return redirect(`/login?message=Could not authenticate user`);
    }

    return redirect(`/login?message=Check email to continue sign in process`);
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <div className="w-full max-w-md rounded-lg border p-6 shadow-md">
        <h1 className="mb-4 text-2xl font-bold">Welcome to Youtube AI Chat</h1>
        <p className="mb-6 text-muted-foreground">
          Sign in via magic link with your email below
        </p>
        <form action={signIn} className="flex flex-col gap-4">
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              type="email"
              id="email"
              name="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <Button type="submit">Send Magic Link</Button>
          {params?.message && (
            <p className="mt-4 bg-foreground/10 p-4 text-center text-foreground">
              {params.message}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}