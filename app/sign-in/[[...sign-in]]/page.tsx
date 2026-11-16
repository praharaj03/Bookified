import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return <main className="wrapper flex min-h-screen items-center justify-center py-28"><SignIn /></main>;
}
