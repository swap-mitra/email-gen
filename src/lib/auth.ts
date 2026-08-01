import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { asc, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { member } from "@/db/schema";
import { getDb } from "@/lib/db";

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      accessType: "offline",
      prompt: "select_account consent",
      scope: ["https://www.googleapis.com/auth/gmail.compose"],
    },
  },
  plugins: [organization()],
  databaseHooks: {
    session: {
      create: {
        /**
         * Better-Auth mints every session with a null `activeOrganizationId`,
         * so a returning member would land on the "create your first
         * workspace" screen each time they signed back in. Seed the session
         * with their oldest membership; the header switcher still lets them
         * change it, and that choice persists for the life of the session.
         */
        async before(session) {
          const membership = await getDb().query.member.findFirst({
            where: eq(member.userId, session.userId),
            orderBy: [asc(member.createdAt)],
          });

          if (!membership) return;
          // ponytail: oldest membership wins; track a last-used-workspace
          // column if members with several workspaces start re-switching on
          // every sign-in.
          return { data: { ...session, activeOrganizationId: membership.organizationId } };
        },
      },
    },
  },
});
