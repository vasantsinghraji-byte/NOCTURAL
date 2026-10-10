import { redirect } from 'next/navigation';

/** Old address: sign-up now lives at /signup. */
export default function RegisterRedirect() {
  redirect('/signup');
}
