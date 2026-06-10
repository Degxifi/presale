import { createAuthClient } from "better-auth/react";

/** Browser auth client — same-origin (baseURL defaults to the current origin). */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
