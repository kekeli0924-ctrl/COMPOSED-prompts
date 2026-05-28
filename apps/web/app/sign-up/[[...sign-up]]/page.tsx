import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <main className="mx-auto flex max-w-md justify-center px-6 py-16">
      <SignUp />
    </main>
  );
}
