import NextAuth, { NextAuthOptions, Session, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import dbConnect from "@/lib/mongodb";
import UserModel from "@/models/User";
import bcrypt from "bcryptjs";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      isAdmin: boolean;
      role: string;
    };
  }

  interface User {
    id: string;
    username: string;
    isAdmin: boolean;
    role: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    isAdmin: boolean;
    role: string;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials): Promise<User | null> {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        await dbConnect();

        // Find user in database
        const user = await UserModel.findOne({
          username: credentials.username,
        });

        if (!user) {
          // Check for default admin credentials (for initial setup)
          if (
            credentials.username === process.env.ADMIN_USERNAME &&
            credentials.password === process.env.ADMIN_PASSWORD
          ) {
            // Create default admin user if it doesn't exist
            const hashedPassword = await bcrypt.hash(credentials.password, 12);
            const newAdmin = await UserModel.create({
              username: credentials.username,
              passwordHash: hashedPassword,
              role: "admin",
              isAdmin: true,
            });

            return {
              id: newAdmin._id.toString(),
              username: newAdmin.username,
              isAdmin: true,
              role: "admin",
            };
          }
          return null;
        }

        // Verify password
        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash,
        );

        if (!isValid) {
          return null;
        }

        return {
          id: user._id.toString(),
          username: user.username,
          isAdmin: user.isAdmin,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.isAdmin = user.isAdmin;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id as string,
        username: token.username as string,
        isAdmin: token.isAdmin as boolean,
        role: token.role as string,
      };
      return session;
    },
  },
  pages: {
    signIn: "/admin/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
