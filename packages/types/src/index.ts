export interface User {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
}

// TODO senior: expand domain types as Prisma models stabilize (Session, Content, Subscription, etc.)
