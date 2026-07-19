import { SignUp } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";

export default function SignUpPage() {
  return (
    <main className="auth-shell">
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <SignUp signInUrl="/sign-in" />
    </main>
  );
}
