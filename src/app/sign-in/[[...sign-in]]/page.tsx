import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="auth-shell">
      <SignIn signUpUrl="/sign-up" />
    </main>
  );
}
