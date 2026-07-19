import { SignIn } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";

export default function SignInPage() {
  return (
    <main className="auth-shell">
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <SignIn signUpUrl="/sign-up" />
    </main>
  );
}
